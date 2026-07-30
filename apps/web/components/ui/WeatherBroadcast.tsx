"use client";

import type { WeatherSnapshot } from "@/lib/weather";
import { getWeatherAdvisory } from "@/lib/weather";

export interface WeatherOption {
  key: string;       // "current" 或縣市名稱
  label: string;      // 顯示用文字，例如「目前位置」「台北市」
  weather: WeatherSnapshot | null;
}

const LEVEL_STYLES: Record<string, string> = {
  hot: "border-orange-200 bg-orange-50 text-orange-700",
  "rain-high": "border-sky-200 bg-sky-50 text-sky-700",
  "rain-possible": "border-sky-100 bg-sky-50 text-sky-600",
  windy: "border-teal-200 bg-teal-50 text-teal-700",
  cold: "border-indigo-200 bg-indigo-50 text-indigo-700",
  comfortable: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/**
 * 天氣播報：預設顯示使用者目前位置的天氣。
 * 下面有兩種切換方式：常用的幾個（目前位置＋今天有活動的城市）用 chip 一鍵切換，
 * 想看其他縣市則用下拉選單（涵蓋全台 22 縣市），不受限於「今天剛好有沒有活動」。
 * 純規則判斷產生播報文字，不呼叫 AI（見 lib/weather.ts 的 getWeatherAdvisory）。
 */
export default function WeatherBroadcast({
  options,
  allCities,
  selectedKey,
  onSelect,
}: {
  options: WeatherOption[];
  allCities: string[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const selected = options.find((o) => o.key === selectedKey);
  const selectedLabel = selected?.label ?? selectedKey;
  const selectedWeather = selected?.weather ?? null;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-bold mb-2 flex items-center gap-1.5 text-neutral-900">
        <span>📡</span> 天氣播報
      </h2>

      {selectedWeather ? (
        (() => {
          const advisory = getWeatherAdvisory(selectedWeather);
          return (
            <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 mb-2 ${LEVEL_STYLES[advisory.level]}`}>
              <span className="text-2xl leading-none">{advisory.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold opacity-80">{selectedLabel}</div>
                <div className="text-sm">{advisory.headline}</div>
                {advisory.rainOutlook && (
                  <div className="text-xs opacity-80 mt-1">☂ {advisory.rainOutlook}</div>
                )}
              </div>
              <div className="text-right font-mono text-xs opacity-70 shrink-0">
                <div className="text-base">{selectedWeather.tempC}°C</div>
                <div>💨{selectedWeather.windKmh}</div>
              </div>
            </div>
          );
        })()
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 mb-2 text-sm text-neutral-500">
          天氣讀取中…
        </div>
      )}

      <div className="flex items-center gap-2">
        {options.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => onSelect(o.key)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors active:scale-95 ${
                  o.key === selectedKey
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-neutral-200 bg-white text-neutral-500"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        <select
          value={allCities.includes(selectedKey) ? selectedKey : ""}
          onChange={(e) => e.target.value && onSelect(e.target.value)}
          className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500"
        >
          <option value="">其他地區…</option>
          {allCities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    </section>
  );
}
