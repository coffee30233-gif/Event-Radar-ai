// NormalizedEvent 型別定義，對應 docs/02-DATA-SCHEMA.md
// 與 scripts/normalize/schema.py 手動保持同步

export type Category =
  | "fireworks"    // 煙火
  | "firedance"    // 火舞
  | "concert"      // 演唱會
  | "musicfest"    // 音樂祭
  | "performance"  // 表演（音樂劇/舞台劇/戲劇/舞蹈演出，跟純音樂的演唱會分開）
  | "exhibition"   // 展覽
  | "creative"     // 文創
  | "market"       // 市集
  | "nightmarket"  // 夜市
  | "anime"        // 動漫
  | "game"         // 電玩
  | "talk"         // 講座
  | "festival"     // 節慶
  | "lantern"      // 燈會
  | "family"       // 親子
  | "pet"          // 寵物
  | "run"          // 路跑
  | "experience"   // 體驗活動（浮潛/衝浪/滑水/獨木舟等水上或極限運動類體驗）
  | "outdoor"      // 戶外
  | "food"         // 美食活動
  | "popup"        // 快閃活動
  | "mall";        // 大型商場活動

export const CATEGORY_LABELS: Record<Category, string> = {
  fireworks: "煙火",
  firedance: "火舞",
  concert: "演唱會",
  musicfest: "音樂祭",
  performance: "表演",
  exhibition: "展覽",
  creative: "文創",
  market: "市集",
  nightmarket: "夜市",
  anime: "動漫",
  game: "電玩",
  talk: "講座",
  festival: "節慶",
  lantern: "燈會",
  family: "親子",
  pet: "寵物",
  run: "路跑",
  experience: "體驗活動",
  outdoor: "戶外",
  food: "美食活動",
  popup: "快閃活動",
  mall: "大型商場活動",
};

export type Region = "北部" | "中部" | "南部" | "東部" | "離島" | "未知";

export const CITY_TO_REGION: Record<string, Region> = {
  "台北市": "北部", "新北市": "北部", "桃園市": "北部",
  "新竹市": "北部", "新竹縣": "北部", "基隆市": "北部", "宜蘭縣": "北部",
  "台中市": "中部", "苗栗縣": "中部", "彰化縣": "中部", "南投縣": "中部", "雲林縣": "中部",
  "台南市": "南部", "高雄市": "南部", "嘉義市": "南部", "嘉義縣": "南部", "屏東縣": "南部",
  "花蓮縣": "東部", "台東縣": "東部",
  "澎湖縣": "離島", "金門縣": "離島", "連江縣": "離島",
};

export interface NormalizedEvent {
  id: string;
  title: string;
  city: string;
  region: Region;
  address: string;
  venue: string;
  lat: number | null;
  lon: number | null;
  category: Category;
  start: string;   // ISO 8601
  end: string;     // ISO 8601
  price: string;
  isFree: boolean;
  url: string;
  sources: string[];
  popularityScore: number;
  contentHash: string; // 用來偵測「訊息有沒有變動」，決定 pipeline 要不要重新呼叫 Gemini
  aiSource: "gemini" | "fallback" | "pending"; // 這筆摘要是不是真的由 AI 產生，見 docs/02-DATA-SCHEMA.md
  ai: {
    bullets: string[];
    recommendReason: string;
    suitableFor: string[];
    estimatedStayMinutes: number;
    hasAircon: boolean | null;
  };
  updatedAt: string;
}

export interface EventsFile {
  generatedAt: string;
  sources: string[];
  eventCount: number;
  events: NormalizedEvent[];
}
