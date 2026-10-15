import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdapter } from "@/providers/registry";
import "@/providers/index"; // 确保适配器已注册（Next 各路由独立打包）
import type { Capability } from "@/lib/types";

// GET /api/providers —— 平台目录（含 key 数与剩余额度概况）
export async function GET() {
  const providers = await prisma.provider.findMany({ include: { keys: true }, orderBy: { createdAt: "asc" } });
  const out = providers.map((p) => {
    const cap: Capability = getAdapter(p.slug)?.capabilities() ?? (JSON.parse(p.manifest || "{}") as Capability);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      kind: p.kind,
      modalities: JSON.parse(p.modalities) as string[],
      quality: p.quality || cap.quality || 50,
      enabled: p.enabled,
      capability: cap,
      keys: p.keys.map((k) => ({
        id: k.id,
        label: k.label,
        status: k.status,
        quotaUsed: k.quotaUsed,
        quotaTotal: k.quotaTotal,
        resetRule: k.resetRule,
        cooldownTill: k.cooldownTill,
        priority: k.priority,
        successCount: k.successCount,
        failCount: k.failCount,
        avgLatencyMs: k.avgLatencyMs,
      })),
    };
  });
  return NextResponse.json({ providers: out });
}

// PATCH /api/providers —— 启用/禁用平台、覆盖质量分
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, enabled, quality } = body ?? {};
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (typeof enabled === "boolean") data.enabled = enabled;
  if (typeof quality === "number") data.quality = quality;
  await prisma.provider.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
