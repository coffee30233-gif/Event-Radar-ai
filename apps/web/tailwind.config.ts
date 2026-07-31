import type { Config } from "tailwindcss";

// 設計方向：柔和的米白/杏色底，不是刺眼的純白，留白多一點、卡片用陰影/邊框做出層次感。
// （原本用純白 #ffffff 當底色，使用者反應太刺眼，改成偏暖的米色調，閱讀起來比較舒服，
// 概念類似 Kindle 的護眼模式，不是死板的辦公室白）。
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#f6f2e9",
        surface: "#fffdf8",
        "surface-hi": "#ede6d4",
        accent: { DEFAULT: "#c2660a", dim: "#fdecc8" },
      },
      fontFamily: {
        sans: ["var(--font-noto-sans-tc)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(120,90,30,0.05), 0 8px 20px -10px rgba(120,90,30,0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
