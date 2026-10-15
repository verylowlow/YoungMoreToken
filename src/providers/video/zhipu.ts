import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import { resolveMediaRef } from "@/lib/media";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== 智谱 AI 视频（CogVideoX-Flash 免费）=====
// 异步：POST /api/paas/v4/videos/generations → 轮询 /api/paas/v4/async-result/{id}

const BASE = "https://open.bigmodel.cn/api/paas/v4";

export const meta = {
  slug: "zhipu-video",
  name: "智谱 AI（国内·CogVideoX免费）",
  modalities: ["video" as const],
  region: "cn" as const,
  quality: 74,
  docs: "https://docs.bigmodel.cn/api-1379220181",
};

const CAPABILITY: Capability = {
  durations: [5, 10],
  ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
  resolutions: ["720p", "1080p"],
  first_frame: true, // cogvideox-flash 支持 image_url 参数（按官方文档传参）
  native_audio: true, // 新版带 AI 音效
  watermark_on_free: false,
  commercial_ok: true,
  quality: 74,
  avg_latency_ms: 180_000,
  unit: "calls",
  cost_per_call: 0,
};

function wrap(fn: () => Promise<UpstreamJob>) {
  return fn().catch((err) => {
    if (err instanceof UpstreamHttpError) throw Object.assign(new Error(err.message), { errorClass: classifyHttp(err.status, err.body) });
    throw Object.assign(err as Error, { errorClass: classifyNetworkErr(err) });
  });
}

export const adapter: ProviderAdapter = {
  slug: meta.slug,
  modalities: meta.modalities,
  capabilities: () => CAPABILITY,

  async submit(req: NormalizedRequest, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const body: Record<string, unknown> = {
        model: (req.extras?.model as string) || "cogvideox-flash",
        prompt: req.prompt,
        duration: req.duration_s ?? 5,
        quality: req.quality_tier === "draft" ? "speed" : "quality",
        with_audio: true,
        fps: 30,
      };
      if (req.first_frame) {
        const r = await resolveMediaRef(req.first_frame);
        if (r.url) body.image_url = r.url;
      }
      const data = await fetchJson(`${BASE}/videos/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify(body),
      });
      const id = data.id ?? data.task_id;
      if (!id) throw new Error(`上游未返回任务 id: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: String(id), status: "pending", raw: data };
    });
  },

  async poll(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const data = await fetchJson(`${BASE}/async-result/${job.jobId}`, {
        headers: { Authorization: `Bearer ${key.apiKey}` },
      });
      const st = String(data.task_status ?? "").toUpperCase();
      if (st === "SUCCESS" || st === "SUCCEEDED") {
        const url = data.video_result?.[0]?.url;
        return { ...job, status: "succeeded", mediaUrls: url ? [String(url)] : [], raw: data };
      }
      if (st === "FAIL" || st === "FAILED") {
        return { ...job, status: "failed", error: data.error?.message ?? "上游任务失败", raw: data };
      }
      return { ...job, status: "running", raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "video", prompt: "一只小猫在草地上奔跑，电影级画质", duration_s: 5 }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（cogvideox-flash 免费通道）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
