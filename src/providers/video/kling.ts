import crypto from "crypto";
import { registerAdapter } from "../registry";
import { fetchJson, classifyHttp, classifyNetworkErr, UpstreamHttpError } from "../http";
import { resolveMediaRef } from "@/lib/media";
import type { ProviderAdapter, NormalizedRequest, ResolvedKey, UpstreamJob, Capability, ErrorClass } from "@/lib/types";

// ===== 可灵 Kling 国际版（低价订阅 API）=====
// Key 格式：`accessKey|secretKey`（设置页有提示）
// 鉴权：HS256 JWT（iss=ak, exp=now+30min, 用 sk 签名）

const BASE = "https://api.klingai.com/v1";

export const meta = {
  slug: "kling",
  name: "可灵 Kling（国际版 API）",
  modalities: ["video" as const],
  quality: 88,
  docs: "https://app.klingai.com/global/dev/document-api",
};

const CAPABILITY: Capability = {
  durations: [5, 10],
  ratios: ["16:9", "9:16", "1:1"],
  resolutions: ["720p", "1080p"],
  first_frame: true,
  last_frame: true,
  ref_images: undefined,
  native_audio: true,
  watermark_on_free: false,
  commercial_ok: true,
  quality: 88,
  avg_latency_ms: 120_000,
  unit: "credits",
  cost_per_call: 20,
};

function makeJwt(key: string): string {
  const [ak, sk] = key.split("|");
  if (!ak || !sk) throw new Error("可灵 Key 格式应为 accessKey|secretKey");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 })).toString("base64url");
  const sig = crypto.createHmac("sha256", sk).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function wrap(fn: () => Promise<UpstreamJob>) {
  return fn().catch((err) => {
    if (err instanceof UpstreamHttpError) throw Object.assign(new Error(err.message), { errorClass: classifyHttp(err.status, err.body) });
    throw Object.assign(err as Error, { errorClass: classifyNetworkErr(err) });
  });
}

export const adapter: ProviderAdapter = {
  slug: meta.slug,
  modalities: meta.modalities,
  capabilities: () => CAPABILITY,

  async submit(req: NormalizedRequest, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const hasImage = req.first_frame || req.last_frame;
      const path = hasImage ? "/videos/image2video" : "/videos/text2video";
      const body: Record<string, unknown> = {
        model_name: "kling-v2-5-turbo",
        prompt: req.prompt,
        duration: String(req.duration_s ?? 5),
        mode: req.resolution === "1080p" ? "pro" : "std",
      };
      if (req.negative_prompt) body.negative_prompt = req.negative_prompt;
      if (req.ratio) body.aspect_ratio = req.ratio;
      if (req.first_frame) {
        const r = await resolveMediaRef(req.first_frame);
        body.image = r.base64 ?? r.url;
      }
      if (req.last_frame) {
        const r = await resolveMediaRef(req.last_frame);
        body.image_tail = r.base64 ?? r.url;
      }
      if (req.seed !== undefined) body.seed = req.seed;

      const data = await fetchJson(`${BASE}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${makeJwt(key.apiKey)}` },
        body: JSON.stringify(body),
      });
      const id = data.data?.task_id;
      if (!id) throw new Error(`上游未返回 task_id: ${JSON.stringify(data).slice(0, 200)}`);
      return { jobId: String(id), status: "pending", raw: data };
    });
  },

  async poll(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob> {
    return wrap(async () => {
      const data = await fetchJson(`${BASE}/videos/text2video/${job.jobId}`, {
        headers: { Authorization: `Bearer ${makeJwt(key.apiKey)}` },
      }).catch(() => fetchJson(`${BASE}/videos/image2video/${job.jobId}`, {
        headers: { Authorization: `Bearer ${makeJwt(key.apiKey)}` },
      }));
      const st = String(data.data?.task_status ?? "").toLowerCase();
      if (st === "succeed" || st === "success") {
        const urls = (data.data?.task_result?.videos ?? []).map((v: { url?: string }) => v?.url).filter(Boolean);
        return { ...job, status: "succeeded", mediaUrls: urls, raw: data };
      }
      if (st === "failed") return { ...job, status: "failed", error: data.data?.task_status_msg ?? "上游任务失败", raw: data };
      return { ...job, status: "running", raw: data };
    });
  },

  classifyError(err: unknown): ErrorClass {
    return ((err as { errorClass?: string })?.errorClass as ErrorClass) ?? classifyNetworkErr(err);
  },

  async testKey(key: ResolvedKey) {
    try {
      const job = await adapter.submit({ modality: "video", prompt: "a calm ocean wave", ratio: "1:1", duration_s: 5 }, key);
      return { ok: true, msg: `测试任务已提交: ${job.jobId}（消耗约 20 积分）` };
    } catch (err) {
      return { ok: false, msg: err instanceof Error ? err.message : String(err) };
    }
  },
};

registerAdapter(adapter);
