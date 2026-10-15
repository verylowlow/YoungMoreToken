import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== 智谱 AI 图像（CogView-3-Flash 免费 / CogView-4）=====

const BASE = "https://open.bigmodel.cn/api/paas/v4";

export const meta = {
  slug: "zhipu-image",
  name: "智谱 AI（国内·CogView免费）",
  modalities: ["image" as const],
  region: "cn" as const,
  quality: 74,
  docs: "https://docs.bigmodel.cn/api-1379220231",
};

const SIZE_BY_RATIO: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1344x768",
  "9:16": "768x1344",
  "4:3": "1152x864",
  "3:4": "864x1152",
};

const CAPABILITY: Capability = {
  ratios: Object.keys(SIZE_BY_RATIO) as any,
  resolutions: ["720p", "1080p"],
  watermark_on_free: false,
  commercial_ok: true,
  quality: 74,
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
      const body: Record<string, unknown> = {
        model: (req.extras?.model as string) || "cogview-3-flash",
        prompt: req.prompt,
        size: SIZE_BY_RATIO[req.ratio ?? "1:1"] ?? "1024x1024",
        quality: req.quality_tier === "draft" ? "standard" : "hd",
        user_id: "youngmoretoken",
      };
      const data = await fetchJson(`${BASE}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify(body),
      });
      const list: any[] = data.data ?? [];
      const mediaUrls = list.map((d) => d.url ?? (d.b64_json ? `data:image/png;base64,${d.b64_json}` : null)).filter(Boolean);
      if (!mediaUrls.length) throw new Error(`上游未返回图片: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: `sync-${Date.now()}`, status: "succeeded", mediaUrls, raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "image", prompt: "一只在草地上打盹的橘猫，柔和自然光", ratio: "1:1" }, key);
      const n = job.mediaUrls?.length ?? 0;
      return n ? { ok: true, msg: `智谱 CogView 测试成功（返回 ${n} 张）` } : { ok: false, msg: "接口返回成功但没有图片数据" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
