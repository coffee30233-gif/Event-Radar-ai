import type { Metadata } from "next";
import { Noto_Sans_TC, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/ui/BottomNav";
import SwRegister from "@/components/ui/SwRegister";

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-sans-tc",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Event Radar AI｜全台活動雷達",
  description: "全台灣活動探索 PWA，AI 幫你整理重點、規劃行程、找到附近的活動。",
};

export const viewport = {
  themeColor: "#f6f2e9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW" className={`${notoSansTC.variable} ${mono.variable}`}>
      <body className="bg-app text-neutral-900 min-h-screen font-sans antialiased">
        <SwRegister />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
