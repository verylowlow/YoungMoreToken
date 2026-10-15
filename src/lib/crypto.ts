import crypto from "crypto";

// ===== AES-256-GCM 加密封装 =====
// 主密钥来源：环境变量 FREEVIDEO_MASTER_KEY（32 字节 base64）
// 密文格式：base64( iv(12) || ciphertext || tag(16) )

function getMasterKey(): Buffer {
  const raw = process.env.FREEVIDEO_MASTER_KEY;
  if (!raw || raw.startsWith("请替换")) {
    // 开发兜底：派生一个固定密钥并告警（生产必须配置真密钥）
    if (process.env.NODE_ENV === "production") {
      throw new Error("FREEVIDEO_MASTER_KEY 未配置，拒绝启动（见 .env.example）");
    }
    console.warn("[羊毛token] FREEVIDEO_MASTER_KEY 未配置，使用开发兜底密钥，请勿用于真实 Key");
    return crypto.createHash("sha256").update("youngmoretoken-dev-fallback").digest();
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("FREEVIDEO_MASTER_KEY 必须是 32 字节 base64");
  return buf;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getMasterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const enc = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getMasterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** keyHash：用于"同平台 key 不重复"查重，不明文存储 */
export function keyHash(providerId: string, apiKey: string): string {
  return crypto.createHash("sha256").update(`${providerId}::${apiKey}`).digest("hex");
}

/** UI 脱敏展示 */
export function maskKey(k: string): string {
  if (k.length <= 8) return "****";
  return `${k.slice(0, 4)}****${k.slice(-4)}`;
}
