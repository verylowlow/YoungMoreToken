import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== OpenRouter · 图像模型（每天约 50 次免费 + 低价）=====
// 用 chat/completions + modalities:["image","text"] 调用图像模型（如 Nano Banana）

const BASE = "https://openrouter.ai/api/v1";
const MODEL = "google/gemini-2.5-flash-image-preview";

export const meta = {
  slug: "openrouter-image",
  name: "OpenRouter（图像模型）",
  modalities: ["image" as const],
  quality: 82,
  docs: "https://openrouter.ai/docs",
};

const CAPABILITY: Capability = {
  ratios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  resolutions: ["720p", "1080p"],
  commercial_ok: true,
  quality: 82,
  avg_latency_ms: 20_000,
  unit: "calls",
  cost_per_call: 1,
};

function extractImages(data: any): string[] {
  const msg = data?.choices?.[0]?.message;
  const urls: string[] = [];
  if (Array.isArray(msg?.images)) {
    for (const im of msg.images) {
      const u = im?.image_url?.url ?? im?.url;
      if (typeof u === "string" && u.startsWith("data:")) urls.push(u);
    }
  }
  if (Array.isArray(msg?.content)) {
    for (const part of msg.content) {
      if (part?.type === "image_url" && typeof part?.image_url?.url === "string") urls.push(part.image_url.url);
    }
  }
  return urls;
}

function wrap(fn: () => Promise<UpstreamJob>) {
  return fn().catch((err) => {
    if (err instanceof UpstreamHttpError) throw Object.assign(new Error(err.message), { errorClass: classifyHttp(err.status, err.body) });
    throw Object.assign(err as Error, { errorClass: classifyNetworkErr(err) });
  });
}

export const adapter: ProviderAdapter = {
  slug: meta.slug,
  capabilities: () => CAPABILITY,

  async submit(req: NormalizedRequest, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const data = await fetchJson(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.apiKey}`, "HTTP-Referer": "https://github.com/verylowlow/YoungMoreToken" },
        body: JSON.stringify({
          model: MODEL,
          modalities: ["image", "text"],
          messages: [{ role: "user", content: [{ type: "text", text: req.prompt }] }],
        }),
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
      await adapter.submit({ modality: "image", prompt: "a green plant on the windowsill", ratio: "1:1" }, key);
      return { ok: true, msg: "测试出图成功" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
