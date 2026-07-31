"use client";

import { useEffect, useMemo, useState } from "react";
import type { NormalizedEvent } from "@/types/event";
import { loadEvents, sortByStart } from "@/lib/events-client";
import EventCard from "@/components/event/EventCard";
import EventDetailSheet from "@/components/event/EventDetailSheet";
import { EventListSkeleton } from "@/components/ui/Skeleton";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export default function CalendarPage() {
  const [events, setEvents] = useState<NormalizedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selected, setSelected] = useState<NormalizedEvent | null>(null);

  useEffect(() => {
    loadEvents()
      .then((data) => setEvents(data.events))
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"));
  }, []);

  const base = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const year = base.getFullYear();
  const month = base.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isCurrentMonth = monthOffset === 0;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, NormalizedEvent[]>();
    (events || []).forEach((e) => {
      const d = new Date(e.start);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const key = String(d.getDate());
      map.set(key, [...(map.get(key) || []), e]);
    });
    return map;
  }, [events, year, month]);

  const selectedDayEvents = useMemo(() => {
    if (!events) return [];
    return sortByStart(
      events.filter((e) => new Date(e.start).toDateString() === selectedDate.toDateString())
    );
  }, [events, selectedDate]);

  return (
    <main className="px-4 pt-6 pb-6 max-w-lg mx-auto">
      <h1 className="text-xl font-black tracking-tight mb-4 text-neutral-900">行事曆</h1>

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setMonthOffset((m) => m - 1)}
          className="w-9 h-9 rounded-xl bg-surface border border-neutral-200 text-lg text-neutral-600 active:scale-90 transition-transform"
        >
          ‹
        </button>
        <div className="text-center">
          <h2 className="text-base font-bold text-neutral-900">{year} 年 {month + 1} 月</h2>
          {!isCurrentMonth && (
            <button onClick={() => setMonthOffset(0)} className="text-[11px] text-accent">回到本月</button>
          )}
        </div>
        <button
          onClick={() => setMonthOffset((m) => m + 1)}
          className="w-9 h-9 rounded-xl bg-surface border border-neutral-200 text-lg text-neutral-600 active:scale-90 transition-transform"
        >
          ›
        </button>
      </div>

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">讀取活動資料失敗：{error}</p>}

      <div className="grid grid-cols-7 gap-1.5 mb-6">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] text-neutral-400 pb-1 font-mono">{w}</div>
        ))}
        {events === null
          ? Array.from({ length: 35 }).map((_, i) => (
              <div key={`sk-${i}`} className="aspect-square rounded-xl bg-neutral-100 animate-pulse" />
            ))
          : <>
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const date = new Date(year, month, day, 12, 0, 0);
                const isToday = date.toDateString() === new Date().toDateString();
                const isSelected = date.toDateString() === selectedDate.toDateString();
                const dayEvents = eventsByDay.get(String(day)) || [];
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(date)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-mono border transition-all active:scale-95 ${
                      isSelected
                        ? "bg-accent text-white border-accent font-bold shadow-card"
                        : isToday
                          ? "border-accent/60 text-neutral-800 bg-surface"
                          : "border-neutral-200 text-neutral-500 bg-surface"
                    }`}
                  >
                    <span>{day}</span>
                    {dayEvents.length > 0 && (
                      <span className={`mt-1 h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-teal-500"}`} />
                    )}
                  </button>
                );
              })}
            </>
        }
      </div>

      <h2 className="text-sm font-bold mb-2 text-neutral-900">
        {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日（{WEEKDAYS[selectedDate.getDay()]}）活動
      </h2>
      {events === null ? (
        <EventListSkeleton count={3} />
      ) : selectedDayEvents.length === 0 ? (
        <p className="text-sm text-neutral-400 py-10 text-center">這天沒有活動</p>
      ) : (
        <div className="flex flex-col gap-2">
          {selectedDayEvents.map((e) => <EventCard key={e.id} event={e} onOpen={setSelected} />)}
        </div>
      )}

      {selected && <EventDetailSheet event={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
