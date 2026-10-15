// ===== 羊毛token YoungMoreToken 核心类型 =====
// 前端只认这一套公共参数；平台差异全部关在适配器里。

export type Modality = "video" | "image" | "audio";
export type Ratio = "9:16" | "16:9" | "1:1" | "4:3" | "3:4" | "21:9";
export type Resolution = "480p" | "720p" | "1080p" | "2k" | "4k";
export type QualityTier = "draft" | "standard" | "high";
export type RoutingStrategy = "quality_first" | "round_robin" | "least_used";
export type MediaSupply = "auto" | "base64" | "public_url";

/** 媒体引用：上传后入库的素材 / 公网 URL / 裸 base64 */
export interface MediaRef {
  kind: "media" | "url" | "base64";
  value: string; // media: Media.id | url: https://... | base64: data:image/png;base64,...
  mime?: string;
}

/** 统一生成请求（NormalizedRequest） */
export interface NormalizedRequest {
  modality: Modality;
  prompt: string;
  negative_prompt?: string;
  first_frame?: MediaRef;
  last_frame?: MediaRef;
  ref_images?: MediaRef[];
  ratio?: Ratio;
  duration_s?: number;
  resolution?: Resolution;
  quality_tier?: QualityTier;
  fps?: number;
  seed?: number;
  count?: number;
  /** 音频域：TTS 参数（audio 模态时 text 优先于 prompt） */
  audio?: { enabled?: boolean; voice?: string; text?: string };
  extras?: Record<string, unknown>;
}

/** 平台能力清单（manifest）：驱动"参数反选可用源" */
export interface Capability {
  durations?: number[]; // 支持的时长（秒）
  ratios?: Ratio[];
  resolutions?: Resolution[];
  first_frame?: boolean;
  last_frame?: boolean;
  ref_images?: { max: number };
  native_audio?: boolean; // 视频原生音频
  watermark_on_free?: boolean;
  commercial_ok?: boolean;
  quality?: number; // 0~100 质量分
  avg_latency_ms?: number;
  /** 本地账本单位：每次调用消耗多少 quota 单位 */
  unit?: "credits" | "calls" | "chars" | "seconds";
  cost_per_call?: number;
  /** 上游是否需要公网 URL 的图片（否则收 base64） */
  needs_public_image_url?: boolean;
  /** TTS 音色列表（音频域） */
  voices?: { id: string; name: string; lang?: string }[];
}

/** 解密后的可用 Key */
export interface ResolvedKey {
  id: string;
  providerSlug: string;
  apiKey: string;
  label: string;
  priority: number;
  quotaUsed: number;
  quotaTotal: number | null;
  resetRule: string;
}

/** 上游任务（适配器提交后的句柄） */
export interface UpstreamJob {
  jobId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  mediaUrls?: string[]; // 成功时的产物 URL
  error?: string;
  raw?: unknown;
}

export type ErrorClass =
  | "auth_invalid"
  | "quota_exhausted"
  | "rate_limited"
  | "content_blocked"
  | "unsupported"
  | "unavailable" // 本机环境缺依赖（如 Python/edge-tts 未安装）→ 停用该源，可自愈
  | "transient";

/** 适配器协议：每家上游一个实现 */
export interface ProviderAdapter {
  slug: string;
  capabilities(): Capability;
  submit(req: NormalizedRequest, key: ResolvedKey): Promise<UpstreamJob>;
  poll?(job: UpstreamJob, key: ResolvedKey): Promise<UpstreamJob>;
  classifyError(err: unknown): ErrorClass;
  testKey?(key: ResolvedKey): Promise<{ ok: boolean; msg?: string }>;
}

/** 路由候选打分结果 */
export interface ScoredKey {
  keyId: string;
  providerSlug: string;
  providerName: string;
  quality: number;
  score: number;
  reason: string;
}
