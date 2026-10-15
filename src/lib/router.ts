import { prisma } from "./db";
import { decrypt } from "./crypto";
import { getAdapter } from "@/providers/registry";
import { getAllSettings, getRoutingConfig } from "./settings";
import type { Capability, NormalizedRequest, ResolvedKey, ScoredKey } from "./types";

// ===== 路由引擎 =====
// 候选过滤（能力匹配 + 额度可用）→ 评分（质量/剩余量/健康度/优先级）→ 选源
// 设计参考：llm-keypool 的 capability tag + 429 冷却 + fallback 组合（已验证机制）

/** 能力匹配：用户选的参数反过来决定哪些源有资格服务 */
export function capabilitySatisfies(cap: Capability, req: NormalizedRequest): boolean {
  if (req.duration_s && cap.durations?.length && !cap.durations.includes(req.duration_s)) return false;
  if (req.ratio && cap.ratios?.length && !cap.ratios.includes(req.ratio)) return false;
  if (req.resolution && cap.resolutions?.length && !cap.resolutions.includes(req.resolution)) return false;
  if (req.first_frame && cap.first_frame === false) return false;
  if (req.last_frame && cap.last_frame === false) return false;
  if (req.ref_images?.length) {
    if (!cap.ref_images || req.ref_images.length > cap.ref_images.max) return false;
  }
  if (req.audio?.enabled && cap.native_audio === false) return false;
  return true;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** 列出可用候选（按分数降序） */
export async function listCandidates(req: NormalizedRequest, excludeKeyIds: string[] = []): Promise<ScoredKey[]> {
  const settings = await getAllSettings();
  const { strategy, weights } = getRoutingConfig(settings);
  const now = new Date();

  const providers = await prisma.provider.findMany({ where: { enabled: true }, include: { keys: true } });
  const scored: ScoredKey[] = [];

  for (const p of providers) {
    const adapter = getAdapter(p.slug);
    if (!adapter) continue; // 未注册适配器的平台跳过（如待实现的自定义模板）
    const cap = adapter.capabilities();
    if (!capabilitySatisfies(cap, req)) continue;

    for (const k of p.keys) {
      if (excludeKeyIds.includes(k.id)) continue;
      if (k.status !== "active") continue;
      if (k.cooldownTill && k.cooldownTill > now) continue;
      if (k.quotaTotal !== null && k.quotaUsed >= k.quotaTotal) continue;

      const quality = clamp01((p.quality || cap.quality || 50) / 100);
      const remaining = k.quotaTotal ? clamp01(1 - k.quotaUsed / k.quotaTotal) : 1;
      const health = clamp01(k.health);
      const priority = clamp01(k.priority / 10);

      let score = weights.quality * quality + weights.remaining * remaining + weights.health * health + weights.priority * priority;
      if (strategy === "least_used") score = remaining * 100 + quality * 10; // 优先用剩余比例最小的
      if (strategy === "round_robin") score = Math.random() * 100; // 纯随机轮询

      scored.push({
        keyId: k.id,
        providerSlug: p.slug,
        providerName: p.name,
        quality: Math.round((p.quality || cap.quality || 50) * 10) / 10,
        score: Math.round(score * 1000) / 1000,
        reason: `质量${Math.round(quality * 100)} 剩余${Math.round(remaining * 100)}% 健康${Math.round(health * 100)}%`,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/** 解密出可用的 Key 对象 */
export async function resolveKey(keyId: string): Promise<(ResolvedKey & { providerId: string }) | null> {
  const k = await prisma.apiKey.findUnique({ where: { id: keyId }, include: { provider: true } });
  if (!k) return null;
  return {
    id: k.id,
    providerId: k.providerId,
    providerSlug: k.provider.slug,
    apiKey: decrypt(k.keyEnc),
    label: k.label,
    priority: k.priority,
    quotaUsed: k.quotaUsed,
    quotaTotal: k.quotaTotal,
    resetRule: k.resetRule,
  };
}

/** 前端"实时可用源反查"：按当前参数返回候选概况 */
export async function previewCandidates(req: NormalizedRequest) {
  const list = await listCandidates(req);
  return {
    total: list.length,
    top: list.slice(0, 8),
    // 聚合视图：同平台多 key 合并展示
    byProvider: Object.values(
      list.reduce<Record<string, { slug: string; name: string; keys: number; quality: number }>>((acc, c) => {
        acc[c.providerSlug] ??= { slug: c.providerSlug, name: c.providerName, keys: 0, quality: c.quality };
        acc[c.providerSlug].keys += 1;
        return acc;
      }, {})
    ).sort((a, b) => b.quality - a.quality),
  };
}
