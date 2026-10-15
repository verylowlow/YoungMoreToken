import { registerAdapter } from "../registry";
import { classifyHttp, classifyNetworkErr } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Google Cloud Text-to-Speech（每月 100 万标准音色字符免费）=====
// Key：Google Cloud API Key（需开 TTS API）。免费档仅标准音色；Neural2/Chirp 收费
// 端点：POST https://texttospeech.googleapis.com/v1/text:synthesize?key=<KEY>

const BASE = "https://texttospeech.googleapis.com/v1";

export const meta = {
  slug: "google-tts",
  name: "Google Cloud TTS（每月100万字符免费）",
  modalities: ["audio" as const],
  region: "intl" as const,
  quality: 80,
  docs: "https://cloud.google.com/text-to-speech/docs",
};

const VOICES = [
  { id: "zh-CN-Standard-A", name: "普通话·女声A", lang: "zh-CN" },
  { id: "zh-CN-Standard-B", name: "普通话·男声B", lang: "zh-CN" },
  { id: "zh-CN-Standard-C", name: "普通话·女声C", lang: "zh-CN" },
  { id: "zh-CN-Standard-D", name: "普通话·男声D", lang: "zh-CN" },
  { id: "zh-TW-Standard-A", name: "台湾普通话·女声", lang: "zh-TW" },
  { id: "zh-HK-Standard-A", name: "中国香港粤语·女声", lang: "zh-HK" },
  { id: "en-US-Standard-C", name: "English·Female C", lang: "en-US" },
  { id: "en-US-Standard-D", name: "English·Male D", lang: "en-US" },
  { id: "en-GB-Standard-A", name: "British·Female A", lang: "en-GB" },
  { id: "ja-JP-Standard-A", name: "日本語·女声", lang: "ja-JP" },
  { id: "ko-KR-Standard-A", name: "한국어·여성", lang: "ko-KR" },
  { id: "fr-FR-Standard-A", name: "Français·Femme", lang: "fr-FR" },
];

const CAPABILITY: Capability = {
  native_audio: true,
  commercial_ok: true,
  quality: 80,
  avg_latency_ms: 2_500,
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
    const voice = req.audio?.voice ?? VOICES[0].id;
    const lang = voice.split("-").slice(0, 2).join("-");
    try {
      const res = await fetch(`${BASE}/text:synthesize?key=${encodeURIComponent(_key.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: lang, name: voice },
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0 },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const raw = await res.text();
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}: ${raw.slice(0, 200)}`), { errorClass: classifyHttp(res.status, raw) as ErrorClass });
      }
      const data = JSON.parse(raw);
      if (!data.audioContent) throw new Error(`上游未返回音频: ${raw.slice(0, 200)}`);
      return { jobId: `sync-${Date.now()}`, status: "succeeded", mediaUrls: [`data:audio/mpeg;base64,${data.audioContent}`] };
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
      const job = await adapter.submit({ modality: "audio", prompt: "你好，这是一次连通性测试。", audio: { voice: VOICES[0].id, text: "你好，这是一次连通性测试。" } }, key);
      const ok = (job.mediaUrls?.[0] ?? "").length > 1000;
      return ok ? { ok: true, msg: "Google TTS 测试成功（标准音色·免费档）" } : { ok: false, msg: "返回音频异常" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
