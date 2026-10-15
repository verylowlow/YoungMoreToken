import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import { resolveMediaRef } from "@/lib/media";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== 火山引擎方舟（即梦/Seedance，新用户有免费试用额度）=====
// 提交 /api/v3/contents/generations/tasks → 轮询同端点
// model 可填推理端点 ID（ep-xxxx，控制台创建）或模型名，如 doubao-seedance-1-0-pro-250828

const BASE = "https://ark.cn-beijing.volces.com/api/v3";

export const meta = {
  slug: "volcengine-video",
  name: "火山引擎·即梦Seedance（国内·视频）",
  modalities: ["video" as const],
  region: "cn" as const,
  quality: 86,
  docs: "https://www.volcengine.com/docs/82379/1520757",
};

const CAPABILITY: Capability = {
  durations: [5, 10, 12],
  ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  resolutions: ["480p", "720p", "1080p"],
  first_frame: true,
  last_frame: true,
  native_audio: true,
  watermark_on_free: false,
  commercial_ok: true,
  quality: 86,
  avg_latency_ms: 200_000,
  unit: "seconds",
  cost_per_call: 1,
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
      const model = (req.extras?.model as string) || "doubao-seedance-1-0-pro-250828";
      const content: any[] = [{ type: "text", text: req.prompt }];
      if (req.first_frame) {
        const r = await resolveMediaRef(req.first_frame);
        if (r.url) content.push({ type: "image_url", image_url: { url: r.url } });
      }
      if (req.last_frame) {
        const r = await resolveMediaRef(req.last_frame);
        if (r.url) content.push({ type: "image_url", image_url: { url: r.url } });
      }
      const data = await fetchJson(`${BASE}/contents/generations/tasks`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify({
          model,
          content,
          ...(req.ratio ? { ratio: req.ratio } : {}),
          ...(req.duration_s ? { duration: req.duration_s } : {}),
          ...(req.resolution ? { resolution: req.resolution === "1080p" ? "1080p" : req.resolution === "480p" ? "480p" : "720p" } : {}),
        }),
      });
      const id = data.id;
      if (!id) throw new Error(`上游未返回 id: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: String(id), status: "pending", raw: data };
    });
  },

  async poll(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const data = await fetchJson(`${BASE}/contents/generations/tasks/${job.jobId}`, {
        headers: { Authorization: `Bearer ${key.apiKey}` },
      });
      const st = String(data.status ?? "").toLowerCase();
      if (st === "succeeded") {
        const url = data.content?.video_url;
        return { ...job, status: "succeeded", mediaUrls: url ? [String(url)] : [], raw: data };
      }
      if (st === "failed") return { ...job, status: "failed", error: data.error?.message ?? "上游任务失败", raw: data };
      return { ...job, status: "running", raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "video", prompt: "一只白鸽掠过黄昏的城市天际线，慢镜头", duration_s: 5 }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（方舟视频，约 1-3 分钟出片）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
