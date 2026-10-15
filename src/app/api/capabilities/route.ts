import { NextRequest, NextResponse } from "next/server";
import { previewCandidates } from "@/lib/router";
import "@/providers/index"; // 确保适配器已注册（Next 各路由独立打包）
import type { NormalizedRequest } from "@/lib/types";

// POST /api/capabilities —— 按当前参数实时反查可用源（前端生成页用）
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<NormalizedRequest>;
  const preview = await previewCandidates({
    modality: body.modality ?? "video",
    prompt: body.prompt ?? "",
    ratio: body.ratio,
    duration_s: body.duration_s,
    resolution: body.resolution,
    first_frame: body.first_frame,
    last_frame: body.last_frame,
    audio: body.audio,
  });
  return NextResponse.json(preview);
}
