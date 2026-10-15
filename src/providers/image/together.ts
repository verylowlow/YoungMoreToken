import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Together AI（FLUX.1-schnell 免费档，限速）=====
// OpenAI 风格：POST /v1/images/generations

const BASE = "https://api.together.xyz/v1";

export const meta = {
  slug: "together-image",
  name: "Together AI（FLUX免费档·国外）",
  modalities: ["image" as const],
  region: "intl" as const,
  quality: 82,
  docs: "https://docs.together.ai/docs/images-overview",
};

const SIZE_BY_RATIO: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1152, 896],
  "3:4": [896, 1152],
  "21:9": [1536, 640],
};

const CAPABILITY: Capability = {
  ratios: Object.keys(SIZE_BY_RATIO) as any,
  resolutions: ["720p", "1080p"],
  watermark_on_free: false,
  commercial_ok: true,
  quality: 82,
  avg_latency_ms: 10_000,
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
      const [w, h] = SIZE_BY_RATIO[req.ratio ?? "1:1"] ?? [1024, 1024];
      const data = await fetchJson(`${BASE}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify({
          model: (req.extras?.model as string) || "black-forest-labs/FLUX.1-schnell-Free",
          prompt: req.prompt,
          width: w,
          height: h,
          steps: req.quality_tier === "draft" ? 4 : 8,
          n: 1,
          response_format: "b64_json",
        }),
      });
      const list: any[] = data.data ?? [];
      const mediaUrls = list.map((d) => (d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url ?? null)).filter(Boolean);
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
      return n ? { ok: true, msg: `Together FLUX 测试成功（返回 ${n} 张）` } : { ok: false, msg: "接口返回成功但没有图片数据" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
