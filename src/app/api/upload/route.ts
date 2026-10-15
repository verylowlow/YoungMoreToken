import { NextRequest, NextResponse } from "next/server";
import { saveInputMedia } from "@/lib/media";

// POST /api/upload —— 上传输入素材（base64 data URL）→ 返回 mediaId
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.dataUrl || typeof body.dataUrl !== "string" || !body.dataUrl.startsWith("data:")) {
    return NextResponse.json({ error: "需要 base64 data URL" }, { status: 400 });
  }
  if (body.dataUrl.length > 12 * 1024 * 1024) {
    return NextResponse.json({ error: "图片不能超过 8MB" }, { status: 413 });
  }
  const rec = await saveInputMedia(body.dataUrl);
  return NextResponse.json({ mediaId: rec.id });
}
