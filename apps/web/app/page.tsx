"use client";

import { useEffect, useMemo, useState } from "react";
import type { NormalizedEvent, Category } from "@/types/event";
import { CATEGORY_LABELS } from "@/types/event";
import { loadEvents, todayEvents, sortByStart } from "@/lib/events-client";
import { getCurrentPosition, haversineKm, type GeoPosition } from "@/lib/geo";
import { getWeather, type WeatherSnapshot } from "@/lib/weather";
import { nearestCity, CITY_CENTERS } from "@/lib/city-centers";
import { DEFAULT_LOCATION, HOME_EXCLUDED_CATEGORIES, HOME_MAX_DISTANCE_KM } from "@/lib/config";
import EventCard from "@/components/event/EventCard";
import EventDetailSheet from "@/components/event/EventDetailSheet";
import Chip from "@/components/ui/Chip";
import WeatherBroadcast, { type WeatherOption } from "@/components/ui/WeatherBroadcast";
import { EventListSkeleton } from "@/components/ui/Skeleton";

const QUICK_CATEGORIES: Category[] = [
  "fireworks", "concert", "performance", "market", "exhibition", "nightmarket",
  "family", "run", "experience", "food", "lantern", "creative",
];

// 選了分類篩選之後，最多顯示幾筆「近期」活動（不只今天），避免列表長到滑不完
const CATEGORY_VIEW_LIMIT = 60;

export default function HomePage() {
  const [events, setEvents] = useState<NormalizedEvent[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 位置一開始就用預設值（新北市林口區），不用等瀏覽器定位權限回應就能立刻顯示
  // 「離我多近」這類個人化內容；如果之後瀏覽器真的給了更精確的 GPS 座標，會覆蓋掉它。
  const [loc, setLoc] = useState<GeoPosition>(DEFAULT_LOCATION);
  const [usingPreciseLocation, setUsingPreciseLocation] = useState(false);
  const [currentWeather, setCurrentWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherByCity, setWeatherByCity] = useState<Record<string, WeatherSnapshot | null>>({});
  const [selectedWeatherKey, setSelectedWeatherKey] = useState<string>("current");
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [selected, setSelected] = useState<NormalizedEvent | null>(null);

  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    loadEvents()
      .then((data) => {
        setEvents(data.events);
        setGeneratedAt(data.generatedAt);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"));
  }, []);

  useEffect(() => {
    getCurrentPosition()
      .then((pos) => { setLoc(pos); setUsingPreciseLocation(true); })
      .catch(() => {}); // 拿不到就繼續用預設位置（新北市林口區），不用特別處理
  }, []);

  // 目前位置的天氣：直接用座標查，不是用縣市中心點，準確度較高
  useEffect(() => {
    getWeather(loc.lat, loc.lon).then(setCurrentWeather);
  }, [loc]);

  const withinDistance = useMemo(() => {
    return (e: NormalizedEvent) => {
      if (e.lat == null || e.lon == null) return true; // 沒座標判斷不了距離，不主動篩掉
      return haversineKm(loc.lat, loc.lon, e.lat, e.lon) <= HOME_MAX_DISTANCE_KM;
    };
  }, [loc]);

  // 今天的活動：沒選分類時預設看這個。排除首頁不想看到的分類（課程/動漫）+ 太遠的活動。
  const today = useMemo(() => {
    if (!events) return [];
    return sortByStart(todayEvents(events, now))
      .filter((e) => !HOME_EXCLUDED_CATEGORIES.includes(e.category))
      .filter(withinDistance);
  }, [events, now, withinDistance]);

  // 選了分類之後：改看「近期」符合這個分類的活動，不再限定「今天」——
  // 不然像是只有 8/5、8/15 才有場次的煙火，平常點進「煙火」分類永遠是空的。
  const categoryScoped = useMemo(() => {
    if (!events || !activeCategory) return [];
    return sortByStart(
      events
        .filter((e) => new Date(e.end) >= now)
        .filter((e) => e.category === activeCategory)
        .filter(withinDistance)
    ).slice(0, CATEGORY_VIEW_LIMIT);
  }, [events, activeCategory, now, withinDistance]);

  const shownList = activeCategory ? categoryScoped : today;
  const listTitle = activeCategory ? `近期${CATEGORY_LABELS[activeCategory]}活動` : "今天的活動";

  // 今天有活動的城市，順便查一下天氣（給天氣播報的「切換地區」用）
  useEffect(() => {
    if (!today.length) return;
    const cities = Array.from(new Set(today.map((e) => e.city)));
    cities.forEach(async (city) => {
      const first = today.find((e) => e.city === city && e.lat != null && e.lon != null);
      if (!first || first.lat == null || first.lon == null) return;
      const w = await getWeather(first.lat, first.lon);
      setWeatherByCity((prev) => ({ ...prev, [city]: w }));
    });
  }, [today]);

  const currentLocationLabel = useMemo(() => {
    const label = usingPreciseLocation ? nearestCity(loc.lat, loc.lon, haversineKm) : DEFAULT_LOCATION.label;
    return `目前位置（${label}附近）`;
  }, [loc, usingPreciseLocation]);

  const weatherOptions = useMemo<WeatherOption[]>(() => {
    const opts: WeatherOption[] = [{ key: "current", label: currentLocationLabel, weather: currentWeather }];
    Object.entries(weatherByCity).forEach(([city, weather]) => {
      opts.push({ key: city, label: city, weather });
    });
    return opts;
  }, [currentLocationLabel, currentWeather, weatherByCity]);

  const allCityNames = useMemo(() => Object.keys(CITY_CENTERS), []);

  // 使用者從「其他地區」下拉選單選了一個目前還沒查過天氣的縣市時，用該縣市的中心點
  // 座標即時查一次（見 lib/city-centers.ts），不受限於「今天剛好有沒有活動在那裡」。
  useEffect(() => {
    if (selectedWeatherKey === "current" || weatherByCity[selectedWeatherKey]) return;
    const center = CITY_CENTERS[selectedWeatherKey];
    if (!center) return;
    getWeather(center.lat, center.lon).then((w) => {
      setWeatherByCity((prev) => ({ ...prev, [selectedWeatherKey]: w }));
    });
  }, [selectedWeatherKey, weatherByCity]);

  if (error) {
    return <div className="p-6 text-sm text-neutral-500">讀取活動資料失敗：{error}</div>;
  }

  return (
    <main className="px-4 pt-6 pb-6 max-w-lg mx-auto">
      <header className="mb-6">
        <h1 className="text-xl font-black tracking-tight text-neutral-900">全台活動雷達</h1>
        <p className="text-xs text-neutral-400 mt-1 font-mono">
          {generatedAt ? `資料更新於 ${new Date(generatedAt).toLocaleString("zh-TW", { hour12: false })}` : "尚未取得資料更新時間"}
        </p>
      </header>

      <WeatherBroadcast
        options={weatherOptions}
        allCities={allCityNames}
        selectedKey={selectedWeatherKey}
        onSelect={setSelectedWeatherKey}
      />

      <section className="mb-6">
        <h2 className="text-sm font-bold mb-2 text-neutral-900">依類型快速篩選</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={activeCategory === null} onClick={() => setActiveCategory(null)}>全部</Chip>
          {QUICK_CATEGORIES.map((cat) => (
            <Chip key={cat} active={activeCategory === cat} onClick={() => setActiveCategory(cat)}>
              {CATEGORY_LABELS[cat]}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold mb-2 text-neutral-900">{listTitle}</h2>
        {!events ? (
          <EventListSkeleton count={4} />
        ) : shownList.length === 0 ? (
          <p className="text-sm text-neutral-400 py-8 text-center">
            {activeCategory ? "附近近期沒有這個分類的活動" : "今天沒有活動"}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {shownList.map((e) => (
              <EventCard key={e.id} event={e} onOpen={setSelected} />
            ))}
          </div>
        )}
      </section>

      {selected && <EventDetailSheet event={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
