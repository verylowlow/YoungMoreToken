import { registerAdapter } from "../registry";
import { classifyHttp, classifyNetworkErr } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== OpenAI TTS（tts-1 / tts-1-hd / gpt-4o-mini-tts，按量付费）=====
// 返回二进制音频；覆盖"采购来的 API"场景

const BASE = "https://api.openai.com/v1";

export const meta = {
  slug: "openai-tts",
  name: "OpenAI TTS（付费·高质量）",
  modalities: ["audio" as const],
  region: "intl" as const,
  quality: 90,
  docs: "https://platform.openai.com/docs/guides/text-to-speech",
};

const VOICES = [
  { id: "alloy", name: "Alloy（中性·均衡）", lang: "multi" },
  { id: "echo", name: "Echo（男声·沉稳）", lang: "multi" },
  { id: "fable", name: "Fable（英伦·叙事）", lang: "multi" },
  { id: "onyx", name: "Onyx（男声·低沉）", lang: "multi" },
  { id: "nova", name: "Nova（女声·明亮）", lang: "multi" },
  { id: "shimmer", name: "Shimmer（女声·柔和）", lang: "multi" },
  { id: "coral", name: "Coral（女声·温暖）", lang: "multi" },
  { id: "sage", name: "Sage（中性·沉稳）", lang: "multi" },
];

const CAPABILITY: Capability = {
  native_audio: true,
  commercial_ok: true,
  quality: 90,
  avg_latency_ms: 3_000,
  unit: "chars",
  cost_per_call: 1,
  voices: VOICES,
};

export const adapter: ProviderAdapter = {
  slug: meta.slug,
  modalities: meta.modalities,
  capabilities: () => CAPABILITY,

  async submit(req: NormalizedRequest, _key: ResolvedKey): Promise<UpstreamJob> {
    const text = req.audio?.text ?? req.prompt;
    if (!text) throw new Error("TTS 需要文本");
    try {
      const res = await fetch(`${BASE}/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${_key.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: (req.extras?.model as string) || "gpt-4o-mini-tts",
          input: text,
          voice: req.audio?.voice ?? VOICES[0].id,
          response_format: "mp3",
          speed: 1.0,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const t = await res.text();
        throw Object.assign(new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`), { errorClass: classifyHttp(res.status, t) as ErrorClass });
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error("上游未返回音频数据");
      return { jobId: `sync-${Date.now()}`, status: "succeeded", mediaUrls: [`data:audio/mpeg;base64,${buf.toString("base64")}`] };
    } catch (err) {
      if ((err as { errorClass?: string })?.errorClass) throw err;
      throw Object.assign(err as Error, { errorClass: classifyNetworkErr(err) as ErrorClass });
    }
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? "transient";
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "audio", prompt: "你好，这是一次连通性测试。", audio: { voice: VOICES[0].id, text: "Hello, this is a connectivity test." } }, key);
      const ok = (job.mediaUrls?.[0] ?? "").length > 1000;
      return ok ? { ok: true, msg: "OpenAI TTS 测试成功（按量计费）" } : { ok: false, msg: "返回音频异常" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
