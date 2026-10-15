import { registerAdapter } from "../registry";
import { classifyHttp, classifyNetworkErr } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== MiniMax 语音合成（国内，speech-02 系列）=====
// 注意：返回的 audio 字段是 HEX 编码（不是 base64），已做自动识别
// Key 格式：apiKey|GroupId

const BASE = "https://api.minimaxi.com/v1";

export const meta = {
  slug: "minimax-tts",
  name: "MiniMax（国内·语音合成）",
  modalities: ["audio" as const],
  region: "cn" as const,
  quality: 84,
  docs: "https://platform.minimaxi.com/document/T2A%20V2",
};

const VOICES = [
  { id: "male-qn-qingse", name: "青涩男声", lang: "zh" },
  { id: "male-qn-jingyu", name: "精英宇声", lang: "zh" },
  { id: "female-shaonv", name: "少女音", lang: "zh" },
  { id: "female-yujie", name: "御姐音", lang: "zh" },
  { id: "female-tianmei", name: "甜美音", lang: "zh" },
  { id: "male-qn-badao", name: "霸道男声", lang: "zh" },
  { id: "audiobook_male_1", name: "有声书男声", lang: "zh" },
  { id: "audiobook_female_1", name: "有声书女声", lang: "zh" },
  { id: "en_male_adam", name: "Adam（英文男）", lang: "en" },
  { id: "en_female_aria", name: "Aria（英文女）", lang: "en" },
];

const CAPABILITY: Capability = {
  native_audio: true,
  commercial_ok: true,
  quality: 84,
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
    const gid = _key.apiKey.split("|")[1];
    try {
      const res = await fetch(`${BASE}/t2a_v2${gid ? `?GroupId=${encodeURIComponent(gid)}` : ""}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${_key.apiKey.split("|")[0]}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "speech-02-turbo",
          text,
          voice_setting: { voice_id: req.audio?.voice ?? VOICES[0].id, speed: 1.0, vol: 1.0, pitch: 0 },
          audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3" },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const raw = await res.text();
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}: ${raw.slice(0, 200)}`), { errorClass: classifyHttp(res.status, raw) as ErrorClass });
      }
      let data: any;
      try { data = JSON.parse(raw); } catch { throw new Error(`上游返回非 JSON: ${raw.slice(0, 200)}`); }
      if (data.base_resp && data.base_resp.status_code !== 0) {
        throw Object.assign(new Error(`MiniMax 错误 ${data.base_resp.status_code}: ${data.base_resp.status_msg}`), {
          errorClass: data.base_resp.status_code === 1008 ? "quota_exhausted" : "unsupported" as ErrorClass,
        });
      }
      const audio = data.data?.audio;
      if (!audio) throw new Error(`上游未返回音频: ${JSON.stringify(data).slice(0, 200)}`);
      // MiniMax 返回 HEX 编码；容错识别 base64
      const buf = /^[0-9a-f]+$/i.test(audio) && audio.length % 2 === 0 ? Buffer.from(audio, "hex") : Buffer.from(audio, "base64");
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
      const job = await adapter.submit({ modality: "audio", prompt: "测试", audio: { voice: VOICES[0].id, text: "你好，这是一次连通性测试。" } }, key);
      const ok = (job.mediaUrls?.[0] ?? "").length > 1000;
      return ok ? { ok: true, msg: "MiniMax TTS 测试成功" } : { ok: false, msg: "返回音频异常" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
