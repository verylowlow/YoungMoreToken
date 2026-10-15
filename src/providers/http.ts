import type { ErrorClass } from "@/lib/types";

// ===== 上游 HTTP 工具：统一取数与错误分类 =====

export class UpstreamHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

export async function fetchJson(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(60_000),
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new UpstreamHttpError(res.status, text);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`上游返回非 JSON: ${text.slice(0, 200)}`);
  }
}

/** 按 HTTP 状态码 + 响应体归类错误，驱动路由引擎的 fallback 决策 */
export function classifyHttp(status: number, body: string): ErrorClass {
  const b = body.toLowerCase();
  if (status === 401 || status === 403) return "auth_invalid";
  if (status === 402 || /insufficient|quota|balance|欠费|额度/.test(b)) return "quota_exhausted";
  if (status === 429 || /rate.?limit|too many|限流|频繁/.test(b)) return "rate_limited";
  if (status === 400 || status === 422) {
    if (/content|敏感|违规|policy|moderation|nsfw/.test(b)) return "content_blocked";
    return "unsupported";
  }
  if (status >= 500) return "transient";
  return "transient";
}

/** 网络层异常归类 */
export function classifyNetworkErr(err: unknown): ErrorClass {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|abort|timed out/i.test(msg)) return "transient";
  if (/fetch failed|econn|socket|network/i.test(msg)) return "transient";
  return "transient";
}
