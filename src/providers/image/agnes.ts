import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import { resolveMediaRef } from "@/lib/media";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Agnes AI 图像（新加坡 Sapiens AI，免费）=====
// 同步接口：POST /v1/images/generations，直接返回 URL
// 注意：response_format 必须放在 extra_body 里（官方文档的坑）

const BASE = "https://apihub.agnes-ai.com";

export const meta = {
  slug: "agnes-image",
  name: "Agnes AI（新加坡·图像免费）",
  modalities: ["image" as const],
  region: "intl" as const,
  quality: 80,
  docs: "https://agnes-ai.com/doc/agnes-image-21-flash",
};

const SIZE_BY_RES: Record<string, string> = { "480p": "1K", "720p": "1K", "1080p": "2K", "2k": "2K", "4k": "4K" };

const CAPABILITY: Capability = {
  ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
  resolutions: ["480p", "720p", "1080p", "2k", "4k"],
  ref_images: { max: 4 }, // 多图合成（image 数组）
  first_frame: true, // 图生图走 image 数组
  watermark_on_free: false,
  commercial_ok: true,
  quality: 80,
  avg_latency_ms: 20_000,
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
        model: "agnes-image-2.1-flash",
        prompt: req.prompt,
        size: SIZE_BY_RES[req.resolution ?? ""] ?? "2K",
        ratio: req.ratio ?? "1:1",
        extra_body: { response_format: "url" },
      };
      // 图生图 / 多图合成：首帧与参考图都进 image 数组
      const imgs: string[] = [];
      for (const ref of [...(req.first_frame ? [req.first_frame] : []), ...(req.ref_images ?? [])]) {
        const r = await resolveMediaRef(ref);
        imgs.push(r.url ?? r.base64!);
      }
      if (imgs.length) body.image = imgs;

      const data = await fetchJson(`${BASE}/v1/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify(body),
      });
      const first = data.data?.[0];
      const url = first?.url ?? first?.b64_json;
      if (!url) throw new Error(`上游未返回图片: ${JSON.stringify(data).slice(0, 200)}`);
      const mediaUrls = (data.data ?? []).map((d: any) => d.url ?? (d.b64_json ? `data:image/png;base64,${d.b64_json}` : null)).filter(Boolean);
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
      return n ? { ok: true, msg: `Agnes 图像测试成功（免费通道，返回 ${n} 张）` } : { ok: false, msg: "接口返回成功但没有图片数据" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
