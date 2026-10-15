"use client";

import { useCallback, useEffect, useState } from "react";

interface TaskItem {
  id: string;
  modality: string;
  status: string;
  providerName: string | null;
  errorCode: string | null;
  errorMsg: string | null;
  queuedAt: string;
  media: { id: string; kind: string; watermark: boolean }[];
}

const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  running: "进行中",
  succeeded: "成功",
  failed: "失败",
  canceled: "已取消",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch(`/api/tasks${filter ? `?status=${filter}` : ""}`);
    const d = await r.json();
    setTasks(d.tasks ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function act(id: string, action: "retry" | "cancel") {
    await fetch(`/api/tasks/${id}/${action}`, { method: "POST", headers: action === "retry" ? { "Content-Type": "application/json" } : undefined, body: action === "retry" ? "{}" : undefined });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">任务中心</h1>
        <div className="ml-auto flex gap-1 text-sm">
          {[["", "全部"], ["queued", "排队"], ["running", "进行中"], ["succeeded", "成功"], ["failed", "失败"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} className={`rounded-md px-3 py-1 ${filter === v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">加载中…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-gray-400">暂无任务。去<a href="/generate" className="text-brand-600 hover:underline">生成页</a>提交第一个任务吧。</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">时间</th>
                <th className="px-4 py-2.5 font-medium">模态</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">来源</th>
                <th className="px-4 py-2.5 font-medium">产物</th>
                <th className="px-4 py-2.5 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-xs text-gray-400">{new Date(t.queuedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-2.5">{t.modality === "video" ? "视频" : t.modality === "image" ? "图片" : "音频"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      t.status === "succeeded" ? "bg-green-50 text-green-600" :
                      t.status === "failed" ? "bg-red-50 text-red-600" :
                      t.status === "running" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"
                    }`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    {t.status === "failed" && t.errorMsg && <p className="mt-1 max-w-xs truncate text-xs text-red-400" title={t.errorMsg}>{t.errorMsg}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{t.providerName ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      {t.media.map((m) => (
                        <a key={m.id} href={`/api/media/${m.id}`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
                          {m.kind === "video" ? "视频" : m.kind === "image" ? "图片" : "音频"}
                          {m.watermark ? "(水印)" : ""}
                        </a>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2 text-xs">
                      {(t.status === "failed" || t.status === "canceled") && (
                        <button onClick={() => act(t.id, "retry")} className="text-brand-600 hover:underline">重试</button>
                      )}
                      {t.status === "queued" && (
                        <button onClick={() => act(t.id, "cancel")} className="text-gray-400 hover:text-red-500">取消</button>
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
}
