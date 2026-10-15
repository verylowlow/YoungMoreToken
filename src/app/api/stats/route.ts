import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/stats —— 统计看板：今日生成、成功率、各 key 消耗
export async function GET() {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [todayTotal, todaySucceeded, allTotal, allSucceeded, keys] = await Promise.all([
    prisma.task.count({ where: { queuedAt: { gte: dayStart } } }),
    prisma.task.count({ where: { queuedAt: { gte: dayStart }, status: "succeeded" } }),
    prisma.task.count(),
    prisma.task.count({ where: { status: "succeeded" } }),
    prisma.apiKey.findMany({ include: { provider: true }, orderBy: { quotaUsed: "desc" } }),
  ]);

  return NextResponse.json({
    today: { total: todayTotal, succeeded: todaySucceeded },
    all: { total: allTotal, succeeded: allSucceeded, rate: allTotal ? Math.round((allSucceeded / allTotal) * 100) : 0 },
    keys: keys.map((k) => ({
      id: k.id,
      providerName: k.provider.name,
      label: k.label,
      status: k.status,
      quotaUsed: k.quotaUsed,
      quotaTotal: k.quotaTotal,
      resetRule: k.resetRule,
      successCount: k.successCount,
      failCount: k.failCount,
      health: Math.round(k.health * 100) / 100,
      avgLatencyMs: k.avgLatencyMs,
    })),
  });
}
