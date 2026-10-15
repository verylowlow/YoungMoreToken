import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/keys/[id] —— 改状态/优先级/额度/备注
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.label === "string") data.label = body.label;
  if (typeof body.status === "string") data.status = body.status;
  if (typeof body.priority === "number") data.priority = body.priority;
  if (body.quotaTotal === null || typeof body.quotaTotal === "number") data.quotaTotal = body.quotaTotal;
  if (typeof body.resetRule === "string") {
    data.resetRule = body.resetRule;
    data.resetAt =
      body.resetRule === "daily"
        ? new Date(Date.now() + 86400_000)
        : body.resetRule === "monthly"
          ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
          : null;
  }
  if (body.resetQuota === true) {
    data.quotaUsed = 0;
    data.cooldownTill = null;
    if (data.status === undefined) data.status = "active";
  }
  await prisma.apiKey.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// DELETE /api/keys/[id]
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await prisma.apiKey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
