import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "羊毛token · YoungMoreToken",
  description: "免费 AI 生成额度聚合路由器——把散落各平台的免费额度汇成一个池子，视频/图片/音频一站式生成",
};

const NAV = [
  { href: "/generate", label: "生成" },
  { href: "/tasks", label: "任务中心" },
  { href: "/settings", label: "设置" },
  { href: "/stats", label: "统计" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/generate" className="flex items-center gap-2 font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm text-white">羊毛</span>
              <span>YoungMoreToken</span>
            </Link>
            <nav className="flex gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
                  {n.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto text-xs text-gray-400">本地单用户版 v0.1</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
