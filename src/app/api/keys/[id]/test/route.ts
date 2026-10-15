import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveKey } from "@/lib/router";
import { getAdapter } from "@/providers/registry";
import "@/providers/index"; // 确保适配器已注册（Next 各路由独立打包）

type Ctx = { params: Promise<{ id: string }> };

// POST /api/keys/[id]/test —— 用最小请求验证 key 可用性
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const key = await resolveKey(id);
  if (!key) return NextResponse.json({ ok: false, msg: "key 不存在" }, { status: 404 });
  const adapter = getAdapter(key.providerSlug);
  if (!adapter?.testKey) return NextResponse.json({ ok: false, msg: "该适配器不支持测试" }, { status: 400 });
  const result = await adapter.testKey(key);

  // 自愈：测试通过且当前被停用（invalid / cooldown）→ 恢复 active，
  // 用户装完依赖（如 pip install edge-tts）后点一次测试即可重新入池
  if (result.ok) {
    const row = await prisma.apiKey.findUnique({ where: { id } });
    if (row && (row.status !== "active" || (row.cooldownTill && row.cooldownTill > new Date()))) {
      await prisma.apiKey.update({
        where: { id },
        data: { status: "active", cooldownTill: null, health: Math.max(row.health, 0.5) },
      });
    }
  }
  return NextResponse.json(result);
}
