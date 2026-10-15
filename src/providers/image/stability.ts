import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Stability AI（SDXL / SD3.5，注册赠免费额度）=====
// v1 引擎接口，返回 artifacts[].base64

const BASE = "https://api.stability.ai/v1";

export const meta = {
  slug: "stability-image",
  name: "Stability AI（SDXL·国外）",
  modalities: ["image" as const],
  region: "intl" as const,
  quality: 78,
  docs: "https://platform.stability.ai/docs/api-reference",
};

const SIZE_BY_RATIO: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1152, 896],
  "3:4": [896, 1152],
};

const CAPABILITY: Capability = {
  ratios: Object.keys(SIZE_BY_RATIO) as any,
  resolutions: ["720p", "1080p"],
  watermark_on_free: false,
  commercial_ok: false, // 免费额度产图非商用授权，需确认
  quality: 78,
  avg_latency_ms: 12_000,
  unit: "credits",
  cost_per_call: 3,
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
      const engine = (req.extras?.model as string) || "stable-diffusion-xl-1024-v1-0";
      const [w, h] = SIZE_BY_RATIO[req.ratio ?? "1:1"] ?? [1024, 1024];
      const data = await fetchJson(`${BASE}/generation/${encodeURIComponent(engine)}/text-to-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify({
          text_prompts: [{ text: req.prompt, weight: 1 }, ...(req.negative_prompt ? [{ text: req.negative_prompt, weight: -1 }] : [])],
          cfg_scale: 7,
          width: w,
          height: h,
          steps: req.quality_tier === "draft" ? 20 : 30,
          samples: 1,
        }),
      });
      const arts: any[] = data.artifacts ?? [];
      const mediaUrls = arts.map((a) => (a.base64 ? `data:image/png;base64,${a.base64}` : null)).filter((x): x is string => !!x);
      if (!mediaUrls.length) throw new Error(`上游未返回图片: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: `sync-${Date.now()}`, status: "succeeded", mediaUrls, raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "image", prompt: "a serene mountain lake at dawn, digital painting", ratio: "16:9" }, key);
      const n = job.mediaUrls?.length ?? 0;
      return n ? { ok: true, msg: `Stability 测试成功（返回 ${n} 张）` } : { ok: false, msg: "接口返回成功但没有图片数据" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
