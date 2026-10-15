"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Modality, Ratio, Resolution } from "@/lib/types";

// ===== 统一生成工具 =====
// 三个模态共用一套表单骨架；参数变动实时反查可用源（能力过滤）。

interface Voice {
  id: string;
  name: string;
  lang?: string;
}
interface PreviewProvider {
  slug: string;
  name: string;
  keys: number;
  quality: number;
}

const RATIOS: Ratio[] = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"];
const DURATIONS = [4, 5, 8, 10, 15, 30];
const RESOLUTIONS: Resolution[] = ["480p", "720p", "1080p"];

const MODALITY_LABEL: Record<Modality, string> = { video: "视频", image: "图片", audio: "音频" };

export default function GeneratePage() {
  const [modality, setModality] = useState<Modality>("video");
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [ratio, setRatio] = useState<Ratio>("16:9");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [count, setCount] = useState(1);
  const [seed, setSeed] = useState("");
  const [voice, setVoice] = useState("zh-CN-XiaoxiaoNeural");
  const [voices, setVoices] = useState<Voice[]>([]);

  const [firstFrame, setFirstFrame] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<string | null>(null);
  const [firstFrameName, setFirstFrameName] = useState("");
  const [lastFrameName, setLastFrameName] = useState("");

  const [preview, setPreview] = useState<{ total: number; byProvider: PreviewProvider[] } | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 拉取 TTS 音色列表（从各音频平台能力清单汇总）
  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => {
        const vs: Voice[] = [];
        for (const p of d.providers ?? []) {
          if ((p.modalities ?? []).includes("audio")) {
            for (const v of p.capability?.voices ?? []) if (!vs.some((x) => x.id === v.id)) vs.push(v);
          }
        }
        setVoices(vs);
      })
      .catch(() => {});
  }, []);

  // 实时可用源反查（防抖 400ms）
  const refreshPreview = useCallback(async () => {
    try {
      const res = await fetch("/api/capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modality,
          prompt: "x",
          ratio,
          duration_s: modality === "video" ? duration : undefined,
          resolution,
          first_frame: firstFrame ? { kind: "media", value: firstFrame } : undefined,
          last_frame: lastFrame ? { kind: "media", value: lastFrame } : undefined,
          audio: modality === "audio" ? { enabled: true } : undefined,
        }),
      });
      const d = await res.json();
      setPreview({ total: d.total ?? 0, byProvider: d.byProvider ?? [] });
    } catch {
      setPreview(null);
    }
  }, [modality, ratio, duration, resolution, firstFrame, lastFrame]);

  useEffect(() => {
    const t = setTimeout(refreshPreview, 400);
    return () => clearTimeout(t);
  }, [refreshPreview]);

  // 任务轮询
  useEffect(() => {
    if (!taskId) return;
    const poll = async () => {
      const r = await fetch(`/api/tasks/${taskId}`);
      const d = await r.json();
      setTask(d);
      if (["succeeded", "failed", "canceled"].includes(d.status)) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setBusy(false);
      }
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [taskId]);

  async function upload(file: File): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? "上传失败");
    return d.mediaId as string;
  }

  async function submit() {
    setErr("");
    setBusy(true);
    setTask(null);
    try {
      const body: any = {
        modality,
        prompt,
        ratio,
        resolution,
        count: modality === "image" ? count : 1,
        seed: seed ? Number(seed) : undefined,
      };
      if (modality === "video") {
        body.duration_s = duration;
        if (negative) body.negative_prompt = negative;
        if (firstFrame) body.first_frame = { kind: "media", value: firstFrame };
        if (lastFrame) body.last_frame = { kind: "media", value: lastFrame };
      }
      if (modality === "audio") {
        body.audio = { enabled: true, voice, text: prompt };
      }
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "提交失败");
      setTaskId(d.taskId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function resetTask() {
    setTaskId(null);
    setTask(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* 左：表单 */}
      <div className="space-y-4">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
          {(["video", "image", "audio"] as Modality[]).map((m) => (
            <button
              key={m}
              onClick={() => { setModality(m); resetTask(); }}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${modality === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              生成{MODALITY_LABEL[m]}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {modality === "audio" ? "要合成的文本" : "提示词"}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder={modality === "audio" ? "输入要转语音的文本…" : "描述你想要的画面，越具体越好…"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
          </div>

          {modality === "video" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">负向提示词（可选）</label>
              <input
                value={negative}
                onChange={(e) => setNegative(e.target.value)}
                placeholder="不希望出现的元素…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
              />
            </div>
          )}

          {modality === "audio" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">音色</label>
              <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {voices.length === 0 && <option value="zh-CN-XiaoxiaoNeural">晓晓（默认）</option>}
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}

          {modality !== "audio" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">比例</label>
                  <select value={ratio} onChange={(e) => setRatio(e.target.value as Ratio)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    {RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {modality === "video" && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">时长（秒）</label>
                    <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      {DURATIONS.map((d) => <option key={d} value={d}>{d}s</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">清晰度</label>
                  <select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {modality === "image" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">数量</label>
                    <input type="number" min={1} max={4} value={count} onChange={(e) => setCount(Math.max(1, Math.min(4, Number(e.target.value))))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">种子（可选）</label>
                    <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="随机" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {modality === "video" && (
                <div className="grid grid-cols-2 gap-3">
                  {(["首帧图片", "尾帧图片"] as const).map((label, i) => {
                    const isFirst = i === 0;
                    const mid = isFirst ? firstFrame : lastFrame;
                    const name = isFirst ? firstFrameName : lastFrameName;
                    return (
                      <div key={label}>
                        <label className="mb-1 block text-sm font-medium text-gray-700">{label}（可选）</label>
                        <label className="flex h-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-400 hover:border-brand-400 hover:text-brand-600">
                          {mid ? name || "已上传" : "点击上传"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              try {
                                const id = await upload(f);
                                if (isFirst) { setFirstFrame(id); setFirstFrameName(f.name); } else { setLastFrame(id); setLastFrameName(f.name); }
                              } catch (err) {
                                setErr(err instanceof Error ? err.message : "上传失败");
                              }
                            }}
                          />
                        </label>
                        {mid && (
                          <button onClick={() => (isFirst ? (setFirstFrame(null), setFirstFrameName("")) : (setLastFrame(null), setLastFrameName("")))} className="mt-1 text-xs text-gray-400 hover:text-red-500">
                            移除
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}

          <button
            onClick={submit}
            disabled={busy || !prompt.trim()}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "生成中…" : `开始生成${MODALITY_LABEL[modality]}`}
          </button>
        </div>

        {/* 任务结果 */}
        {task && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">
                任务状态：
                <span className={
                  task.status === "succeeded" ? "text-green-600" :
                  task.status === "failed" ? "text-red-600" : "text-brand-600"
                }>
                  {task.status === "succeeded" ? "成功" : task.status === "failed" ? "失败" : task.status === "canceled" ? "已取消" : "进行中"}
                </span>
                {task.providerName && <span className="ml-2 text-xs text-gray-400">来源：{task.providerName}</span>}
              </span>
              <button onClick={resetTask} className="text-xs text-gray-400 hover:text-gray-600">关闭</button>
            </div>

            {task.status === "failed" && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {task.errorMsg ?? "生成失败"}（{task.errorCode}）
                <button onClick={async () => { await fetch(`/api/tasks/${task.id}/retry`, { method: "POST" }); setTaskId(task.id); setBusy(true); }} className="ml-3 text-brand-600 underline">
                  重试
                </button>
              </div>
            )}

            {task.media?.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {task.media.map((m: any) => (
                  <div key={m.id} className="overflow-hidden rounded-lg border border-gray-200">
                    {m.kind === "image" && <img src={`/api/media/${m.id}`} alt="" className="w-full" />}
                    {m.kind === "video" && <video src={`/api/media/${m.id}`} controls className="w-full" />}
                    {m.kind === "audio" && <audio src={`/api/media/${m.id}`} controls className="w-full" />}
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-400">
                      <span>{m.watermark ? "带水印" : "无水印"}{m.sizeBytes ? ` · ${(m.sizeBytes / 1024).toFixed(0)}KB` : ""}</span>
                      <a href={`/api/media/${m.id}?download=1`} className="text-brand-600 hover:underline">下载</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 右：实时可用源 */}
      <aside className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-medium text-gray-700">当前参数可用源</h3>
          {preview ? (
            preview.total > 0 ? (
              <>
                <p className="mb-3 text-2xl font-semibold text-brand-600">{preview.total}<span className="ml-1 text-xs font-normal text-gray-400">个 Key 可服务</span></p>
                <ul className="space-y-2 text-sm">
                  {preview.byProvider.map((p) => (
                    <li key={p.slug} className="flex items-center justify-between">
                      <span className="text-gray-700">{p.name}</span>
                      <span className="text-xs text-gray-400">×{p.keys} · 质量{p.quality}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-gray-400">路由将优先消耗质量高的源；额度耗尽自动切换，无感衔接。</p>
              </>
            ) : (
              <p className="text-sm text-amber-600">当前参数下没有可用源——请调整参数，或在设置里添加对应平台的 Key。</p>
            )
          ) : (
            <p className="text-sm text-gray-400">查询中…</p>
          )}
        </div>
        <div className="rounded-xl border border-dashed border-gray-300 p-4 text-xs leading-relaxed text-gray-400">
          <p className="mb-1 font-medium text-gray-500">小提示</p>
          Edge-TTS 免费通道无需 Key，添加后立即可用。上游若只接受公网图片 URL，请在设置里配置穿透地址，否则自动降级 base64 直传。
        </div>
      </aside>
    </div>
  );
}
