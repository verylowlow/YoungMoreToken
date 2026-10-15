import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/tasks/[id]/retry —— 失败任务重新入队（可改参数）
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (t.status === "queued" || t.status === "running") {
    return NextResponse.json({ error: "任务仍在进行中" }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  const request = body.request ? JSON.stringify(body.request) : t.request;
  await prisma.task.update({
    where: { id },
    data: {
      status: "queued",
      request,
      attempts: 0,
      errorCode: null,
      errorMsg: null,
      providerId: null,
      apiKeyId: null,
      finishedAt: null,
      queuedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}
