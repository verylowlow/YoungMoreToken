import { prisma } from "./db";
import { listCandidates, resolveKey } from "./router";
import { getAdapter } from "@/providers/registry";
import { saveOutputMedia } from "./media";
import { getAllSettings, getRoutingConfig } from "./settings";
import type { NormalizedRequest, UpstreamJob } from "./types";

// ===== 任务队列 =====
// DB 持久化队列 + 进程内 worker：重启不丢任务；全局并发默认 2；
// 每个任务按 maxAttempts 尝试多个候选源，失败自动 fallback。

const TICK_MS = 2000;
const POLL_MS = 3000;
const TASK_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CONCURRENT = 2;

let running = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 日/月切重置：到点把额度账本归零并记账 */
async function processResets() {
  const now = new Date();
  const due = await prisma.apiKey.findMany({
    where: { resetRule: { not: "none" }, resetAt: { lte: now } },
  });
  for (const k of due) {
    await prisma.$transaction([
      prisma.apiKey.update({
        where: { id: k.id },
        data: {
          quotaUsed: 0,
          cooldownTill: null,
          status: k.status === "exhausted" ? "active" : k.status,
          resetAt: k.resetRule === "daily" ? new Date(Date.now() + 86400_000) : nextMonth(),
        },
      }),
      prisma.quotaEvent.create({ data: { apiKeyId: k.id, delta: -(k.quotaUsed), reason: "reset" } }),
    ]);
  }
}

function nextMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

async function markKeyFailed(keyId: string, cls: string) {
  const now = new Date();
  const data: Record<string, unknown> = {};
  if (cls === "auth_invalid") {
    data.status = "invalid";
  } else if (cls === "quota_exhausted") {
    const k = await prisma.apiKey.findUnique({ where: { id: keyId } });
    if (k?.quotaTotal) data.quotaUsed = k.quotaTotal;
    data.cooldownTill = k?.resetAt && k.resetAt > now ? k.resetAt : new Date(now.getTime() + 24 * 3600_000);
  } else if (cls === "rate_limited") {
    data.cooldownTill = new Date(now.getTime() + 5 * 60 * 1000);
  } else if (cls === "unavailable") {
    // 环境缺依赖：停用该源。用户在设置页重新测试通过后自动恢复 active。
    data.status = "invalid";
  }
  await prisma.apiKey.update({ where: { id: keyId }, data });
}

async function processTask(taskId: string) {
  // 原子领取：防止并发 tick 重复处理同一任务
  const claimed = await prisma.task.updateMany({
    where: { id: taskId, status: "queued" },
    data: { status: "running", startedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return;

  const req: NormalizedRequest = JSON.parse(task.request);
  const settings = await getAllSettings();
  const { strategy, maxAttempts } = getRoutingConfig(settings);

  const usedKeyIds: string[] = [];
  let lastError = "无可用候选源";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidates = await listCandidates(req, usedKeyIds);
    if (!candidates.length) break;

    // quality_first：前 3 名随机（避免瞬时打满同一 key）；其余策略取第一名
    const pool = strategy === "quality_first" ? candidates.slice(0, 3) : candidates.slice(0, 1);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    usedKeyIds.push(pick.keyId);

    const key = await resolveKey(pick.keyId);
    const adapter = getAdapter(pick.providerSlug);
    if (!key || !adapter) continue;

    const started = Date.now();
    try {
      let job: UpstreamJob = await adapter.submit(req, key);

      // 异步任务：轮询到终态
      if (job.status !== "succeeded" && job.status !== "failed" && adapter.poll) {
        const deadline = Date.now() + TASK_TIMEOUT_MS;
        while (Date.now() < deadline) {
          await sleep(POLL_MS);
          job = await adapter.poll(job, key);
          if (job.status === "succeeded" || job.status === "failed") break;
        }
        if (job.status !== "succeeded" && job.status !== "failed") {
          throw Object.assign(new Error("上游任务超时"), { errorClass: "transient" });
        }
      }

      if (job.status === "failed") {
        lastError = job.error ?? "上游任务失败";
        await markKeyFailed(pick.keyId, "transient");
        continue;
      }

      // ===== 成功：落媒体 + 扣额度 + 记健康 =====
      const cap = adapter.capabilities();
      const mediaIds: string[] = [];
      for (const u of job.mediaUrls ?? []) {
        const rec = u.startsWith("data:")
          ? await saveOutputMedia(taskId, req.modality, { base64: u, mime: u.slice(5, u.indexOf(";")) }, { watermark: cap.watermark_on_free, durationMs: req.duration_s ? req.duration_s * 1000 : undefined })
          : await saveOutputMedia(taskId, req.modality, { url: u }, { watermark: cap.watermark_on_free, durationMs: req.duration_s ? req.duration_s * 1000 : undefined });
        mediaIds.push(rec.id);
      }

      const cost = cap.cost_per_call ?? 1;
      const keyRow = await prisma.apiKey.findUnique({ where: { id: pick.keyId } });
      const newAvg = keyRow ? Math.round((Date.now() - started + keyRow.avgLatencyMs) / 2) : 0;
      await prisma.$transaction([
        prisma.apiKey.update({
          where: { id: pick.keyId },
          data: {
            quotaUsed: { increment: cost },
            successCount: { increment: 1 },
            health: { increment: 0.02 },
            avgLatencyMs: newAvg,
          },
        }),
        prisma.quotaEvent.create({ data: { apiKeyId: pick.keyId, delta: -cost, reason: "consume", taskId } }),
        prisma.task.update({
          where: { id: taskId },
          data: {
            status: "succeeded",
            providerId: keyRow?.providerId,
            apiKeyId: pick.keyId,
            mediaIds: JSON.stringify(mediaIds),
            costEstimate: cost,
            finishedAt: new Date(),
          },
        }),
      ]);
      // health 上限裁剪
      const k = await prisma.apiKey.findUnique({ where: { id: pick.keyId } });
      if (k && k.health > 1) await prisma.apiKey.update({ where: { id: pick.keyId }, data: { health: 1 } });
      return;
    } catch (err) {
      const cls = adapter.classifyError(err) ?? "transient";
      lastError = err instanceof Error ? err.message : String(err);
      await prisma.apiKey.update({ where: { id: pick.keyId }, data: { failCount: { increment: 1 }, health: { decrement: 0.1 } } }).catch(() => {});
      await markKeyFailed(pick.keyId, cls);
      continue;
    }
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "failed", errorCode: "all_attempts_failed", errorMsg: lastError, finishedAt: new Date() },
  });
}

async function tick() {
  try {
    await processResets();
    while (running < MAX_CONCURRENT) {
      const next = await prisma.task.findFirst({ where: { status: "queued" }, orderBy: { queuedAt: "asc" } });
      if (!next) break;
      running += 1;
      processTask(next.id)
        .catch((e) => console.error("[羊毛token] 任务处理异常:", e))
        .finally(() => {
          running -= 1;
        });
    }
  } catch (e) {
    console.error("[羊毛token] worker tick 异常:", e);
  }
}

/** 启动 worker（幂等；由 instrumentation.ts 在 Node 运行时调用） */
export function startWorker() {
  if (timer) return;
  console.log("[羊毛token] 任务队列已启动（并发 %d）", MAX_CONCURRENT);
  timer = setInterval(tick, TICK_MS);
  void tick();
}
