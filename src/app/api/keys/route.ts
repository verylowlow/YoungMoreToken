import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt, keyHash, maskKey } from "@/lib/crypto";

// GET /api/keys —— 全部 key（脱敏）
export async function GET() {
  const keys = await prisma.apiKey.findMany({
    include: { provider: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      providerId: k.providerId,
      providerSlug: k.provider.slug,
      providerName: k.provider.name,
      label: k.label,
      masked: maskKey(k.keyEnc.slice(-8)),
      status: k.status,
      priority: k.priority,
      quotaUsed: k.quotaUsed,
      quotaTotal: k.quotaTotal,
      resetRule: k.resetRule,
      resetAt: k.resetAt,
      cooldownTill: k.cooldownTill,
      health: k.health,
      successCount: k.successCount,
      failCount: k.failCount,
      avgLatencyMs: k.avgLatencyMs,
    })),
  });
}

// POST /api/keys —— 新增 key（同平台 key 不重复）
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { providerId, apiKey, label, priority, quotaTotal, resetRule } = body ?? {};
  if (!providerId || !apiKey) return NextResponse.json({ error: "providerId 与 apiKey 必填" }, { status: 400 });

  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider) return NextResponse.json({ error: "平台不存在" }, { status: 404 });

  const hash = keyHash(providerId, apiKey);
  const dup = await prisma.apiKey.findUnique({ where: { providerId_keyHash: { providerId, keyHash: hash } } });
  if (dup) return NextResponse.json({ error: "该 key 已存在（同平台不重复）" }, { status: 409 });

  const reset = resetRule ?? "none";
  const resetAt =
    reset === "daily" ? new Date(Date.now() + 86400_000) : reset === "monthly" ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1) : null;

  const key = await prisma.apiKey.create({
    data: {
      providerId,
      label: label ?? "",
      keyEnc: encrypt(apiKey),
      keyHash: hash,
      priority: Number(priority) || 0,
      quotaTotal: quotaTotal === null || quotaTotal === undefined || quotaTotal === "" ? null : Number(quotaTotal),
      resetRule: reset,
      resetAt,
    },
  });
  return NextResponse.json({ ok: true, id: key.id });
}
