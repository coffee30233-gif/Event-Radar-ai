# 02 - Data Schema（定案版，第三階段）

這份文件定案 `RawEvent`、`NormalizedEvent`、20 種分類、22 縣市/5 分區對照表，以及
`events.json` 檔案本身的結構。TypeScript 版在 `apps/web/types/event.ts`，Python 版
在 `scripts/normalize/schema.py`，兩邊手動保持同步。

---

## 1. Category（20 種分類）

對應你原始需求列的收錄清單：

```ts
type Category =
  | "fireworks"    // 煙火
  | "firedance"    // 火舞
  | "concert"      // 演唱會
  | "musicfest"    // 音樂祭
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
  | "outdoor"      // 戶外
  | "food"         // 美食活動
  | "popup"        // 快閃活動
  | "mall";        // 大型商場活動
```

分類文字（給前端顯示用）跟關鍵字對應規則放在 `scripts/normalize/category_rules.py`，
兩邊用同一組 key，前端不需要另外維護一份翻譯表。

## 2. Region（5 分區，由 city 自動歸類）

```ts
type Region = "北部" | "中部" | "南部" | "東部" | "離島" | "未知";
```

`未知`是實際串接文化部真實資料後才加上去的：很多筆資料的 `location`（地址）欄位是空的
（尤其是多場次/巡迴類活動），如果堅持「找不到縣市就整筆丟掉」，會篩掉大量本來就有效的
活動。所以改成三層備援＋保底策略，細節見第 7 節。

## 3. CITY_LIST（22 縣市標準名稱 → Region 對照）

```ts
const CITY_TO_REGION: Record<string, Region> = {
  "台北市": "北部", "新北市": "北部", "桃園市": "北部",
  "新竹市": "北部", "新竹縣": "北部", "基隆市": "北部", "宜蘭縣": "北部",
  "台中市": "中部", "苗栗縣": "中部", "彰化縣": "中部", "南投縣": "中部", "雲林縣": "中部",
  "台南市": "南部", "高雄市": "南部", "嘉義市": "南部", "嘉義縣": "南部", "屏東縣": "南部",
  "花蓮縣": "東部", "台東縣": "東部",
  "澎湖縣": "離島", "金門縣": "離島", "連江縣": "離島",
};
```

Normalize 階段用這張表：地址比對到縣市名稱 → 查表得到 `region`。查不到的活動視為
資料異常，記錄警告但不寫入 `events.json`（寧可少一筆，也不要有 city 是 `null` 的髒資料
流進前端）。

## 4. RawEvent（Collector 輸出）

```ts
interface RawEvent {
  sourceId: string;        // "culture" | "taipei" | ... 對應 collector 的 source_id
  sourceRefId: string;     // 該來源的原始 ID
  rawTitle: string;
  rawAddress?: string;
  rawStart: string;        // 原始字串，格式不保證一致
  rawEnd?: string;
  rawCategory?: string;
  rawPrice?: string;
  rawDescription?: string;
  rawUrl?: string;
  lat?: number;
  lon?: number;
  fetchedAt: string;       // ISO timestamp
}
```

## 5. NormalizedEvent（merge/dedupe/AI 之後的標準格式，前端最終拿到的格式）

```ts
interface NormalizedEvent {
  id: string;                // 去重後的穩定 ID
  title: string;
  city: string;               // CITY_TO_REGION 的 key 之一
  region: Region;
  address: string;
  venue: string;
  lat: number | null;
  lon: number | null;
  category: Category;
  start: string;             // ISO 8601
  end: string;               // ISO 8601
  price: string;
  isFree: boolean;
  url: string;
  sources: string[];
  popularityScore: number;   // 0-100
  contentHash: string;        // 見第 8 節：AI 摘要快取機制
  aiSource: "gemini" | "fallback" | "pending"; // 見第 9 節：免費方案配額限制
  ai: {
    bullets: string[];
    recommendReason: string;
    suitableFor: string[];
    estimatedStayMinutes: number;
    hasAircon: boolean | null;
  };
  updatedAt: string;
}
```

## 6. events.json 檔案結構（envelope）

```ts
interface EventsFile {
  generatedAt: string;        // ISO timestamp，pipeline 執行時間
  sources: string[];          // 這次成功執行的 collector source_id 清單
  eventCount: number;
  events: NormalizedEvent[];
}
```

`generatedAt` 用來讓前端顯示「資料更新於 X 分鐘前」，`sources` 用來除錯（一眼看出這次
哪些來源有抓到資料）。

---

## 7. 城市偵測的三層備援（實際串接真實資料後新增）

`scripts/normalize/normalize.py` 的 `_detect_city()` 依序嘗試：

1. `location`（地址欄位）裡找 22 縣市關鍵字
2. `locationName`（場地名稱）裡找
3. 整筆原始資料轉成的 JSON 文字（含 `showinfo` 等巢狀欄位）裡找——這是因為
   實測發現文化部資料的 `location` 常常是空的，city 線索可能只出現在場次資訊
   這類巢狀欄位裡，與其為了每個可能的巢狀結構寫解析邏輯，不如把整包原始資料
   轉成文字整個掃一遍找關鍵字，簡單又不容易漏掉
4. 三層都找不到：**不丟棄這筆活動**，`city` 標記為 `"未知"`、`region` 也標記為
   `"未知"`，活動仍會出現在「全部」分頁與地圖（如果有經緯度的話），只是沒辦法
   用縣市/地區篩選找到它

`scripts/pipeline.py` 執行時會印出這幾行統計（對應你要求的 log 格式）：
```
[normalize] location 空白：X 筆 | city 推導成功：Y 筆（地址 a／場地名稱 b／其他欄位推測 c）
| city 未知但保留：Z 筆 | 因缺少日期而略過：W 筆 | normalize 成功：N 筆（共 T 筆輸入）
```
只有「真的沒有日期資訊」的資料才會被整筆略過（沒有日期就沒辦法排進行事曆/看板，這種
資料本質上就是缺陷資料，不是我們判斷邏輯的問題）。

### 7.1 日期解析也踩過一次坑，一併修掉了

第一次接上真實資料時，`_parse_dt()` 對 2542 筆資料的解析**全部失敗**（`因缺少日期而
略過：2542 筆`）。原因不是資料真的沒有日期，是原本的解析邏輯有兩個問題：

1. 用「先切固定長度字串、再用 `strptime` 精確比對」這招，切出來的長度只要跟格式對不上
   一個字元就會直接失敗，非常脆弱
2. 沒考慮到民國年（例如 `"115-07-29"` = 2026 年）、斜線分隔（`"2026/07/29"`）這類常見變體

現在改用 `python-dateutil` 的彈性解析當主力（`pip install python-dateutil`，已加進
`requirements.txt`），並在丟給 dateutil 之前先偵測、轉換民國年份。就算 dateutil 解析
失敗，也還有一層手動的「抓年月日數字」正規表示式當最後防線。如果日後又出現「全部略過」
這種異常，`normalize_raw_events()` 現在會額外印出前 5 筆解析失敗的 `raw_start` 原始
字串當診斷樣本，不用再靠猜的。

---

## 8. AI 摘要快取機制（`contentHash`）

每天的 pipeline 執行只對「新活動」或「內容有變動的活動」呼叫 Gemini，已存在且沒變的
活動直接沿用 `events.json` 裡舊的 `ai` 欄位。判斷方式：

1. 對每筆活動的 `title`、`venue`、`address`、`category`、`price`、`start`、`end`、
   原始簡介這幾個欄位算一次 SHA-256 hash（取前 16 碼），存成 `contentHash`
2. 每次 pipeline 執行時，把這次算出來的 `contentHash` 跟上一次 `events.json` 裡
   同一個 `id` 的 `contentHash` 比對：
   - id 在舊資料裡找不到 → 新活動 → 呼叫 Gemini
   - id 找得到但 `contentHash` 不同 → 內容有變動 → 呼叫 Gemini
   - id 找得到且 `contentHash` 相同 → 沿用舊的 `ai` 欄位，不呼叫 Gemini

實作在 `scripts/ai/enrich.py`，pipeline 執行完會印出「沿用舊摘要 N 筆 / 呼叫 Gemini
N 筆」的統計，方便你確認快取機制真的有生效、Gemini 呼叫量真的有被壓低。

---

## 9. 免費方案配額限制（實測後新增）

第一次接上 2500+ 筆真實活動後才發現：Gemini **免費方案**的配額比想像中低很多——
實測 `gemini-3.6-flash` / `gemini-3.5-flash` 每分鐘只能打 5 次、每天大概只有 20 次，
`gemini-3.1-flash-lite` 稍微寬鬆（RPM 15）。第一次批次處理幾千筆新活動，遠遠超過
一天的配額，硬幹只會瞬間把配額打爆、卡在無限重試。因此加了三層因應機制：

### 9.1 `aiSource` 欄位：分辨「這份摘要是不是真的 AI 產出」

```ts
aiSource: "gemini" | "fallback" | "pending"
```

`contentHash` 快取（見第 8 節）原本只比對「內容有沒有變」，但沒考慮到「上次到底有
沒有真的成功呼叫過 Gemini」。如果一筆活動因為配額用完而退回規則式簡易摘要，
它的 `contentHash` 不會變（活動內容本身沒變），純比對 hash 會誤判成「已經處理過」，
永遠不會被排進 Gemini 佇列。加上 `aiSource` 之後，快取只在「hash 相同**且**
`aiSource === "gemini"`」才會沿用，`fallback`／`pending` 一律視為還沒處理完，
下次執行會自動重試。

### 9.2 每個模型各自照 RPM 排隊

`scripts/ai/gemini_client.py` 會記錄每個模型上一次被呼叫的時間，呼叫前自動等待
足夠的間隔，不會再瞬間打爆配額。RPM 數字寫在 `MODEL_RPM` 這個 dict 裡，如果你之後
升級付費方案、額度變高，調整這幾個數字即可。

### 9.3 偵測「當日配額用完」就整個跳過該模型

免費方案的每日配額用完後，繼續重試只會一直收到一樣的 429 錯誤，浪費時間。
`gemini_client.py` 會偵測錯誤訊息裡的 `"PerDay"` 字樣，一旦確認某個模型今天配額
用完，這次執行接下來的每一筆活動都會直接跳過那個模型，不會浪費時間逐一重打。

### 9.4 每次執行限制呼叫次數，優先處理最快開始的活動

`scripts/ai/enrich.py` 的 `max_ai_calls`（預設 150，可用 `pipeline.py` 的
`--max-ai-calls` 覆蓋）限制「這次執行最多真的呼叫幾次 Gemini」，超過預算的活動
維持規則式簡易摘要，`aiSource` 標成 `"fallback"`，下次排程執行時因為第 9.1 節的
規則會自動被重新嘗試。`pipeline.py` 會先把待處理活動依開始時間排序，確保配額優先
用在「快要開始」的活動上——半年後才開始的活動，AI 摘要晚幾天才出現也沒關係，
但明天就要開始的活動不該因為排在佇列後面而漏掉。

### 9.5 這對你代表什麼

**在免費方案上，第一次把 2500+ 筆活動全部補上真正的 AI 摘要，會需要好幾天，
不是一次執行就能做完**——每天的排程執行會處理 `max_ai_calls` 筆（預設 150），
配合每天一次的排程，大概 2-3 週左右會全部補齊（實際速度取決於你當天的配額
還剩多少）。這段期間網站不會空白：還沒輪到的活動會先用規則式簡易摘要顯示
（`aiSource: "fallback"`），基本資訊都在，只是還沒有真正的 AI 整理內容。
如果你想要更快補齊，兩個選項：升級成付費方案（配額大幅提高），或者暫時調高
`--max-ai-calls`（在配額允許的範圍內盡量榨乾，但一樣會受 RPM/RPD 限制，調太高
沒有實質幫助，只是每天多打一點）。
