import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "./db";
import { getSetting } from "./settings";
import type { MediaRef, MediaSupply } from "./types";

// ===== 媒体供给层 =====
// 上游要图片时有两种吃法：base64 直传 / 公网 URL。
// 策略（设置项 media.supply）：
//   auto       —— 配置了公网基地址就走 URL，否则 base64（默认）
//   base64     —— 永远 base64 直传
//   public_url —— 永远拼公网 URL（配了 PUBLIC_BASE_URL 或穿透地址时）
// 产物与输入素材统一落盘 data/media，经 /api/media/[id] 对外服务。

const MEDIA_DIR = path.join(process.cwd(), "data", "media");

async function ensureDir() {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
  };
  return map[mime] ?? "bin";
}

function parseDataUrl(dataUrl: string): { buf: Buffer; mime: string } {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("invalid data url");
  const mime = m[1];
  const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  return { buf, mime };
}

export function absMediaPath(uri: string): string {
  return path.join(MEDIA_DIR, uri);
}

async function writeMedia(buf: Buffer, mime: string, record: { taskId?: string; kind: string; watermark?: boolean } & Record<string, unknown>) {
  await ensureDir();
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extFromMime(mime)}`;
  await fs.writeFile(path.join(MEDIA_DIR, name), buf);
  return prisma.media.create({
    data: {
      taskId: record.taskId ?? null,
      kind: record.kind,
      uri: name,
      mime,
      sizeBytes: buf.length,
      watermark: record.watermark ?? false,
    },
  });
}

/** 前端上传的输入素材（base64 data URL）→ 入库 */
export async function saveInputMedia(dataUrl: string, mime?: string) {
  const { buf, mime: detected } = parseDataUrl(dataUrl);
  return writeMedia(buf, mime ?? detected, { kind: "input" });
}

/** 上游产物 → 入库（URL 下载或 base64 解码） */
export async function saveOutputMedia(
  taskId: string,
  kind: "video" | "image" | "audio",
  source: { url: string } | { base64: string; mime: string },
  opts: { watermark?: boolean; durationMs?: number; width?: number; height?: number } = {}
) {
  if ("url" in source) {
    const res = await fetch(source.url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`下载产物失败 HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
    const rec = await writeMedia(buf, mime, { taskId, kind, watermark: opts.watermark });
    return prisma.media.update({ where: { id: rec.id }, data: { durationMs: opts.durationMs ?? null, width: opts.width ?? null, height: opts.height ?? null } });
  }
  const { buf, mime } = parseDataUrl(source.base64.startsWith("data:") ? source.base64 : `data:${source.mime};base64,${source.base64}`);
  const rec = await writeMedia(buf, mime, { taskId, kind, watermark: opts.watermark });
  return prisma.media.update({ where: { id: rec.id }, data: { durationMs: opts.durationMs ?? null, width: opts.width ?? null, height: opts.height ?? null } });
}

export async function getPublicBase(): Promise<string> {
  const fromSetting = (await getSetting("media.publicBaseUrl")) ?? "";
  const base = fromSetting || process.env.PUBLIC_BASE_URL || "";
  return base.replace(/\/+$/, "");
}

/**
 * 把 MediaRef 解析成上游可用的形态。
 * 返回 { base64 } 或 { url }，至少其一非空。
 */
export async function resolveMediaRef(ref: MediaRef): Promise<{ base64?: string; url?: string }> {
  const strategy = ((await getSetting("media.supply")) as MediaSupply) ?? "auto";
  if (ref.kind === "url") return { url: ref.value };
  if (ref.kind === "base64") return { base64: ref.value };

  // kind === "media"：查库拿本地文件
  const rec = await prisma.media.findUnique({ where: { id: ref.value } });
  if (!rec) throw new Error(`媒体不存在: ${ref.value}`);
  const abs = absMediaPath(rec.uri);

  if (strategy === "base64") {
    const buf = await fs.readFile(abs);
    return { base64: `data:${rec.mime};base64,${buf.toString("base64")}` };
  }
  if (strategy === "public_url" || strategy === "auto") {
    const base = await getPublicBase();
    if (base) return { url: `${base}/api/media/${rec.id}` };
    if (strategy === "public_url") throw new Error("媒体供给策略为 public_url 但未配置公网基地址");
    const buf = await fs.readFile(abs);
    return { base64: `data:${rec.mime};base64,${buf.toString("base64")}` };
  }
  throw new Error(`未知媒体供给策略: ${strategy}`);
}
