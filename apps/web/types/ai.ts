// /api/ai 的 request/response 型別，對應 docs/03-AI-CONTRACTS.md
import type { Category, Region } from "./event";

export type AiIntent = "search" | "plan" | "recommend" | "ask" | "restaurant";

/** NormalizedEvent 的精簡版，只帶 Gemini 判斷需要的欄位。 */
export interface CandidateEvent {
  id: string;
  title: string;
  city: string;
  region: Region;
  category: Category;
  start: string;
  end: string;
  isFree: boolean;
  lat: number | null;
  lon: number | null;
  distanceKm: number | null; // 離使用者目前位置的距離（前端先算好，Gemini 不用自己猜）
  isMultiDay: boolean;        // 是不是跨很多天的長期展覽/活動（而不是單場活動）
  suitableFor: string[];
  estimatedStayMinutes: number;
  hasAircon: boolean | null;
}

export interface AiWeatherInfo {
  city: string;
  tempC: number;
  feelsLikeC: number;
  precipitationChance: number;
  windKmh: number;
}

export interface AiRequest {
  message: string;
  now: string; // ISO timestamp
  userLocation?: { lat: number; lon: number };
  favoriteEventIds?: string[];
  candidateEvents: CandidateEvent[];
  focusEventId?: string; // 只有 intent=ask 常用到
  weather?: AiWeatherInfo[]; // 候選活動所在城市的即時天氣，給 recommend/plan 判斷用
}

export interface AiSearchResult {
  matchedEventIds: string[];
  filters: {
    city?: string;
    region?: Region;
    category?: Category;
    freeOnly?: boolean;
  };
}

export interface AiPlanResult {
  timeline: Array<{
    time: string;
    title: string;
    eventId: string | null;
    note: string;
  }>;
}

export interface AiRecommendResult {
  picks: Array<{ eventId: string; reasons: string[] }>;
}

export interface AiAskResult {
  answer: string;
}

export interface AiRestaurantResult {
  picks: Array<{
    name: string;
    cuisine: string;      // 料理類型，例如「日式定食」「牛肉麵」「早午餐」
    priceRange: string;   // 大致價位描述，例如「$200-400/人」
    areaHint: string;     // 大概位置描述，例如「林口三井 Outlet 附近」
    reason: string;       // 為什麼推薦
  }>;
  disclaimer: string; // 一定要填：提醒使用者這是 AI 一般知識整理，不是即時營業資訊
}

export interface AiResponse {
  intent: AiIntent;
  replyText: string;
  search: AiSearchResult | null;
  plan: AiPlanResult | null;
  recommend: AiRecommendResult | null;
  ask: AiAskResult | null;
  restaurant: AiRestaurantResult | null;
}

/** Route 內部使用：呼叫失敗時的統一錯誤格式 */
export interface AiErrorResponse {
  error: string;
}
