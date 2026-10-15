import { prisma } from "./db";

// ===== 系统设置 =====

export const SETTING_DEFAULTS: Record<string, string> = {
  "routing.strategy": "quality_first", // quality_first | round_robin | least_used
  "routing.maxAttempts": "3",
  "routing.weights": JSON.stringify({ quality: 0.5, remaining: 0.3, health: 0.1, priority: 0.1 }),
  "media.supply": "auto", // auto | base64 | public_url
  "media.publicBaseUrl": "",
};

export async function getSetting(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row) return row.value;
  return SETTING_DEFAULTS[key];
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const out: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export function getRoutingConfig(settings: Record<string, string>) {
  let weights = { quality: 0.5, remaining: 0.3, health: 0.1, priority: 0.1 };
  try {
    weights = { ...weights, ...JSON.parse(settings["routing.weights"] ?? "{}") };
  } catch {
    /* 用默认权重 */
  }
  return {
    strategy: (settings["routing.strategy"] ?? "quality_first") as "quality_first" | "round_robin" | "least_used",
    maxAttempts: Math.max(1, Math.min(10, Number(settings["routing.maxAttempts"] ?? 3))),
    weights,
  };
}
