// 首頁「今日/今晚/本週推薦」的預設排序邏輯（純前端計算，不呼叫 Gemini）。
//
// 設計決策：首頁的推薦卡片用這裡的heuristic 立即算出來，不必每次載入首頁都打一次
// /api/ai——那樣既慢（多一次網路來回）又貴（每次都算一次 Gemini 額度）。真正會用到
// Gemini 的「AI 推薦」是使用者在搜尋頁主動問「有什麼推薦」的時候，見 app/search/page.tsx。
// 這裡的分數只是排序用，活動本身的三個重點/推薦理由等內容仍然是 scripts/ai/enrich.py
// 批次產生、存在 events.json 裡的真實 AI 產出，不是這裡臨時生成的假內容。
import type { NormalizedEvent, Category } from "@/types/event";
import { haversineKm } from "./geo";
import type { WeatherSnapshot } from "./weather";

export interface RecommendContext {
  now: Date;
  userLocation?: { lat: number; lon: number } | null;
  favoriteIds?: string[];
  /** 使用者收藏過的活動所屬的分類/城市，用來讓推薦更貼近興趣。見 buildFavoriteProfile()。 */
  favoriteCategories?: Category[];
  favoriteCities?: string[];
  weatherByCity?: Record<string, WeatherSnapshot | null>;
}

/**
 * 從使用者收藏過的活動裡，統計出「常收藏的分類/城市」，給 scoreEvent 當作興趣訊號。
 * 這是唯一能取得使用者興趣的資料來源——這個版本沒有另外做偏好設定頁面，收藏本身
 * 就是最直接的興趣訊號，不需要使用者額外設定什麼。
 */
export function buildFavoriteProfile(
  allEvents: NormalizedEvent[],
  favoriteIds: string[]
): { categories: Category[]; cities: string[] } {
  const favorited = allEvents.filter((e) => favoriteIds.includes(e.id));
  const categoryCounts = new Map<Category, number>();
  const cityCounts = new Map<string, number>();
  for (const e of favorited) {
    categoryCounts.set(e.category, (categoryCounts.get(e.category) ?? 0) + 1);
    cityCounts.set(e.city, (cityCounts.get(e.city) ?? 0) + 1);
  }
  const topCategories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const topCities = [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return { categories: topCategories, cities: topCities };
}

export function scoreEvent(event: NormalizedEvent, ctx: RecommendContext): number {
  let score = event.popularityScore; // 0-100 基底分數

  if (ctx.favoriteCategories?.includes(event.category)) {
    score += 25; // 收藏過同分類的活動，是目前最強的個人化訊號
  }
  if (ctx.favoriteCities?.includes(event.city)) {
    score += 10; // 常收藏這個城市的活動，也是有意義但比分類弱一點的訊號
  }
  if (ctx.favoriteIds?.includes(event.id)) {
    score -= 100; // 已經收藏過的活動不用再推薦一次，讓它幾乎不會出現在「今日推薦」
  }

  if (ctx.userLocation && event.lat != null && event.lon != null) {
    const distanceKm = haversineKm(ctx.userLocation.lat, ctx.userLocation.lon, event.lat, event.lon);
    score += Math.max(0, 20 - distanceKm); // 越近加越多分，20km 外幾乎不加分
  }

  const weather = ctx.weatherByCity?.[event.city];
  if (weather) {
    if (weather.precipitationChance < 30) score += 10;
    else if (event.category === "outdoor" || event.category === "run" || event.category === "fireworks") {
      score -= 15; // 戶外活動遇到高降雨機率扣分
    }
  }

  return score;
}

export function pickTopRecommendations(
  events: NormalizedEvent[],
  ctx: RecommendContext,
  limit = 3
): NormalizedEvent[] {
  return [...events]
    .map((e) => ({ event: e, score: scoreEvent(e, ctx) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.event);
}
