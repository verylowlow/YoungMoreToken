import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import { resolveMediaRef } from "@/lib/media";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== MiniMax 海螺视频（国内，Hailuo-02）=====
// 三段式：提交 → 查任务 → 取文件下载URL
// Key 格式：apiKey|GroupId（GroupId 在账号"接口密钥"旁可见；老账号可只填 apiKey 走默认组）

const BASE = "https://api.minimaxi.com/v1";

export const meta = {
  slug: "minimax-video",
  name: "MiniMax 海螺（国内·视频）",
  modalities: ["video" as const],
  region: "cn" as const,
  quality: 82,
  docs: "https://platform.minimaxi.com/document/Video%20Generation",
};

const CAPABILITY: Capability = {
  durations: [6, 10],
  ratios: ["16:9", "9:16", "1:1"],
  resolutions: ["720p", "1080p"],
  first_frame: true,
  native_audio: true,
  watermark_on_free: true,
  commercial_ok: true,
  quality: 82,
  avg_latency_ms: 240_000,
  unit: "credits",
  cost_per_call: 15,
};

function wrap(fn: () => Promise<UpstreamJob>) {
  return fn().catch((err) => {
    if (err instanceof UpstreamHttpError) throw Object.assign(new Error(err.message), { errorClass: classifyHttp(err.status, err.body) });
    throw Object.assign(err as Error, { errorClass: classifyNetworkErr(err) });
  });
}

function groupQuery(key: ResolvedKey): string {
  const gid = key.apiKey.split("|")[1];
  return gid ? `?GroupId=${encodeURIComponent(gid)}` : "";
}

export const adapter: ProviderAdapter = {
  slug: meta.slug,
  modalities: meta.modalities,
  capabilities: () => CAPABILITY,

  async submit(req: NormalizedRequest, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const body: Record<string, unknown> = {
        model: (req.extras?.model as string) || "MiniMax-Hailuo-02",
        prompt: req.prompt,
        duration: req.duration_s ?? 6,
        resolution: req.resolution === "1080p" ? "1080P" : "768P",
      };
      if (req.first_frame) {
        const r = await resolveMediaRef(req.first_frame);
        if (r.url) body.first_frame_image = r.url;
        else if (r.base64) body.first_frame_image = r.base64; // 官方支持 base64
      }
      const data = await fetchJson(`${BASE}/video_generation${groupQuery(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey.split("|")[0]}` },
        body: JSON.stringify(body),
      });
      if (data.base_resp && data.base_resp.status_code !== 0) {
        throw Object.assign(new Error(`MiniMax 错误 ${data.base_resp.status_code}: ${data.base_resp.status_msg}`), {
          errorClass: data.base_resp.status_code === 1008 ? "quota_exhausted" : "unsupported" as ErrorClass,
        });
      }
      const taskId = data.task_id;
      if (!taskId) throw new Error(`上游未返回 task_id: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: String(taskId), status: "pending", raw: data };
    });
  },

  async poll(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const data = await fetchJson(`${BASE}/query/video_generation?task_id=${job.jobId}${groupQuery(key).replace("?", "&")}`, {
        headers: { Authorization: `Bearer ${key.apiKey.split("|")[0]}` },
      });
      const st = String(data.status ?? "").toLowerCase();
      if (st === "success") {
        // 拿 file_id 换下载链接
        const fileId = data.file_id;
        if (!fileId) return { ...job, status: "succeeded", mediaUrls: [], raw: data };
        const f = await fetchJson(`${BASE}/files/retrieve?file_id=${fileId}${groupQuery(key).replace("?", "&")}`, {
          headers: { Authorization: `Bearer ${key.apiKey.split("|")[0]}` },
        });
        const url = f.file?.download_url;
        return { ...job, status: "succeeded", mediaUrls: url ? [String(url)] : [], raw: { ...data, file: f } };
      }
      if (st === "fail") {
        return { ...job, status: "failed", error: data.error?.message ?? data.base_resp?.status_msg ?? "上游任务失败", raw: data };
      }
      return { ...job, status: "running", raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "video", prompt: "海浪轻轻拍打沙滩，慢镜头", duration_s: 6 }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（海螺视频，约 2-5 分钟出片）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
