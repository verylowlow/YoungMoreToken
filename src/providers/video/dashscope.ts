import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import { resolveMediaRef } from "@/lib/media";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== 阿里云百炼·通义万相 视频（国内，新用户 90 天免费 50 秒）=====
// 支持 wan2.1/2.2-t2v / i2v；X-DashScope-Async: enable → 轮询 /api/v1/tasks/{id}

const BASE = "https://dashscope.aliyuncs.com/api/v1";

export const meta = {
  slug: "dashscope-video",
  name: "阿里百炼·通义万相（国内·视频）",
  modalities: ["video" as const],
  region: "cn" as const,
  quality: 84,
  docs: "https://help.aliyun.com/zh/model-studio/text-to-video",
};

const CAPABILITY: Capability = {
  durations: [5, 10],
  ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
  resolutions: ["480p", "720p", "1080p"],
  first_frame: true, // img_url 图生视频
  native_audio: false,
  watermark_on_free: false,
  commercial_ok: true,
  quality: 84,
  avg_latency_ms: 240_000,
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
      const input: Record<string, unknown> = { prompt: req.prompt };
      if (req.first_frame) {
        const r = await resolveMediaRef(req.first_frame);
        if (r.url) input.img_url = r.url;
      }
      const data = await fetchJson(`${BASE}/services/aigc/video-generation/video-synthesis`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}`, "X-DashScope-Async": "enable" },
        body: JSON.stringify({
          model: (req.extras?.model as string) || "wan2.1-t2v-turbo",
          input,
          parameters: {
            resolution: req.resolution === "1080p" ? "1080P" : req.resolution === "480p" ? "480P" : "720P",
            duration: req.duration_s ?? 5,
            ...(req.ratio ? { ratio: req.ratio } : {}),
          },
        }),
      });
      const taskId = data.output?.task_id;
      if (!taskId) throw new Error(`上游未返回 task_id: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: String(taskId), status: "pending", raw: data };
    });
  },

  async poll(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const data = await fetchJson(`${BASE}/tasks/${job.jobId}`, {
        headers: { Authorization: `Bearer ${key.apiKey}` },
      });
      const st = String(data.output?.task_status ?? "").toUpperCase();
      if (st === "SUCCEEDED" || st === "SUCCESS") {
        const url = data.output?.video_url;
        return { ...job, status: "succeeded", mediaUrls: url ? [String(url)] : [], raw: data };
      }
      if (st === "FAILED" || st === "CANCELED") {
        return { ...job, status: "failed", error: data.output?.message ?? data.message ?? "上游任务失败", raw: data };
      }
      return { ...job, status: "running", raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "video", prompt: "一只金毛犬在夕阳下的海边奔跑，电影感", duration_s: 5 }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（通义万相视频，约 2-5 分钟出片）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
