import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/tasks?modality=&status=&limit= —— 任务列表（含产物）
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const modality = searchParams.get("modality");
  const status = searchParams.get("status");
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));

  const tasks = await prisma.task.findMany({
    where: {
      ...(modality ? { modality } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { queuedAt: "desc" },
    take: limit,
  });

  const providerIds = [...new Set(tasks.map((t) => t.providerId).filter(Boolean))] as string[];
  const providers = providerIds.length ? await prisma.provider.findMany({ where: { id: { in: providerIds } } }) : [];
  const providerMap = new Map(providers.map((p) => [p.id, p.name]));

  const mediaIds = tasks.flatMap((t) => (t.mediaIds ? (JSON.parse(t.mediaIds) as string[]) : []));
  const media = mediaIds.length ? await prisma.media.findMany({ where: { id: { in: mediaIds } } }) : [];
  const mediaMap = new Map(media.map((m) => [m.id, m]));

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      modality: t.modality,
      status: t.status,
      request: JSON.parse(t.request),
      providerName: t.providerId ? providerMap.get(t.providerId) ?? null : null,
      attempts: t.attempts,
      errorCode: t.errorCode,
      errorMsg: t.errorMsg,
      costEstimate: t.costEstimate,
      queuedAt: t.queuedAt,
      finishedAt: t.finishedAt,
      media: (t.mediaIds ? (JSON.parse(t.mediaIds) as string[]) : []).map((id) => {
        const m = mediaMap.get(id);
        return m ? { id: m.id, kind: m.kind, mime: m.mime, watermark: m.watermark, sizeBytes: m.sizeBytes, durationMs: m.durationMs } : null;
      }).filter(Boolean),
    })),
  });
}
