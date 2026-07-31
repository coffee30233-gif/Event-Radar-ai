"use client";

export default function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors active:scale-95 ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-neutral-200 bg-surface text-neutral-500"
      }`}
    >
      {children}
    </button>
  );
}
