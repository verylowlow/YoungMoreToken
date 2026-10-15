import { registerAdapter } from "../registry";
import { classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== ElevenLabs TTS（免费档约 1 万字符/月）=====
// Key：xi-api-key

const BASE = "https://api.elevenlabs.io/v1";

export const meta = {
  slug: "elevenlabs-tts",
  name: "ElevenLabs（TTS 免费档）",
  modalities: ["audio" as const],
  quality: 92,
  docs: "https://elevenlabs.io/docs",
};

const VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel（英文·女）", lang: "en-US" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella（英文·女）", lang: "en-US" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni（英文·男）", lang: "en-US" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel（英文·男·播报）", lang: "en-GB" },
];

const CAPABILITY: Capability = {
  native_audio: true,
  commercial_ok: false, // 免费档非商用
  quality: 92,
  avg_latency_ms: 2_000,
  unit: "chars",
  cost_per_call: 0,
  voices: VOICES,
};

function wrap(fn: () => Promise<UpstreamJob>) {
  return fn().catch((err) => {
    if (err instanceof UpstreamHttpError) throw Object.assign(new Error(err.message), { errorClass: classifyHttp(err.status, err.body) });
    throw Object.assign(err as Error, { errorClass: classifyNetworkErr(err) });
  });
}

export const adapter: ProviderAdapter = {
  slug: meta.slug,
  capabilities: () => CAPABILITY,

  async submit(req: NormalizedRequest, _key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const text = req.audio?.text ?? req.prompt;
      if (!text) throw new Error("TTS 需要文本");
      const voiceId = req.audio?.voice ?? VOICES[0].id;
      const res = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": _key.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new UpstreamHttpError(res.status, await res.text());
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error("ElevenLabs 未返回音频");
      return {
        jobId: `sync-${Date.now()}`,
        status: "succeeded",
        mediaUrls: [`data:audio/mpeg;base64,${buf.toString("base64")}`],
      };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      await adapter.submit({ modality: "audio", prompt: "Hello, this is a connectivity test.", audio: { text: "Hello, this is a connectivity test." } }, key);
      return { ok: true, msg: "ElevenLabs 合成成功（消耗少量字符额度）" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
