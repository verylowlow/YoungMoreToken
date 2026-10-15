import { registerAdapter } from "../registry";
import { classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Azure TTS（免费档约 50 万字符/月）=====
// Key 格式：`subscriptionKey|region`（region 如 eastasia；不填默认 eastasia）

export const meta = {
  slug: "azure-tts",
  name: "Azure TTS（免费档 50 万字符/月）",
  modalities: ["audio" as const],
  quality: 85,
  docs: "https://learn.microsoft.com/azure/ai-services/speech-service",
};

const VOICES = [
  { id: "zh-CN-XiaoxiaoNeural", name: "晓晓（女声·温暖）", lang: "zh-CN" },
  { id: "zh-CN-XiaoyiNeural", name: "晓伊（女声·甜美）", lang: "zh-CN" },
  { id: "zh-CN-YunxiNeural", name: "云希（男声·少年）", lang: "zh-CN" },
  { id: "zh-CN-YunyangNeural", name: "云扬（男声·新闻）", lang: "zh-CN" },
  { id: "en-US-JennyNeural", name: "Jenny（英文·女）", lang: "en-US" },
];

const CAPABILITY: Capability = {
  native_audio: true,
  commercial_ok: false, // 免费档非商用
  quality: 85,
  avg_latency_ms: 1_500,
  unit: "chars",
  cost_per_call: 0,
  voices: VOICES,
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string);
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
      const text = req.audio?.text ?? req.prompt;
      if (!text) throw new Error("TTS 需要文本");
      const [subKey, region = "eastasia"] = key.apiKey.split("|");
      if (!subKey) throw new Error("Azure Key 格式应为 subscriptionKey|region");
      const voice = req.audio?.voice ?? VOICES[0].id;
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
        `<voice name='${voice}'>${escapeXml(text)}</voice></speak>`;

      const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": subKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "YoungMoreToken",
        },
        body: ssml,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new UpstreamHttpError(res.status, await res.text());
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error("Azure 未返回音频");
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
      await adapter.submit({ modality: "audio", prompt: "你好，这是一次连通性测试。", audio: { text: "你好，这是一次连通性测试。" } }, key);
      return { ok: true, msg: "Azure 合成成功（消耗少量字符额度）" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
