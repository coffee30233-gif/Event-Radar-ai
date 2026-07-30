import type { Config } from "tailwindcss";

// 設計方向：白色底、乾淨明亮的風格，留白多一點、卡片用陰影/邊框做出層次感
// （原本是深色主題，改成白色底之後這裡的 token 名稱不變，只換色值，
// 所以套用這幾個 token 的元件不用逐一改 class 名稱）。
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#faf9f7",
        surface: "#ffffff",
        "surface-hi": "#f2f0ec",
        accent: { DEFAULT: "#d97706", dim: "#fef3c7" },
      },
      fontFamily: {
        sans: ["var(--font-noto-sans-tc)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 20px -10px rgba(0,0,0,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
