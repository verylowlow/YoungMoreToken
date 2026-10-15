import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== 硅基流动 SiliconFlow（国内 MaaS，注册送 ¥14，多款模型永久免费）=====
// 免费图像模型：Kwai-Kolors/Kolors、Qwen/Qwen-Image、SDXL 系列
// 端点 OpenAI 风格但返回结构是 {images:[{url}]}，做了双兼容

const BASE = "https://api.siliconflow.cn/v1";

export const meta = {
  slug: "siliconflow-image",
  name: "硅基流动（国内·Kolors/Qwen图像免费）",
  modalities: ["image" as const],
  region: "cn" as const,
  quality: 78,
  docs: "https://docs.siliconflow.com/cn/api-reference/images/images-generate",
};

const SIZE_BY_RATIO: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1280x720",
  "9:16": "720x1280",
  "4:3": "1152x864",
  "3:4": "864x1152",
  "21:9": "1344x576",
};

const CAPABILITY: Capability = {
  ratios: Object.keys(SIZE_BY_RATIO) as any,
  resolutions: ["720p", "1080p"],
  watermark_on_free: false,
  commercial_ok: true,
  quality: 78,
  avg_latency_ms: 15_000,
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
        model: (req.extras?.model as string) || "Kwai-Kolors/Kolors",
        prompt: req.prompt,
        image_size: SIZE_BY_RATIO[req.ratio ?? "1:1"] ?? "1024x1024",
        batch_size: 1,
        num_inference_steps: req.quality_tier === "draft" ? 12 : 20,
        guidance_scale: 7.5,
      };
      if (req.negative_prompt) body.negative_prompt = req.negative_prompt;
      if (typeof req.seed === "number") body.seed = req.seed;

      const data = await fetchJson(`${BASE}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify(body),
      });
      // 官方返回 {images:[{url}]}；兼容 OpenAI 风格 {data:[{url|b64_json}]}
      const list: any[] = data.images ?? data.data ?? [];
      const mediaUrls = list
        .map((d) => d.url ?? (d.b64_json ? `data:image/png;base64,${d.b64_json}` : null))
        .filter(Boolean);
      if (!mediaUrls.length) throw new Error(`上游未返回图片: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: `sync-${Date.now()}`, status: "succeeded", mediaUrls, raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "image", prompt: "a single red circle on white background", ratio: "1:1" }, key);
      const n = job.mediaUrls?.length ?? 0;
      return n ? { ok: true, msg: `硅基流动图像测试成功（返回 ${n} 张）` } : { ok: false, msg: "接口返回成功但没有图片数据" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
