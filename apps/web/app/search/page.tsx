"use client";

import { useEffect, useMemo, useState } from "react";
import type { NormalizedEvent } from "@/types/event";
import type { AiResponse, CandidateEvent } from "@/types/ai";
import { loadEvents, findEventById } from "@/lib/events-client";
import { getCurrentPosition, haversineKm, type GeoPosition } from "@/lib/geo";
import { getWeather } from "@/lib/weather";
import { isMultiDayEvent } from "@/lib/format";
import { getFavoriteIds } from "@/lib/storage";
import { DEFAULT_LOCATION } from "@/lib/config";
import EventCard from "@/components/event/EventCard";
import EventDetailSheet from "@/components/event/EventDetailSheet";
import { EventListSkeleton } from "@/components/ui/Skeleton";

const SUGGESTIONS = ["今天晚上想約會", "附近有什麼", "免費的", "親子活動", "附近有什麼好吃的"];

function toCandidate(e: NormalizedEvent, userLoc: GeoPosition): CandidateEvent {
  return {
    id: e.id, title: e.title, city: e.city, region: e.region, category: e.category,
    start: e.start, end: e.end, isFree: e.isFree, lat: e.lat, lon: e.lon,
    distanceKm: e.lat != null && e.lon != null
      ? Math.round(haversineKm(userLoc.lat, userLoc.lon, e.lat, e.lon) * 10) / 10
      : null,
    isMultiDay: isMultiDayEvent(e),
    suitableFor: e.ai.suitableFor, estimatedStayMinutes: e.ai.estimatedStayMinutes,
    hasAircon: e.ai.hasAircon,
  };
}

export default function SearchPage() {
  const [events, setEvents] = useState<NormalizedEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 跟首頁一樣，預設用新北市林口區，拿到更精確的 GPS 後會覆蓋掉
  const [loc, setLoc] = useState<GeoPosition>(DEFAULT_LOCATION);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResponse | null>(null);
  const [selected, setSelected] = useState<NormalizedEvent | null>(null);

  useEffect(() => {
    loadEvents()
      .then((data) => setEvents(data.events))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "讀取失敗"));
    getCurrentPosition().then(setLoc).catch(() => {});
  }, []);

  // 候選清單：只送「現在到未來 14 天內」的活動給 Gemini，/api/ai 內部也會再做一次上限防呆
  const candidateEvents = useMemo(() => {
    if (!events) return [];
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 14);
    return events
      .filter((e) => new Date(e.end) >= now && new Date(e.start) <= horizon)
      .map((e) => toCandidate(e, loc));
  }, [events, loc]);

  async function send(text: string) {
    if (!text.trim() || !events) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const citiesWithCoords = new Map<string, { lat: number; lon: number }>();
      candidateEvents.forEach((e) => {
        if (citiesWithCoords.size >= 8) return;
        if (e.lat != null && e.lon != null && !citiesWithCoords.has(e.city)) {
          citiesWithCoords.set(e.city, { lat: e.lat, lon: e.lon });
        }
      });
      const weatherEntries = await Promise.all(
        Array.from(citiesWithCoords.entries()).map(async ([city, { lat, lon }]) => {
          const w = await getWeather(lat, lon);
          return w ? { city, tempC: w.tempC, feelsLikeC: w.feelsLikeC, precipitationChance: w.precipitationChance, windKmh: w.windKmh } : null;
        })
      );
      const weather = weatherEntries.filter((w): w is NonNullable<typeof w> => w != null);

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          now: new Date().toISOString(),
          userLocation: loc,
          favoriteEventIds: getFavoriteIds(),
          candidateEvents,
          weather,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `AI 服務暫時無法使用（HTTP ${res.status}）`);
      }
      const data: AiResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生未知錯誤");
    } finally {
      setLoading(false);
    }
  }

  const matchedEvents = useMemo(() => {
    if (!events || !result?.search) return [];
    return result.search.matchedEventIds
      .map((id) => findEventById(events, id))
      .filter((e): e is NormalizedEvent => !!e);
  }, [events, result]);

  const recommendedEvents = useMemo(() => {
    if (!events || !result?.recommend) return [];
    return result.recommend.picks
      .map((p) => ({ event: findEventById(events, p.eventId), reasons: p.reasons }))
      .filter((x): x is { event: NormalizedEvent; reasons: string[] } => !!x.event);
  }, [events, result]);

  return (
    <main className="px-4 pt-6 pb-6 max-w-lg mx-auto">
      <h1 className="text-xl font-black tracking-tight mb-1 text-neutral-900">AI 搜尋</h1>
      <p className="text-xs text-neutral-400 mb-4">用一般語言問，不用打關鍵字，例如「今天晚上想約會」</p>

      <div className="flex gap-2 mb-3">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(message)}
          placeholder="輸入你想找的活動…"
          className="flex-1 rounded-2xl bg-white border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-accent transition-colors text-neutral-800"
        />
        <button
          onClick={() => send(message)}
          disabled={loading || !events}
          className="rounded-2xl bg-accent px-4 py-3 text-sm font-bold text-white disabled:opacity-40 active:scale-95 transition-transform"
        >
          {loading ? "…" : "送出"}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto mb-6 pb-1">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => { setMessage(s); send(s); }}
            disabled={loading || !events}
            className="shrink-0 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-xs text-neutral-500 disabled:opacity-40 active:scale-95 transition-transform"
          >
            {s}
          </button>
        ))}
      </div>

      {loadError && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">讀取活動資料失敗：{loadError}</p>}
      {!events && !loadError && <p className="text-sm text-neutral-400 mb-4">活動資料載入中…</p>}
      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">{error}</p>}
      {loading && <EventListSkeleton count={2} />}

      {!loading && result && (
        <div className="mb-4">
          <p className="text-sm bg-white border border-neutral-200 rounded-2xl p-3.5 text-neutral-700">✦ {result.replyText}</p>
        </div>
      )}

      {!loading && result?.intent === "search" && (
        <div className="flex flex-col gap-2">
          {matchedEvents.length === 0
            ? <p className="text-sm text-neutral-400 text-center py-8">沒有找到符合的活動</p>
            : matchedEvents.map((e) => <EventCard key={e.id} event={e} onOpen={setSelected} />)}
        </div>
      )}

      {!loading && result?.intent === "recommend" && (
        <div className="flex flex-col gap-2">
          {recommendedEvents.map(({ event, reasons }) => (
            <div key={event.id}>
              <EventCard event={event} onOpen={setSelected} />
              {reasons.length > 0 && (
                <p className="text-xs text-neutral-400 mt-1.5 ml-1">💡 {reasons.join("、")}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && result?.intent === "plan" && result.plan && (
        <div className="flex flex-col">
          {result.plan.timeline.map((step, i) => {
            const stepEvent = step.eventId ? findEventById(events || [], step.eventId) : undefined;
            const isLast = i === result.plan!.timeline.length - 1;
            return (
              <div key={i} className="flex gap-3">
                <div className="w-12 shrink-0 text-sm font-mono text-accent pt-0.5">{step.time}</div>
                <div className={`w-0.5 my-1 ${isLast ? "bg-transparent" : "bg-neutral-200"}`} />
                <div className="flex-1 pb-5">
                  <h4
                    className={`text-sm font-bold ${stepEvent ? "cursor-pointer text-accent active:opacity-70" : "text-neutral-800"}`}
                    onClick={() => stepEvent && setSelected(stepEvent)}
                  >
                    {step.title}
                  </h4>
                  <p className="text-xs text-neutral-400 mt-0.5">{step.note}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && result?.intent === "ask" && result.ask && (
        <p className="text-sm bg-white border border-neutral-200 rounded-2xl p-3.5 text-neutral-700">{result.ask.answer}</p>
      )}

      {!loading && result?.intent === "restaurant" && result.restaurant && (
        <div className="flex flex-col gap-2">
          {result.restaurant.picks.map((r, i) => {
            const mapsQuery = encodeURIComponent(`${r.name} ${r.areaHint}`);
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
            return (
              <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-3.5 shadow-card">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">{r.cuisine}</span>
                  <span className="text-[11px] text-neutral-500 ml-auto font-mono">{r.priceRange}</span>
                </div>
                <h3 className="text-sm font-semibold text-neutral-900">{r.name}</h3>
                <p className="text-xs text-neutral-500 mt-0.5">📍 {r.areaHint}</p>
                <p className="text-xs text-neutral-600 mt-1.5">{r.reason}</p>
                <a
                  href={mapsUrl}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-block mt-2 text-xs font-bold text-accent active:opacity-70"
                >
                  🗺 在 Google 地圖上查看（評分／營業時間／實際地址）→
                </a>
              </div>
            );
          })}
          <p className="text-[11px] text-neutral-400 mt-1 px-1">⚠️ {result.restaurant.disclaimer}</p>
        </div>
      )}

      {selected && <EventDetailSheet event={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
