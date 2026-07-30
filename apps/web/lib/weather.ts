// 天氣資訊：串接 Open-Meteo（免費、不需金鑰、支援瀏覽器端直接呼叫）。
// 除了「現在」的天氣，也拿今天逐小時的降雨機率預報，讓播報能講出「幾點後可能下雨」，
// 而不是只講「現在」的狀況——現在是晴天不代表傍晚不會下雨。
// 這些都是純規則判斷（找出降雨機率開始升高的時間點），不需要呼叫 Gemini。

export interface HourlyPoint {
  hour: number;          // 0-23
  precipProb: number;    // 0-100
}

export interface WeatherSnapshot {
  tempC: number;
  feelsLikeC: number;
  precipitationChance: number; // 「現在」的降雨機率
  windKmh: number;
  hourly: HourlyPoint[];        // 今天逐小時降雨機率預報，用來描述「何時可能下雨」
}

export type WeatherAlertLevel = "hot" | "rain-high" | "rain-possible" | "windy" | "cold" | "comfortable";

export interface WeatherAdvisory {
  level: WeatherAlertLevel;
  emoji: string;
  headline: string;    // 給「天氣播報」顯示的一句話（含「現在」的狀況）
  rainOutlook: string; // 額外一句「今天稍後降雨時機」的描述
}

const cache = new Map<string, WeatherSnapshot>();
const RAIN_LIKELY_THRESHOLD = 50; // 降雨機率超過這個百分比，視為「這個時段可能下雨」

export async function getWeather(lat: number, lon: number): Promise<WeatherSnapshot | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key)!;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m` +
      `&hourly=precipitation_probability&forecast_days=1&timezone=Asia%2FTaipei`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const cur = data.current;

    const hourlyTimes: string[] = data.hourly?.time ?? [];
    const hourlyProbs: number[] = data.hourly?.precipitation_probability ?? [];
    const hourly: HourlyPoint[] = hourlyTimes.map((t, i) => ({
      hour: new Date(t).getHours(),
      precipProb: hourlyProbs[i] ?? 0,
    }));

    const snapshot: WeatherSnapshot = {
      tempC: Math.round(cur.temperature_2m),
      feelsLikeC: Math.round(cur.apparent_temperature),
      precipitationChance: cur.precipitation > 0 ? Math.min(100, Math.round(cur.precipitation * 20)) : 5,
      windKmh: Math.round(cur.wind_speed_10m),
      hourly,
    };
    cache.set(key, snapshot);
    return snapshot;
  } catch {
    return null; // 離線或請求失敗時，呼叫端要能接受 null（推薦邏輯就不把天氣納入評分）
  }
}

/** 從逐小時預報裡，找出「今天稍後」降雨機率什麼時候會升高，組成一句描述。 */
function describeRainOutlook(hourly: HourlyPoint[]): string {
  if (!hourly.length) return "";
  const now = new Date();
  const currentHour = now.getHours();
  const remaining = hourly.filter((h) => h.hour >= currentHour);
  if (!remaining.length) return "";

  const rainyHours = remaining.filter((h) => h.precipProb >= RAIN_LIKELY_THRESHOLD);
  if (rainyHours.length === 0) {
    const maxProb = Math.max(...remaining.map((h) => h.precipProb));
    if (maxProb < 20) return "今天稍後降雨機率都很低，不太需要帶傘。";
    return `今天稍後降雨機率最高約 ${maxProb}%，機率不算高，但可以備一把折疊傘。`;
  }

  // 找連續的降雨時段（例如 18,19,20 點都超過門檻，就講「18:00-21:00」這種區間，
  // 不要每個小時都分開講，一句話講不完）
  const first = rainyHours[0]!;
  const last = rainyHours[rainyHours.length - 1]!;
  const isNow = first.hour === currentHour;
  const startLabel = isNow ? "現在起" : `${first.hour}:00 後`;
  return `預計${startLabel}到 ${last.hour + 1}:00 左右降雨機率較高（最高 ${Math.max(...rainyHours.map((h) => h.precipProb))}%），建議帶傘。`;
}

/**
 * 天氣播報：把數值轉成一句人話。規則有優先順序（炎熱 > 高降雨機率 > 大風 > 寒冷 > 可能降雨 > 舒適），
 * 同時符合多個條件時，取最需要提醒使用者的那一個。另外附上 rainOutlook 講「今天稍後」的降雨時機。
 */
export function getWeatherAdvisory(w: WeatherSnapshot): WeatherAdvisory {
  const rainOutlook = describeRainOutlook(w.hourly);

  if (w.feelsLikeC >= 34) {
    return { level: "hot", emoji: "🥵", headline: `體感 ${w.feelsLikeC}°C，悶熱炎熱，記得防曬補水`, rainOutlook };
  }
  if (w.precipitationChance >= 60) {
    return { level: "rain-high", emoji: "☔", headline: "現在降雨機率高，外出記得帶傘", rainOutlook };
  }
  if (w.windKmh >= 30) {
    return { level: "windy", emoji: "🌬️", headline: "風勢較強，戶外活動請留意", rainOutlook };
  }
  if (w.feelsLikeC <= 15) {
    return { level: "cold", emoji: "🧥", headline: `體感 ${w.feelsLikeC}°C，偏涼記得保暖`, rainOutlook };
  }
  if (w.precipitationChance >= 30) {
    return { level: "rain-possible", emoji: "🌦️", headline: "現在可能有零星降雨", rainOutlook };
  }
  return { level: "comfortable", emoji: "🌤️", headline: "現在天氣舒適，適合外出走走", rainOutlook };
}
