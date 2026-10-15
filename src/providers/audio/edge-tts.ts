import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { registerAdapter } from "../registry";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== Edge-TTS（微软 Edge 大声朗读，免费、无需 Key）=====
// 实现方式：把官方开源库 edge-tts 的 CLI 当 sidecar 子进程调。
// 为什么不原生实现 WebSocket 协议：微软自 2025 年起启用了 v2 DRM 令牌
// （改造版 SHA-256 + CS64 摘要 + 300 秒时间窗），手搓令牌等于逆向一套
// 反自动化机制，与本项目"不做逆向"的立场冲突；且上游随时会再变。
// 官方库（MIT 生态、活跃维护）负责协议，我们只做进程编排与产物搬运。
//
// 依赖：Python 3.8+ 且 `pip install edge-tts`。
// 环境不具备时：该源自动标记 unavailable → 停用 → 路由平滑切到
// ElevenLabs / Azure 免费档，装好后在设置页点"测试"即自动恢复。

const PYTHON_CMD = process.env.EDGE_TTS_PYTHON || "python";
const PROBE_RETRY_MS = 60_000; // 探测失败后的重试间隔（装完依赖不用重启也能恢复）

interface ProbeResult {
  ok: boolean;
  msg?: string;
}

let probeCache: (ProbeResult & { at: number }) | null = null;

function runCmd(args: string[], timeoutMs = 60_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(PYTHON_CMD, args, { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (out += d.toString()));
    const timer = setTimeout(() => {
      try {
        p.kill();
      } catch {}
    }, timeoutMs);
    p.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, out: String(err?.message ?? err) });
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out });
    });
  });
}

/** 环境探测（带缓存）：python 在不在、edge_tts 模块装没装 */
async function probeEnv(): Promise<ProbeResult> {
  if (probeCache && (probeCache.ok || Date.now() - probeCache.at < PROBE_RETRY_MS)) {
    return probeCache;
  }
  const r = await runCmd(["-m", "edge_tts", "--version"], 20_000);
  const result: ProbeResult =
    r.code === 0
      ? { ok: true }
      : {
          ok: false,
          msg:
            r.code === -1
              ? `未找到 Python 解释器（${PYTHON_CMD}）。请安装 Python 3.8+ 并加入 PATH；可用环境变量 EDGE_TTS_PYTHON 指定解释器路径`
              : `edge-tts 未安装或运行失败：${r.out.trim().slice(0, 160) || `exit ${r.code}`}。修复：pip install edge-tts`,
        };
  probeCache = { ...result, at: Date.now() };
  return result;
}

export const meta = {
  slug: "edge-tts",
  name: "Edge-TTS（免费·无需Key）",
  modalities: ["audio" as const],
  quality: 72,
  docs: "https://github.com/rany2/edge-tts",
};

const VOICES = [
  { id: "zh-CN-XiaoxiaoNeural", name: "晓晓（女声·温暖）", lang: "zh-CN" },
  { id: "zh-CN-XiaoyiNeural", name: "晓伊（女声·甜美）", lang: "zh-CN" },
  { id: "zh-CN-YunjianNeural", name: "云健（男声·运动）", lang: "zh-CN" },
  { id: "zh-CN-YunyangNeural", name: "云扬（男声·新闻）", lang: "zh-CN" },
  { id: "zh-CN-YunxiNeural", name: "云希（男声·少年）", lang: "zh-CN" },
  { id: "en-US-AriaNeural", name: "Aria（英文·女）", lang: "en-US" },
  { id: "en-US-GuyNeural", name: "Guy（英文·男）", lang: "en-US" },
  { id: "ja-JP-NanamiNeural", name: "Nanami（日语·女）", lang: "ja-JP" },
];

const CAPABILITY: Capability = {
  native_audio: true,
  commercial_ok: false, // 非官方通道，不建议商用
  quality: 72,
  avg_latency_ms: 3_000,
  unit: "chars",
  cost_per_call: 0,
  voices: VOICES,
};

/** 走 sidecar 合成一段语音，返回 mp3 Buffer */
async function synth(text: string, voice: string): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ymt-edge-"));
  const txtFile = path.join(dir, "text.txt");
  const outFile = path.join(dir, "out.mp3");
  try {
    // 文本走文件传入，避开 Windows 命令行 8191 字符上限
    await fs.writeFile(txtFile, text, "utf8");
    const r = await runCmd([
      "-m",
      "edge_tts",
      "--file",
      txtFile,
      "--voice",
      voice,
      "--write-media",
      outFile,
      "--no-progress",
    ]);
    if (r.code !== 0) {
      throw new Error(`edge-tts 合成失败（exit ${r.code}）：${r.out.trim().slice(0, 200)}`);
    }
    const buf = await fs.readFile(outFile);
    if (!buf.length) throw new Error("edge-tts 未输出音频数据");
    return buf;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export const adapter: ProviderAdapter = {
  slug: meta.slug,
  modalities: meta.modalities,
  capabilities: () => CAPABILITY,

  async submit(req: NormalizedRequest, _key: ResolvedKey): Promise<UpstreamJob> {
    const text = req.audio?.text ?? req.prompt;
    if (!text) throw new Error("TTS 需要文本");

    const env = await probeEnv();
    if (!env.ok) {
      throw Object.assign(new Error(`Edge-TTS 环境不可用：${env.msg}`), {
        errorClass: "unavailable" as ErrorClass,
      });
    }

    const voice = req.audio?.voice ?? VOICES[0].id;
    try {
      const audio = await synth(text, voice);
      return {
        jobId: `sync-${Date.now()}`,
        status: "succeeded",
        mediaUrls: [`data:audio/mpeg;base64,${audio.toString("base64")}`],
      };
    } catch (err) {
      throw Object.assign(err as Error, { errorClass: "transient" as ErrorClass });
    }
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? "transient";
  },

  async testKey(_key: ResolvedKey) {
    const env = await probeEnv();
    if (!env.ok) return { ok: false, msg: env.msg! };
    try {
      await synth("你好，这是一次连通性测试。", VOICES[0].id);
      return { ok: true, msg: "Edge-TTS 合成成功（免费通道）" };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
