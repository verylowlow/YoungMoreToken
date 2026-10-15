"use client";

import { useCallback, useEffect, useState } from "react";

interface Stats {
  today: { total: number; succeeded: number };
  all: { total: number; succeeded: number; rate: number };
  keys: {
    id: string;
    providerName: string;
    label: string;
    status: string;
    quotaUsed: number;
    quotaTotal: number | null;
    resetRule: string;
    successCount: number;
    failCount: number;
    health: number;
    avgLatencyMs: number;
  }[];
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/stats");
    setStats(await r.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  if (!stats) return <p className="text-sm text-gray-400">加载中…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">统计看板</h1>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "今日生成", value: stats.today.total, sub: `成功 ${stats.today.succeeded}` },
          { label: "累计生成", value: stats.all.total, sub: `成功 ${stats.all.succeeded}` },
          { label: "整体成功率", value: `${stats.all.rate}%`, sub: "全部任务" },
          { label: "可用 Key", value: stats.keys.filter((k) => k.status === "active").length, sub: `共 ${stats.keys.length} 个` },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-gray-100 p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-400">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">平台 / Key</th>
              <th className="px-4 py-2.5 font-medium">状态</th>
              <th className="px-4 py-2.5 font-medium">已用额度</th>
              <th className="px-4 py-2.5 font-medium">成功 / 失败</th>
              <th className="px-4 py-2.5 font-medium">健康度</th>
              <th className="px-4 py-2.5 font-medium">平均耗时</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stats.keys.map((k) => (
              <tr key={k.id}>
                <td className="px-4 py-2.5">
                  <span className="text-gray-800">{k.providerName}</span>
                  {k.label && <span className="ml-2 text-xs text-gray-400">{k.label}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${
                    k.status === "active" ? "bg-green-50 text-green-600" :
                    k.status === "exhausted" ? "bg-amber-50 text-amber-600" :
                    k.status === "invalid" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                  }`}>
                    {k.status === "active" ? "可用" : k.status === "exhausted" ? "耗尽" : k.status === "invalid" ? "失效" : "禁用"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {k.quotaTotal ? `${Math.round(k.quotaUsed)} / ${k.quotaTotal}` : Math.round(k.quotaUsed)}
                  {k.quotaTotal && <span className="ml-1 text-xs text-gray-400">（{k.resetRule === "daily" ? "每日" : k.resetRule === "monthly" ? "每月" : "总计"}）</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{k.successCount} / {k.failCount}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-green-400" style={{ width: `${Math.round(k.health * 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{Math.round(k.health * 100)}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{k.avgLatencyMs ? `${(k.avgLatencyMs / 1000).toFixed(1)}s` : "—"}</td>
              </tr>
            ))}
            {stats.keys.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">还没有添加任何 Key，去<a href="/settings" className="text-brand-600">设置页</a>添加</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
