"use client";

import { useEffect, useState } from "react";
import { CATEGORY_LABELS, type NormalizedEvent } from "@/types/event";
import { isFavorite, toggleFavorite } from "@/lib/storage";
import { formatEventWhen } from "@/lib/format";

export default function EventCard({
  event,
  onOpen,
}: {
  event: NormalizedEvent;
  onOpen: (event: NormalizedEvent) => void;
}) {
  const [fav, setFav] = useState(false);
  useEffect(() => setFav(isFavorite(event.id)), [event.id]);

  return (
    <button
      onClick={() => onOpen(event)}
      className="w-full text-left rounded-2xl border border-neutral-200 bg-surface p-3.5 flex gap-3 items-start shadow-card transition-transform active:scale-[0.98]"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
            {event.city}
          </span>
          <span className="text-[11px] text-neutral-500">{CATEGORY_LABELS[event.category]}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFav(toggleFavorite(event.id).includes(event.id));
            }}
            className={`ml-auto text-base leading-none transition-transform active:scale-90 ${fav ? "text-rose-500" : "text-neutral-300"}`}
          >
            {fav ? "♥" : "♡"}
          </button>
        </div>
        <h3 className="text-sm font-semibold truncate text-neutral-900">{event.title}</h3>
        <p className="text-xs text-neutral-500 truncate mt-0.5">{event.venue || event.address || "地點：詳見官方資訊"}</p>
        <p className="text-xs text-accent mt-2 font-mono font-medium">
          {formatEventWhen(event, new Date())} {event.isFree ? "・免費" : `・${event.price}`}
        </p>
      </div>
    </button>
  );
}
