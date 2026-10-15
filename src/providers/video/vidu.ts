import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Vidu（生数科技，低价 API）=====
// Key：平台 API Key（Authorization: Token <key>）
// v1 仅文生视频；图生视频/首尾帧走 v1.1（见路线图）

const BASE = "https://api.vidu.cn";

export const meta = {
  slug: "vidu",
  name: "Vidu（API）",
  modalities: ["video" as const],
  quality: 84,
  docs: "https://platform.vidu.cn/docs",
};

const CAPABILITY: Capability = {
  durations: [4, 8],
  ratios: ["16:9", "9:16", "1:1"],
  resolutions: ["480p", "720p", "1080p"],
  first_frame: false,
  last_frame: false,
  native_audio: true,
  watermark_on_free: false,
  commercial_ok: true,
  quality: 84,
  avg_latency_ms: 90_000,
  unit: "credits",
  cost_per_call: 4,
};

const RES_MAP: Record<string, string> = { "480p": "360p", "720p": "720p", "1080p": "1080p" };

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
        model: "vidu-q1",
        prompt: req.prompt,
        duration: req.duration_s ?? 4,
        resolution: RES_MAP[req.resolution ?? "720p"] ?? "720p",
      };
      if (req.seed !== undefined) body.seed = req.seed;

      const data = await fetchJson(`${BASE}/ent/v2/text2video`, {
        method: "POST",
        headers: { Authorization: `Token ${key.apiKey}` },
        body: JSON.stringify(body),
      });
      const id = data.task_id ?? data.id;
      if (!id) throw new Error(`上游未返回 task_id: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: String(id), status: "pending", raw: data };
    });
  },

  async poll(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const data = await fetchJson(`${BASE}/ent/v2/tasks/${job.jobId}`, {
        headers: { Authorization: `Token ${key.apiKey}` },
      });
      const st = String(data.state ?? data.status ?? "").toLowerCase();
      if (st === "success" || st === "succeeded") {
        const urls = (data.creations ?? []).map((c: { url?: string }) => c?.url).filter(Boolean);
        return { ...job, status: "succeeded", mediaUrls: urls, raw: data };
      }
      if (st === "failed" || st === "error") {
        return { ...job, status: "failed", error: data.err_msg ?? data.error ?? "上游任务失败", raw: data };
      }
      return { ...job, status: "running", raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "video", prompt: "a quiet forest path", ratio: "1:1", duration_s: 4 }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（消耗约 4 积分）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
