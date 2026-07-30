"use client";

/** 活動卡片的載入骨架，取代單純的「載入中…」文字。 */
export function EventCardSkeleton() {
  return (
    <div className="w-full rounded-2xl border border-neutral-200 bg-white p-3.5 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-4 w-10 rounded bg-neutral-100" />
        <div className="h-3 w-14 rounded bg-neutral-100" />
      </div>
      <div className="h-4 w-3/4 rounded bg-neutral-100 mb-2" />
      <div className="h-3 w-1/2 rounded bg-neutral-100 mb-3" />
      <div className="h-3 w-24 rounded bg-neutral-100" />
    </div>
  );
}

export function EventListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  );
}
