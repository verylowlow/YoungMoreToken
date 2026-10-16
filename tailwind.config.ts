import path from "path";
import type { Config } from "tailwindcss";

// 🔴 content 用 __dirname 拼绝对路径：Tailwind 的相对 content glob 是按【构建进程的 CWD】
// 解析的，不是按配置文件位置。从别的目录跑 next build（如传目录参数）会扫不到 src/，
// 导致只产出 preflight、全部工具类丢失（2026-10-16 实测踩坑，页面样式全丢）。
const config: Config = {
  content: [path.join(__dirname, "src/**/*.{js,ts,jsx,tsx,mdx}")],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEEDFE",
          100: "#CECBF6",
          400: "#7F77DD",
          600: "#534AB7",
          800: "#3C3489",
        },
      },
    },
  },
  plugins: [],
};

export default config;
