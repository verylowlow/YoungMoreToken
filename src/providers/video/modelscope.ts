import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== 魔搭 ModelScope · Wan2.2 文生视频（免费每日 API）=====
// 端点与参数以魔搭官方文档为准；免费档有每日调用上限，额度耗尽后
// 路由引擎会自动冷却该 key 并切换下一个候选。

const BASE = "https://api-inference.modelscope.cn";
const MODEL = "Wan-AI/Wan2.2-T2V-A14B";

export const meta = {
  slug: "modelscope-wan2",
  name: "魔搭 ModelScope（Wan2.2 免费API）",
  modalities: ["video" as const],
  quality: 62,
  docs: "https://modelscope.cn/docs/model-inference/api-inference",
};

const CAPABILITY: Capability = {
  durations: [5],
  ratios: ["16:9", "9:16", "1:1"],
  resolutions: ["480p", "720p"],
  first_frame: false,
  last_frame: false,
  native_audio: false,
  watermark_on_free: false,
  commercial_ok: false, // 免费档限非商用
  quality: 62,
  avg_latency_ms: 180_000,
  unit: "calls",
  cost_per_call: 1,
};

export const adapter: ProviderAdapter = {
  slug: meta.slug,
  modalities: meta.modalities,
  capabilities: () => CAPABILITY,

  async submit(req: NormalizedRequest, key: ResolvedKey): Promise<UpstreamJob> {
    const ratioMap: Record<string, string> = { "16:9": "1280*720", "9:16": "720*1280", "1:1": "960*960" };
    try {
      const body: Record<string, unknown> = { model: MODEL, prompt: req.prompt };
      if (req.negative_prompt) body.negative_prompt = req.negative_prompt;
      if (req.ratio && ratioMap[req.ratio]) body.size = ratioMap[req.ratio];
      if (req.seed !== undefined) body.seed = req.seed;

      const data = await fetchJson(`${BASE}/v1/video/generation`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify(body),
      });
      const taskId = data.task_id ?? data.taskId ?? data.id;
      if (!taskId) throw new Error(`上游未返回 task_id: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: String(taskId), status: "pending", raw: data };
    } catch (err) {
      if (err instanceof UpstreamHttpError) throw Object.assign(new Error(err.message), { errorClass: classifyHttp(err.status, err.body) });
      throw Object.assign(err as Error, { errorClass: classifyNetworkErr(err) });
    }
  },

  async poll(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob> {
    try {
      const data = await fetchJson(`${BASE}/v1/tasks/${job.jobId}`, {
        headers: { Authorization: `Bearer ${key.apiKey}` },
      });
      const st = String(data.task_status ?? data.status ?? "").toUpperCase();
      if (st === "SUCCEED" || st === "SUCCEEDED" || st === "SUCCESS") {
        const url = data.output?.video_url ?? data.output?.video ?? data.video_url;
        return { ...job, status: "succeeded", mediaUrls: url ? [String(url)] : [], raw: data };
      }
      if (st === "FAIL" || st === "FAILED") {
        return { ...job, status: "failed", error: data.output?.error ?? data.error ?? "上游任务失败", raw: data };
      }
      return { ...job, status: "running", raw: data };
    } catch (err) {
      if (err instanceof UpstreamHttpError) throw Object.assign(new Error(err.message), { errorClass: classifyHttp(err.status, err.body) });
      throw Object.assign(err as Error, { errorClass: classifyNetworkErr(err) });
    }
  },

  classifyError(err: unknown): ErrorClass {
    const cls = (err as { errorClass?: string })?.errorClass;
    return (cls as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "video", prompt: "a cat sitting on a sofa", ratio: "1:1" }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（将消耗 1 次免费额度）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
