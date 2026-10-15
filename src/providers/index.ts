import { prisma } from "@/lib/db";
import { allAdapters } from "./registry";

// ===== 适配器装配 + Provider 种子数据 =====
// 每个适配器文件自我注册；这里统一 import 触发注册，并同步到数据库。

import { meta as modelscopeVideoMeta } from "./video/modelscope";
import { meta as klingMeta } from "./video/kling";
import { meta as viduMeta } from "./video/vidu";
import { meta as lumaMeta } from "./video/luma";
import { meta as agnesVideoMeta } from "./video/agnes";
import { meta as zhipuVideoMeta } from "./video/zhipu";
import { meta as minimaxVideoMeta } from "./video/minimax";
import { meta as dashscopeVideoMeta } from "./video/dashscope";
import { meta as runwayMeta } from "./video/runway";
import { meta as volcengineMeta } from "./video/volcengine";
import { meta as cloudflareMeta } from "./image/cloudflare";
import { meta as modelscopeImageMeta } from "./image/modelscope-image";
import { meta as openrouterMeta } from "./image/openrouter";
import { meta as agnesImageMeta } from "./image/agnes";
import { meta as siliconflowImageMeta } from "./image/siliconflow";
import { meta as zhipuImageMeta } from "./image/zhipu";
import { meta as dashscopeImageMeta } from "./image/dashscope";
import { meta as stabilityMeta } from "./image/stability";
import { meta as togetherMeta } from "./image/together";
import { meta as openaiImageMeta } from "./image/openai";
import { meta as edgeTtsMeta } from "./audio/edge-tts";
import { meta as elevenlabsMeta } from "./audio/elevenlabs";
import { meta as azureMeta } from "./audio/azure";
import { meta as siliconflowTtsMeta } from "./audio/siliconflow";
import { meta as minimaxTtsMeta } from "./audio/minimax";
import { meta as googleTtsMeta } from "./audio/google-tts";
import { meta as openaiTtsMeta } from "./audio/openai";

const METAS = [
  // ===== 视频 =====
  modelscopeVideoMeta,
  agnesVideoMeta,
  zhipuVideoMeta,
  minimaxVideoMeta,
  dashscopeVideoMeta,
  volcengineMeta,
  viduMeta,
  klingMeta,
  runwayMeta,
  lumaMeta,
  // ===== 图片 =====
  cloudflareMeta,
  modelscopeImageMeta,
  siliconflowImageMeta,
  zhipuImageMeta,
  dashscopeImageMeta,
  togetherMeta,
  agnesImageMeta,
  stabilityMeta,
  openaiImageMeta,
  openrouterMeta,
  // ===== 音频 =====
  edgeTtsMeta,
  siliconflowTtsMeta,
  minimaxTtsMeta,
  googleTtsMeta,
  openaiTtsMeta,
  elevenlabsMeta,
  azureMeta,
];

/** 启动时/首次请求时调用：把内置平台写入 Provider 表（幂等） */
export async function seedProviders() {
  for (const a of allAdapters()) {
    const m = METAS.find((x) => x.slug === a.slug);
    if (!m) continue;
    const manifest = JSON.stringify({ modalities: a.modalities, region: m.region, ...a.capabilities() });
    await prisma.provider.upsert({
      where: { slug: a.slug },
      create: {
        slug: a.slug,
        name: m.name,
        kind: "builtin",
        modalities: JSON.stringify(m.modalities),
        manifest,
        quality: m.quality,
        region: m.region,
        enabled: true,
      },
      update: { name: m.name, modalities: JSON.stringify(m.modalities), manifest, quality: m.quality, region: m.region },
    });
  }
}

export { METAS };
