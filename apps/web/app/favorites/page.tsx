"use client";

import { useEffect, useMemo, useState } from "react";
import type { NormalizedEvent } from "@/types/event";
import { loadEvents, sortByStart } from "@/lib/events-client";
import { getFavoriteIds, getAttendedMap } from "@/lib/storage";
import EventCard from "@/components/event/EventCard";
import EventDetailSheet from "@/components/event/EventDetailSheet";
import { EventListSkeleton } from "@/components/ui/Skeleton";

export default function FavoritesPage() {
  const [events, setEvents] = useState<NormalizedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"favorites" | "attended">("favorites");
  const [selected, setSelected] = useState<NormalizedEvent | null>(null);
  const [, forceRerender] = useState(0);

  useEffect(() => {
    loadEvents()
      .then((data) => setEvents(data.events))
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"));
  }, []);

  useEffect(() => {
    const onFocus = () => forceRerender((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const list = useMemo(() => {
    if (!events) return [];
    if (tab === "favorites") {
      const ids = new Set(getFavoriteIds());
      return sortByStart(events.filter((e) => ids.has(e.id)));
    }
    const attendedIds = new Set(Object.keys(getAttendedMap()));
    return sortByStart(events.filter((e) => attendedIds.has(e.id)));
  }, [events, tab]);

  return (
    <main className="px-4 pt-6 pb-6 max-w-lg mx-auto">
      <h1 className="text-xl font-black tracking-tight mb-4 text-neutral-900">我的活動</h1>

      <div className="flex rounded-2xl bg-white border border-neutral-200 p-1 mb-5">
        <button
          onClick={() => setTab("favorites")}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-colors ${
            tab === "favorites" ? "bg-accent text-white" : "text-neutral-500"
          }`}
        >
          ♥ 收藏活動
        </button>
        <button
          onClick={() => setTab("attended")}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-colors ${
            tab === "attended" ? "bg-accent text-white" : "text-neutral-500"
          }`}
        >
          ✔ 已參加
        </button>
      </div>

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">讀取活動資料失敗：{error}</p>}

      {events === null ? (
        <EventListSkeleton count={4} />
      ) : list.length === 0 ? (
        <div className="py-16 text-center">
          <div className="text-3xl mb-2 text-neutral-300">{tab === "favorites" ? "♡" : "◌"}</div>
          <p className="text-sm text-neutral-400">
            {tab === "favorites" ? "還沒有收藏任何活動\n看到喜歡的活動點愛心就會出現在這裡" : "還沒有標記過已參加的活動"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((e) => <EventCard key={e.id} event={e} onOpen={setSelected} />)}
        </div>
      )}

      {selected && <EventDetailSheet event={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
