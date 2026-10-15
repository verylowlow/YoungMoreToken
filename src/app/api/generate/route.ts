import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { NormalizedRequest } from "@/lib/types";

// POST /api/generate —— 提交生成任务（入队，由 worker 路由执行）
export async function POST(req: NextRequest) {
  const body = (await req.json()) as NormalizedRequest;
  if (!body.modality || !["video", "image", "audio"].includes(body.modality)) {
    return NextResponse.json({ error: "modality 必须是 video/image/audio" }, { status: 400 });
  }
  if (!body.prompt && !body.audio?.text) {
    return NextResponse.json({ error: "prompt 不能为空" }, { status: 400 });
  }
  const task = await prisma.task.create({
    data: { modality: body.modality, status: "queued", request: JSON.stringify(body) },
  });
  return NextResponse.json({ taskId: task.id });
}
