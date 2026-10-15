import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import { resolveMediaRef } from "@/lib/media";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Agnes AI（新加坡 Sapiens AI，文/图/音/视频全模态免费 API）=====
// Key：apihub.agnes-ai.com 注册即得，无需绑卡；当前视频/图像模型无限期免费
// 文档：https://agnes-ai.com/en/docs/agnes-video-25

const BASE = "https://apihub.agnes-ai.com";

export const meta = {
  slug: "agnes-video",
  name: "Agnes AI（新加坡·视频免费）",
  modalities: ["video" as const],
  region: "intl" as const, // 新加坡主体，国内有 CN 站点，直连大多可用
  quality: 78,
  docs: "https://agnes-ai.com/en/docs/agnes-video-25",
};

const CAPABILITY: Capability = {
  durations: [4, 5, 6, 8, 10, 12],
  ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  resolutions: ["480p", "720p", "1080p", "2k"],
  first_frame: true,
  last_frame: true,
  native_audio: true, // v2.0 起原生带 AAC 音轨
  watermark_on_free: false,
  commercial_ok: true,
  quality: 78,
  avg_latency_ms: 120_000,
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
      // v2.5：mode=text 纯文生视频；有首/尾帧时走 keyframe 模式
      const hasFrame = !!(req.first_frame || req.last_frame);
      const body: Record<string, unknown> = {
        model: "agnes-video-2.5",
        prompt: req.prompt,
        mode: hasFrame ? "keyframe" : "text",
        seconds: String(req.duration_s ?? 5),
        size: req.resolution === "1080p" ? "1080P" : req.resolution === "2k" ? "2K" : req.resolution === "480p" ? "480P" : "720P",
        aspect_ratio: req.ratio ?? "16:9",
      };
      if (req.first_frame) {
        const r = await resolveMediaRef(req.first_frame);
        body.first_frame = r.url ?? r.base64;
      }
      if (req.last_frame) {
        const r = await resolveMediaRef(req.last_frame);
        body.last_frame = r.url ?? r.base64;
      }
      const data = await fetchJson(`${BASE}/v1/videos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify(body),
      });
      // video_id 是官方推荐的查询键；老版接口只有 task_id
      const videoId = data.video_id ?? data.task_id ?? data.id;
      if (!videoId) throw new Error(`上游未返回任务 id: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: String(videoId), status: "pending", raw: data };
    });
  },

  async poll(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const data = await fetchJson(`${BASE}/agnesapi?video_id=${encodeURIComponent(job.jobId)}`, {
        headers: { Authorization: `Bearer ${key.apiKey}` },
      });
      const st = String(data.status ?? "").toLowerCase();
      if (st === "completed" || st === "succeeded" || st === "success") {
        const url = data.url ?? data.video_url ?? data.output?.url;
        return { ...job, status: "succeeded", mediaUrls: url ? [String(url)] : [], raw: data };
      }
      if (st === "failed" || st === "error") {
        return { ...job, status: "failed", error: data.error ?? data.message ?? "上游任务失败", raw: data };
      }
      return { ...job, status: "running", raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "video", prompt: "a paper boat sailing on a puddle, cinematic", duration_s: 5, ratio: "16:9" }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（免费通道，约 1-3 分钟出片）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
