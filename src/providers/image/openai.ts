import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== OpenAI 图像（gpt-image-1 / dall-e-3，按量付费，无免费额度）=====
// 覆盖"采购来的 API"场景：质量最高，池子耗尽时的付费兜底

const BASE = "https://api.openai.com/v1";

export const meta = {
  slug: "openai-image",
  name: "OpenAI（gpt-image-1·付费）",
  modalities: ["image" as const],
  region: "intl" as const,
  quality: 92,
  docs: "https://platform.openai.com/docs/guides/images",
};

const SIZE_BY_RATIO: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "4:3": "1024x1024",
  "3:4": "1024x1024",
};

const CAPABILITY: Capability = {
  ratios: Object.keys(SIZE_BY_RATIO) as any,
  resolutions: ["720p", "1080p", "2k"],
  watermark_on_free: false,
  commercial_ok: true,
  quality: 92,
  avg_latency_ms: 25_000,
  unit: "calls",
  cost_per_call: 4,
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
      const model = (req.extras?.model as string) || "gpt-image-1";
      const data = await fetchJson(`${BASE}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify({
          model,
          prompt: req.prompt,
          size: SIZE_BY_RATIO[req.ratio ?? "1:1"] ?? "1024x1024",
          quality: req.quality_tier === "draft" ? "low" : req.quality_tier === "high" ? "high" : "medium",
          n: 1,
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
      return n ? { ok: true, msg: `OpenAI 图像测试成功（返回 ${n} 张，已计费）` } : { ok: false, msg: "接口返回成功但没有图片数据" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
