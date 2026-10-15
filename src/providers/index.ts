import { prisma } from "@/lib/db";
import { allAdapters } from "./registry";

// ===== 适配器装配 + Provider 种子数据 =====
// 每个适配器文件自我注册；这里统一 import 触发注册，并同步到数据库。

import { meta as modelscopeVideoMeta } from "./video/modelscope";
import { meta as klingMeta } from "./video/kling";
import { meta as viduMeta } from "./video/vidu";
import { meta as lumaMeta } from "./video/luma";
import { meta as cloudflareMeta } from "./image/cloudflare";
import { meta as modelscopeImageMeta } from "./image/modelscope-image";
import { meta as openrouterMeta } from "./image/openrouter";
import { meta as edgeTtsMeta } from "./audio/edge-tts";
import { meta as elevenlabsMeta } from "./audio/elevenlabs";
import { meta as azureMeta } from "./audio/azure";

const METAS = [
  modelscopeVideoMeta,
  klingMeta,
  viduMeta,
  lumaMeta,
  cloudflareMeta,
  modelscopeImageMeta,
  openrouterMeta,
  edgeTtsMeta,
  elevenlabsMeta,
  azureMeta,
];

/** 启动时/首次请求时调用：把内置平台写入 Provider 表（幂等） */
export async function seedProviders() {
  for (const a of allAdapters()) {
    const m = METAS.find((x) => x.slug === a.slug);
    if (!m) continue;
    const manifest = JSON.stringify({ modalities: a.modalities, ...a.capabilities() });
    await prisma.provider.upsert({
      where: { slug: a.slug },
      create: {
        slug: a.slug,
        name: m.name,
        kind: "builtin",
        modalities: JSON.stringify(m.modalities),
        manifest,
        quality: m.quality,
        enabled: true,
      },
      update: { name: m.name, modalities: JSON.stringify(m.modalities), manifest },
    });
  }
}

export { METAS };
