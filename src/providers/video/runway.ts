import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import { resolveMediaRef } from "@/lib/media";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Runway（Gen-3a/Gen-4，注册赠一次性免费积分）=====
// POST /v1/text_to_video 或 /v1/image_to_video → 轮询 /v1/tasks/{id}

const BASE = "https://api.dev.runwayml.com/v1";

export const meta = {
  slug: "runway-video",
  name: "Runway（Gen-4·国外）",
  modalities: ["video" as const],
  region: "intl" as const,
  quality: 88,
  docs: "https://docs.dev.runwayml.com/",
};

const CAPABILITY: Capability = {
  durations: [5, 10],
  ratios: ["16:9", "9:16", "1:1", "4:3"],
  resolutions: ["720p", "1080p"],
  first_frame: true,
  native_audio: false,
  watermark_on_free: true,
  commercial_ok: true,
  quality: 88,
  avg_latency_ms: 180_000,
  unit: "credits",
  cost_per_call: 12,
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
      const model = (req.extras?.model as string) || "gen3a_turbo";
      const duration = req.duration_s === 10 ? 10 : 5;
      const headers = { Authorization: `Bearer ${key.apiKey}`, "X-Runway-Version": "2024-11-06" };

      let url = `${BASE}/text_to_video`;
      const body: Record<string, unknown> = {
        model,
        promptText: req.prompt,
        duration,
        ...(req.ratio ? { ratio: req.ratio } : {}),
      };
      if (req.first_frame) {
        const r = await resolveMediaRef(req.first_frame);
        if (r.url) {
          url = `${BASE}/image_to_video`;
          body.promptImage = r.url;
        }
      }
      const data = await fetchJson(url, { method: "POST", headers, body: JSON.stringify(body) });
      const id = data.id;
      if (!id) throw new Error(`上游未返回 id: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: String(id), status: "pending", raw: data };
    });
  },

  async poll(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const data = await fetchJson(`${BASE}/tasks/${job.jobId}`, {
        headers: { Authorization: `Bearer ${key.apiKey}`, "X-Runway-Version": "2024-11-06" },
      });
      const st = String(data.status ?? "").toUpperCase();
      if (st === "SUCCEEDED") {
        const url = Array.isArray(data.output) ? data.output[0] : data.output;
        return { ...job, status: "succeeded", mediaUrls: url ? [String(url)] : [], raw: data };
      }
      if (st === "FAILED") return { ...job, status: "failed", error: data.failure ?? "上游任务失败", raw: data };
      return { ...job, status: "running", raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "video", prompt: "slow dolly shot through a sunlit forest", duration_s: 5 }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（Runway，消耗积分）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
