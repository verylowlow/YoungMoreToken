import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { prisma } from "@/lib/db";
import { absMediaPath } from "@/lib/media";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/media/[id] —— 媒体文件服务（预览/下载）；?download=1 强制下载
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const rec = await prisma.media.findUnique({ where: { id } });
  if (!rec) return NextResponse.json({ error: "媒体不存在" }, { status: 404 });
  try {
    const buf = await fs.readFile(absMediaPath(rec.uri));
    const download = new URL(req.url).searchParams.get("download") === "1";
    const ext = rec.uri.split(".").pop() ?? "bin";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": rec.mime,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="youngmore-${id}.${ext}"`,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "媒体文件缺失" }, { status: 410 });
  }
}
