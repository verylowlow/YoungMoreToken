import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import { resolveMediaRef } from "@/lib/media";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Luma Dream Machine（低价 API）=====
// Key：Luma API Key（Bearer）

const BASE = "https://api.lumalabs.ai/dream-machine/v1";

export const meta = {
  slug: "luma",
  name: "Luma Dream Machine（API）",
  modalities: ["video" as const],
  region: "intl",
  quality: 80,
  docs: "https://docs.lumalabs.ai",
};

const CAPABILITY: Capability = {
  ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  resolutions: ["720p", "1080p"],
  first_frame: true,
  last_frame: true,
  native_audio: false,
  watermark_on_free: true,
  commercial_ok: true,
  quality: 80,
  avg_latency_ms: 150_000,
  unit: "credits",
  cost_per_call: 10,
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
        model: req.quality_tier === "high" ? "ray-2" : "ray-flash-2",
        prompt: req.prompt,
      };
      if (req.ratio) body.aspect_ratio = req.ratio === "4:3" || req.ratio === "3:4" || req.ratio === "21:9" ? req.ratio : req.ratio;
      const keyframes: Record<string, unknown> = {};
      if (req.first_frame) {
        const r = await resolveMediaRef(req.first_frame);
        keyframes.frame0 = { type: "image", url: r.url ?? r.base64 };
      }
      if (req.last_frame) {
        const r = await resolveMediaRef(req.last_frame);
        keyframes.frame1 = { type: "image", url: r.url ?? r.base64 };
      }
      if (Object.keys(keyframes).length) body.keyframes = keyframes;

      const data = await fetchJson(`${BASE}/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify(body),
      });
      const id = data.id;
      if (!id) throw new Error(`上游未返回 id: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: String(id), status: "pending", raw: data };
    });
  },

  async poll(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const data = await fetchJson(`${BASE}/generations/${job.jobId}`, {
        headers: { Authorization: `Bearer ${key.apiKey}` },
      });
      const st = String(data.state ?? "").toLowerCase();
      if (st === "completed") {
        const url = data.assets?.video;
        return { ...job, status: "succeeded", mediaUrls: url ? [url] : [], raw: data };
      }
      if (st === "failed") return { ...job, status: "failed", error: data.failure_reason ?? "上游任务失败", raw: data };
      return { ...job, status: "running", raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "video", prompt: "a paper boat on a puddle", ratio: "1:1" }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（消耗约 10 积分）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
