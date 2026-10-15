import { NextRequest, NextResponse } from "next/server";
import { getAllSettings, setSetting } from "@/lib/settings";

// GET /api/settings —— 全部设置（含默认值）
export async function GET() {
  return NextResponse.json({ settings: await getAllSettings() });
}

// PATCH /api/settings —— 批量更新设置
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const allowed = ["routing.strategy", "routing.maxAttempts", "routing.weights", "media.supply", "media.publicBaseUrl"];
  for (const k of allowed) {
    if (body[k] !== undefined) await setSetting(k, typeof body[k] === "string" ? body[k] : JSON.stringify(body[k]));
  }
  return NextResponse.json({ ok: true, settings: await getAllSettings() });
}
