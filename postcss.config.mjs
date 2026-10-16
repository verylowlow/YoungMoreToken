import path from "path";
import { fileURLToPath } from "url";

// 🔴 显式给 tailwindcss 插件指定配置文件绝对路径，摆脱 CWD 依赖。
// 背景（2026-10-16 实测踩坑）：Tailwind 的 PostCSS 插件默认在【构建进程的 CWD】找
// tailwind.config.ts。从项目目录外跑 next build 时找不到配置 → 静默退化成"无 content 源"
// → 只输出 preflight、所有工具类丢失，页面样式全没（用户看到"CSS 没了"）。
// 用配置文件自身位置拼绝对路径，并配合 tailwind.config.ts 内的 __dirname content 路径。
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, "tailwind.config.ts") },
    autoprefixer: {},
  },
};

export default config;
