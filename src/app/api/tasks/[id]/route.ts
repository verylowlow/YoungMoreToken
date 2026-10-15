import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/tasks/[id] —— 任务详情（前端轮询进度）
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  const provider = t.providerId ? await prisma.provider.findUnique({ where: { id: t.providerId } }) : null;
  const media = t.mediaIds
    ? await prisma.media.findMany({ where: { id: { in: JSON.parse(t.mediaIds) as string[] } } })
    : [];
  return NextResponse.json({
    id: t.id,
    modality: t.modality,
    status: t.status,
    request: JSON.parse(t.request),
    providerName: provider?.name ?? null,
    errorCode: t.errorCode,
    errorMsg: t.errorMsg,
    costEstimate: t.costEstimate,
    queuedAt: t.queuedAt,
    finishedAt: t.finishedAt,
    media: media.map((m) => ({ id: m.id, kind: m.kind, mime: m.mime, watermark: m.watermark, sizeBytes: m.sizeBytes, durationMs: m.durationMs })),
  });
}
