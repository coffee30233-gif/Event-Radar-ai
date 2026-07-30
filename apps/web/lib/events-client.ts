// 前端讀取 public/events.json 的工具函式與篩選邏輯。
// events.json 是靜態檔案，直接 fetch 就好，不需要 /api/events。
import type { NormalizedEvent, EventsFile, Category, Region } from "@/types/event";

let cache: EventsFile | null = null;
let inflight: Promise<EventsFile> | null = null;

export async function loadEvents(): Promise<EventsFile> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/events.json", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`events.json 讀取失敗：HTTP ${res.status}`);
      return res.json() as Promise<EventsFile>;
    })
    .then((data) => {
      cache = data;
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function isSameDay(aIso: string, bIso: string): boolean {
  return aIso.slice(0, 10) === bIso.slice(0, 10);
}

export function isOngoingOrUpcoming(event: NormalizedEvent, now: Date): boolean {
  return new Date(event.end).getTime() >= now.getTime();
}

export interface EventFilters {
  city?: string;
  region?: Region;
  category?: Category;
  freeOnly?: boolean;
  keyword?: string;
}

export function applyFilters(events: NormalizedEvent[], filters: EventFilters): NormalizedEvent[] {
  return events.filter((e) => {
    if (filters.city && e.city !== filters.city) return false;
    if (filters.region && e.region !== filters.region) return false;
    if (filters.category && e.category !== filters.category) return false;
    if (filters.freeOnly && !e.isFree) return false;
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      const haystack = `${e.title} ${e.venue} ${e.address}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });
}

export function todayEvents(events: NormalizedEvent[], now: Date): NormalizedEvent[] {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return events.filter((e) => new Date(e.start) <= endOfToday && new Date(e.end) >= now);
}

export function tomorrowEvents(events: NormalizedEvent[], now: Date): NormalizedEvent[] {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(tomorrow); start.setHours(0, 0, 0, 0);
  const end = new Date(tomorrow); end.setHours(23, 59, 59, 999);
  return events.filter((e) => new Date(e.start) >= start && new Date(e.start) <= end);
}

export function weekEvents(events: NormalizedEvent[], now: Date): NormalizedEvent[] {
  const end = new Date(now);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return events.filter((e) => new Date(e.start) >= now && new Date(e.start) <= end);
}

/** 最近的週末（六日）範圍：如果今天剛好是週六/週日，範圍從現在開始算，不是跳到下週。 */
export function upcomingWeekendRange(now: Date): { start: Date; end: Date } {
  const day = now.getDay(); // 0=日, 6=六
  const daysUntilSat = day === 6 ? 0 : day === 0 ? -1 : 6 - day; // 週日算「這個週末已經開始」
  const start = new Date(now);
  if (day !== 6 && day !== 0) start.setDate(start.getDate() + daysUntilSat);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + (day === 0 ? 0 : 1)); // 週日當天 start=今天，end 也是今天
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function weekendEvents(events: NormalizedEvent[], now: Date): NormalizedEvent[] {
  const { start, end } = upcomingWeekendRange(now);
  return events.filter((e) => {
    const s = new Date(e.start);
    const en = new Date(e.end);
    return en >= now && s <= end && en >= start; // 活動時段跟週末範圍有重疊就算
  });
}

export function monthEvents(events: NormalizedEvent[], year: number, month: number): NormalizedEvent[] {
  return events.filter((e) => {
    const d = new Date(e.start);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

export function nearbyEvents(
  events: NormalizedEvent[],
  origin: { lat: number; lon: number },
  radiusKm: number,
  haversineKm: (lat1: number, lon1: number, lat2: number, lon2: number) => number
): NormalizedEvent[] {
  return events.filter((e) => {
    if (e.lat == null || e.lon == null) return false;
    return haversineKm(origin.lat, origin.lon, e.lat, e.lon) <= radiusKm;
  });
}

export function sortByStart(events: NormalizedEvent[]): NormalizedEvent[] {
  return [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function findEventById(events: NormalizedEvent[], id: string): NormalizedEvent | undefined {
  return events.find((e) => e.id === id);
}
