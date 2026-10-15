import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== 阿里云百炼·通义万相 图像（国内，新用户 90 天免费 100 张）=====
// 异步：X-DashScope-Async: enable → 轮询 /api/v1/tasks/{id}

const BASE = "https://dashscope.aliyuncs.com/api/v1";

export const meta = {
  slug: "dashscope-image",
  name: "阿里百炼·通义万相（国内·图像）",
  modalities: ["image" as const],
  region: "cn" as const,
  quality: 82,
  docs: "https://help.aliyun.com/zh/model-studio/text-to-image",
};

const SIZE_BY_RATIO: Record<string, string> = {
  "1:1": "1024*1024",
  "16:9": "1440*810",
  "9:16": "810*1440",
  "4:3": "1152*864",
  "3:4": "864*1152",
};

const CAPABILITY: Capability = {
  ratios: Object.keys(SIZE_BY_RATIO) as any,
  resolutions: ["720p", "1080p"],
  watermark_on_free: false,
  commercial_ok: true,
  quality: 82,
  avg_latency_ms: 20_000,
  unit: "calls",
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
      const data = await fetchJson(`${BASE}/services/aigc/text2image/image-synthesis`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}`, "X-DashScope-Async": "enable" },
        body: JSON.stringify({
          model: (req.extras?.model as string) || "wan2.2-t2i-flash",
          input: { prompt: req.prompt, ...(req.negative_prompt ? { negative_prompt: req.negative_prompt } : {}) },
          parameters: { size: SIZE_BY_RATIO[req.ratio ?? "1:1"] ?? "1024*1024", n: 1 },
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
        // 兼容 results[].url / image_urls / output.results
        const results: any[] = data.output?.results ?? [];
        const urls = results.map((r) => r.url ?? r.image_url).filter(Boolean);
        const alt = data.output?.image_urls ?? data.output?.urls ?? [];
        const mediaUrls = urls.length ? urls : alt;
        return { ...job, status: "succeeded", mediaUrls, raw: data };
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
      const job = await adapter.submit({ modality: "image", prompt: "一只橘色小猫坐在窗台上看雪景，柔和光线", ratio: "1:1" }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（通义万相，约 10-30 秒出图）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
