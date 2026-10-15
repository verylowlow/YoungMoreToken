import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== 魔搭 ModelScope · Qwen-Image（每日免费 API 约 250 次）=====
// 需实名阿里云账号绑定；免费档限非商用

const BASE = "https://api-inference.modelscope.cn";
const MODEL = "Qwen/Qwen-Image";

export const meta = {
  slug: "modelscope-image",
  name: "魔搭 ModelScope（Qwen-Image 免费API）",
  modalities: ["image" as const],
  region: "cn",
  quality: 78,
  docs: "https://modelscope.cn/docs/model-inference/api-inference",
};

const CAPABILITY: Capability = {
  ratios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  resolutions: ["720p", "1080p"],
  commercial_ok: false,
  quality: 78,
  avg_latency_ms: 15_000,
  unit: "calls",
  cost_per_call: 1,
};

/** 魔搭生图响应结构有多个历史版本，做容错提取 */
function extractImages(data: any): string[] {
  const cands = [
    ...(data?.output?.images ?? []).map((x: any) => x?.url ?? x),
    ...(data?.images ?? []).map((x: any) => x?.url ?? x),
    data?.output?.image_url ? [data.output.image_url] : [],
    data?.image_url ? [data.image_url] : [],
    ...(data?.data ?? []).map((x: any) => x?.url ?? x),
  ];
  return cands.filter((u: any) => typeof u === "string" && u.length > 0);
}

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
      const data = await fetchJson(`${BASE}/v1/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}` },
        body: JSON.stringify({ model: MODEL, prompt: req.prompt, n: req.count ?? 1 }),
      });
      const urls = extractImages(data);
      if (!urls.length) throw new Error(`上游未返回图片: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: `sync-${Date.now()}`, status: "succeeded", mediaUrls: urls, raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "image", prompt: "a blue bicycle by the wall", ratio: "1:1" }, key);
      return { ok: true, msg: `测试出图成功（消耗 1 次免费额度）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
