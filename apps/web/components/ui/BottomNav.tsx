"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "首頁", icon: "⌂" },
  { href: "/calendar", label: "行事曆", icon: "▦" },
  { href: "/search", label: "AI 搜尋", icon: "✦" },
  { href: "/map", label: "地圖", icon: "⚲" },
  { href: "/favorites", label: "收藏", icon: "♥" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-200 bg-surface/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 py-2.5 text-center text-[11px] transition-colors active:opacity-60 ${
              active ? "text-accent" : "text-neutral-400"
            }`}
          >
            <span className="block text-lg leading-none mb-1">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
