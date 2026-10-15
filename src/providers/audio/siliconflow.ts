import { registerAdapter } from "../registry";
import { classifyHttp, classifyNetworkErr } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== 硅基流动 SiliconFlow 语音合成（国内·CosyVoice2 免费）=====
// 模型 FunAudioLLM/CosyVoice2-0.5B 免费；返回二进制 mp3

const BASE = "https://api.siliconflow.cn/v1";

export const meta = {
  slug: "siliconflow-tts",
  name: "硅基流动（国内·CosyVoice2 免费）",
  modalities: ["audio" as const],
  region: "cn" as const,
  quality: 76,
  docs: "https://docs.siliconflow.com/cn/api-reference/audio/create-speech",
};

const VOICES = [
  { id: "alex", name: "Alex（男声·沉稳）", lang: "en" },
  { id: "anna", name: "Anna（女声·温和）", lang: "en" },
  { id: "bella", name: "Bella（女声·清亮）", lang: "en" },
  { id: "benjamin", name: "Benjamin（男声·低沉）", lang: "en" },
  { id: "charles", name: "Charles（男声·英伦）", lang: "en" },
  { id: "claire", name: "Claire（女声·知性）", lang: "en" },
  { id: "david", name: "David（男声·新闻）", lang: "en" },
  { id: "diana", name: "Diana（女声·甜美）", lang: "en" },
];

const CAPABILITY: Capability = {
  native_audio: true,
  commercial_ok: true,
  quality: 76,
  avg_latency_ms: 4_000,
  unit: "chars",
  cost_per_call: 0,
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
          model: "FunAudioLLM/CosyVoice2-0.5B",
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
      return {
        jobId: `sync-${Date.now()}`,
        status: "succeeded",
        mediaUrls: [`data:audio/mpeg;base64,${buf.toString("base64")}`],
      };
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
      return ok ? { ok: true, msg: "硅基流动 TTS 测试成功（CosyVoice2 免费）" } : { ok: false, msg: "返回音频异常" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
