import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/tasks/[id]/cancel —— 取消排队中的任务
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (t.status !== "queued") return NextResponse.json({ error: "只能取消排队中的任务" }, { status: 409 });
  await prisma.task.update({ where: { id }, data: { status: "canceled", finishedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
