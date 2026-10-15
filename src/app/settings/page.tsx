"use client";

import { useCallback, useEffect, useState } from "react";

// ===== 设置中心：Key 管理 + 平台目录 + 路由策略 =====

interface ProviderItem {
  id: string;
  slug: string;
  name: string;
  modalities: string[];
  quality: number;
  enabled: boolean;
  capability: any;
  keys: {
    id: string;
    label: string;
    status: string;
    quotaUsed: number;
    quotaTotal: number | null;
    resetRule: string;
    priority: number;
    successCount: number;
    failCount: number;
    avgLatencyMs: number;
  }[];
}

const KEY_HINTS: Record<string, string> = {
  "modelscope-wan2": "魔搭 API Token（社区 → 个人中心获取）",
  "modelscope-image": "魔搭 API Token（需实名阿里云账号）",
  kling: "格式：accessKey|secretKey（国际版控制台）",
  vidu: "Vidu 平台 API Key",
  luma: "Luma API Key",
  "cloudflare-flux": "格式：accountId|apiToken（Cloudflare 控制台）",
  "openrouter-image": "OpenRouter API Key",
  "edge-tts": "免费通道，无需 Key——随便填个占位符（如 edge）即可",
  "elevenlabs-tts": "ElevenLabs API Key（免费档 1 万字符/月）",
  "azure-tts": "格式：subscriptionKey|region（如 key|eastasia）",
};

const MODALITY_BADGE: Record<string, string> = { video: "视频", image: "图片", audio: "音频" };

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ apiKey: "", label: "", priority: "0", quotaTotal: "", resetRule: "none" });
  const [msg, setMsg] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  // 两步删除确认：替代原生 confirm()——原生对话框在 iframe/嵌入式 WebView 环境下
  // 会被拦截或直接抛异常，导致"点击删除没反应"（bug01 根因）
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // 确认态 5 秒自动取消，避免按钮长时间处于危险状态
  useEffect(() => {
    if (!confirmDel) return;
    const t = setTimeout(() => setConfirmDel(null), 5000);
    return () => clearTimeout(t);
  }, [confirmDel]);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([fetch("/api/providers").then((r) => r.json()), fetch("/api/settings").then((r) => r.json())]);
    setProviders(p.providers ?? []);
    setSettings(s.settings ?? {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addKey(providerId: string) {
    setMsg("");
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId,
        apiKey: form.apiKey.trim(),
        label: form.label.trim(),
        priority: Number(form.priority) || 0,
        quotaTotal: form.quotaTotal === "" ? null : Number(form.quotaTotal),
        resetRule: form.resetRule,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setMsg(d.error ?? "添加失败");
      return;
    }
    setForm({ apiKey: "", label: "", priority: "0", quotaTotal: "", resetRule: "none" });
    setExpanded(null);
    setMsg("已添加");
    load();
  }

  async function patchKey(id: string, data: Record<string, unknown>) {
    await fetch(`/api/keys/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    load();
  }

  async function delKey(id: string) {
    setMsg("");
    // 第一步：进入确认态（按钮变为"确认删除"）
    if (confirmDel !== id) {
      setConfirmDel(id);
      return;
    }
    // 第二步：执行删除——乐观更新（界面立即消失），失败回滚并明确报错，不再静默
    setConfirmDel(null);
    const backup = providers;
    setProviders((prev) => prev.map((p) => ({ ...p, keys: p.keys.filter((k) => k.id !== id) })));
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`服务端返回 HTTP ${res.status}`);
      setMsg("✓ 已删除");
    } catch (e) {
      setProviders(backup); // 回滚，界面恢复原状
      setMsg(`✗ 删除失败：${e instanceof Error ? e.message : String(e)}（已恢复，请重试）`);
    }
  }

  async function testKey(id: string) {
    setTesting(id);
    setMsg("");
    const r = await fetch(`/api/keys/${id}/test`, { method: "POST" });
    const d = await r.json();
    setTesting(null);
    // 用页内消息替代 alert()——同样会被 iframe/WebView 拦截
    setMsg(d.ok ? `✓ ${d.msg}` : `✗ ${d.msg}`);
    load();
  }

  async function patchProvider(id: string, data: Record<string, unknown>) {
    await fetch("/api/providers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...data }) });
    load();
  }

  async function patchSettings(data: Record<string, unknown>) {
    await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    load();
  }

  return (
    <div className="space-y-6">
      {/* 路由策略 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">路由策略</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">选源策略</label>
            <select
              value={settings["routing.strategy"] ?? "quality_first"}
              onChange={(e) => patchSettings({ "routing.strategy": e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="quality_first">质量优先（默认，前3名随机）</option>
              <option value="round_robin">均匀轮询（延长续航）</option>
              <option value="least_used">剩余最少优先（先用快过期的）</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">单任务最多尝试源数</label>
            <input
              type="number" min={1} max={10}
              value={settings["routing.maxAttempts"] ?? "3"}
              onChange={(e) => patchSettings({ "routing.maxAttempts": e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">图片供给方式（上游要 URL 时）</label>
            <select
              value={settings["media.supply"] ?? "auto"}
              onChange={(e) => patchSettings({ "media.supply": e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="auto">自动（配了公网地址走 URL，否则 base64）</option>
              <option value="base64">始终 base64 直传</option>
              <option value="public_url">始终公网 URL</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs text-gray-500">公网基地址（内网穿透/服务器地址，供首尾帧图片外链；在 .env 的 PUBLIC_BASE_URL 或此处覆盖）</label>
          <input
            value={settings["media.publicBaseUrl"] ?? ""}
            onChange={(e) => patchSettings({ "media.publicBaseUrl": e.target.value })}
            placeholder="http://xxx.ngrok.io（留空则用 .env 配置）"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </section>

      {/* 平台与 Key */}
      <section className="space-y-3">
        <div className="flex items-center">
          <h2 className="text-sm font-semibold text-gray-800">平台与 Key（一个平台可挂多个 Key，同平台不重复）</h2>
          {msg && <span className={`ml-auto text-xs ${msg.startsWith("✗") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}
        </div>
        {providers.map((p) => {
          const cap = p.capability ?? {};
          const open = expanded === p.id;
          return (
            <div key={p.id} className={`rounded-xl border bg-white p-4 ${p.enabled ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-gray-800">{p.name}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">质量 {p.quality}</span>
                {p.modalities.map((m) => (
                  <span key={m} className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-600">{MODALITY_BADGE[m] ?? m}</span>
                ))}
                <span className="text-xs text-gray-400">
                  {cap.durations ? `时长 ${cap.durations.join("/")}s` : ""}
                  {cap.resolutions ? ` · ${cap.resolutions.join("/")}` : ""}
                  {cap.watermark_on_free ? " · 免费档带水印" : ""}
                  {cap.commercial_ok === false ? " · 限非商用" : ""}
                </span>
                <div className="ml-auto flex items-center gap-2 text-xs">
                  <span className="text-gray-400">{p.keys.filter((k) => k.status === "active").length} 个可用 Key</span>
                  <button onClick={() => patchProvider(p.id, { enabled: !p.enabled })} className="text-gray-400 hover:text-gray-600">
                    {p.enabled ? "禁用" : "启用"}
                  </button>
                  <button onClick={() => setExpanded(open ? null : p.id)} className="rounded-md bg-brand-600 px-2.5 py-1 text-white hover:bg-brand-800">
                    + 添加 Key
                  </button>
                </div>
              </div>

              {open && (
                <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-400">Key 格式：{KEY_HINTS[p.slug] ?? "平台 API Key"}</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_80px_100px_100px_auto]">
                    <input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="API Key" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                    <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="备注（如 Vidu 号2）" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                    <input value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} placeholder="优先级" title="优先级 0-10，付费 key 可调高" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                    <input value={form.quotaTotal} onChange={(e) => setForm({ ...form, quotaTotal: e.target.value })} placeholder="总额度" title="本期总额度（留空=不限）" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                    <select value={form.resetRule} onChange={(e) => setForm({ ...form, resetRule: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                      <option value="none">不重置</option>
                      <option value="daily">每日重置</option>
                      <option value="monthly">每月重置</option>
                    </select>
                    <button onClick={() => addKey(p.id)} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">保存</button>
                  </div>
                </div>
              )}

              {p.keys.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-gray-400">
                      <tr><th className="py-1.5 pr-3 font-medium">备注</th><th className="py-1.5 pr-3 font-medium">状态</th><th className="py-1.5 pr-3 font-medium">额度</th><th className="py-1.5 pr-3 font-medium">成功/失败</th><th className="py-1.5 pr-3 font-medium">均耗时</th><th className="py-1.5 pr-3 font-medium">操作</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {p.keys.map((k) => (
                        <tr key={k.id}>
                          <td className="py-1.5 pr-3 text-gray-700">{k.label || "—"}</td>
                          <td className="py-1.5 pr-3">
                            <span className={`rounded px-1.5 py-0.5 ${
                              k.status === "active" ? "bg-green-50 text-green-600" :
                              k.status === "exhausted" ? "bg-amber-50 text-amber-600" :
                              k.status === "invalid" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                            }`}>
                              {k.status === "active" ? "可用" : k.status === "exhausted" ? "耗尽" : k.status === "invalid" ? "失效" : "禁用"}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-gray-500">
                            {k.quotaTotal ? `${Math.round(k.quotaUsed)}/${k.quotaTotal}（${k.resetRule === "daily" ? "日" : k.resetRule === "monthly" ? "月" : "总"}）` : `${Math.round(k.quotaUsed)}（不限）`}
                          </td>
                          <td className="py-1.5 pr-3 text-gray-500">{k.successCount}/{k.failCount}</td>
                          <td className="py-1.5 pr-3 text-gray-500">{k.avgLatencyMs ? `${(k.avgLatencyMs / 1000).toFixed(1)}s` : "—"}</td>
                          <td className="py-1.5 pr-3">
                            <div className="flex gap-2">
                              <button onClick={() => testKey(k.id)} disabled={testing === k.id} className="text-brand-600 hover:underline disabled:opacity-40">{testing === k.id ? "测试中" : "测试"}</button>
                              <button onClick={() => patchKey(k.id, { status: k.status === "disabled" ? "active" : "disabled" })} className="text-gray-400 hover:text-gray-600">{k.status === "disabled" ? "启用" : "禁用"}</button>
                              <button onClick={() => patchKey(k.id, { resetQuota: true })} className="text-gray-400 hover:text-gray-600">重置额度</button>
                              {confirmDel === k.id ? (
                                <>
                                  <button onClick={() => delKey(k.id)} className="font-medium text-red-600 hover:underline">确认删除</button>
                                  <button onClick={() => { setConfirmDel(null); setMsg(""); }} className="text-gray-400 hover:text-gray-600">取消</button>
                                </>
                              ) : (
                                <button onClick={() => delKey(k.id)} className="text-gray-400 hover:text-red-500">删除</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <p className="text-xs leading-relaxed text-gray-400">
        安全说明：所有 Key 以 AES-256-GCM 加密存储于本地 SQLite，界面仅显示掩码。请勿将 data/ 目录与 .env 提交到任何仓库。
        多平台多账号请遵守各平台服务条款；免费档通常限非商用，商用前请确认授权。
      </p>
    </div>
  );
}
