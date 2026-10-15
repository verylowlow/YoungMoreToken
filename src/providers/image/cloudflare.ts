import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Cloudflare Workers AI · FLUX.1-schnell（每天约 173~230 张免费）=====
// Key 格式：`accountId|apiToken`（设置页有提示）
// 10,000 neurons/天，4 步出图约 43 neurons/张；UTC 0 点重置

const MODEL = "@cf/black-forest-labs/flux-1-schnell";

export const meta = {
  slug: "cloudflare-flux",
  name: "Cloudflare Workers AI（FLUX 免费API）",
  modalities: ["image" as const],
  quality: 70,
  docs: "https://developers.cloudflare.com/workers-ai/models/flux-1-schnell",
};

const CAPABILITY: Capability = {
  ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"],
  resolutions: ["720p", "1080p"],
  first_frame: false,
  last_frame: false,
  commercial_ok: true, // FLUX.1-schnell Apache-2.0
  quality: 70,
  avg_latency_ms: 8_000,
  unit: "calls",
  cost_per_call: 1,
};

function wrap(fn: () => Promise<UpstreamJob>) {
  return fn().catch((err) => {
    if (err instanceof UpstreamHttpError) throw Object.assign(new Error(err.message), { errorClass: classifyHttp(err.status, err.body) });
    throw Object.assign(err as Error, { errorClass: classifyNetworkErr(err) });
  });
}

function sizeOf(ratio?: string, res?: string): { width: number; height: number } {
  const long = res === "1080p" ? 1080 : 768;
  const map: Record<string, [number, number]> = {
    "1:1": [1, 1],
    "16:9": [16, 9],
    "9:16": [9, 16],
    "4:3": [4, 3],
    "3:4": [3, 4],
    "21:9": [21, 9],
  };
  const [a, b] = map[ratio ?? "1:1"] ?? [1, 1];
  return a >= b ? { width: long, height: Math.round((long * b) / a) } : { width: Math.round((long * a) / b), height: long };
}

export const adapter: ProviderAdapter = {
  slug: meta.slug,
  capabilities: () => CAPABILITY,

  async submit(req: NormalizedRequest, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const [accountId, token] = key.apiKey.split("|");
      if (!accountId || !token) throw new Error("Cloudflare Key 格式应为 accountId|apiToken");
      const { width, height } = sizeOf(req.ratio, req.resolution);
      const data = await fetchJson(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ prompt: req.prompt, steps: 4, width, height }),
        }
      );
      const b64 = data?.result?.image;
      if (!b64) throw new Error(`上游未返回图片: ${JSON.stringify(data).slice(0, 200)}`);
      const urls: string[] = [];
      for (let i = 0; i < (req.count ?? 1); i++) urls.push(`data:image/png;base64,${b64}`);
      return { jobId: `sync-${Date.now()}`, status: "succeeded", mediaUrls: urls, raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      await adapter.submit({ modality: "image", prompt: "a red apple on a white table", ratio: "1:1", resolution: "720p" }, key);
      return { ok: true, msg: "测试出图成功（消耗 1 次免费额度）" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
