# 03 - AI Contracts（定案版，第三階段）

## 1. 設計決策異動：從「兩步呼叫」改成「一次呼叫」

`01-ARCHITECTURE.md` 第 6.2 節原本描述的是「先判斷 intent，再依 intent 補上輸出格式」，
聽起來像兩次 Gemini 呼叫。實作時改成**一次呼叫**：`responseSchema` 本身就把 `intent`
跟四種結果欄位（皆為 optional）都定義進去，Gemini 在同一次回應裡自己決定要填哪個
intent、哪個結果欄位。理由：

- 少一次網路來回，延遲砍半
- 少一次 API 呼叫，成本砍半（這對「Lite / 自己用」的專案特別重要）
- 沒有實質壞處：JSON Schema 的 `anyOf`/optional 欄位機制完全撐得住這種「依情況只填一部分
  欄位」的需求

這是本文件跟舊版架構文件唯一的實質差異，其餘設計不變。

---

## 2. Request

```ts
interface AiRequest {
  message: string;               // 使用者輸入，例如「今天晚上想約會」
  now: string;                   // ISO timestamp，前端當下時間（讓 Gemini 知道「今天」是哪天）
  userLocation?: { lat: number; lon: number };
  favoriteEventIds?: string[];   // 來自前端 localStorage
  candidateEvents: CandidateEvent[]; // 見第 3 節
  focusEventId?: string;         // 只有 intent=ask 時會用到（"這場活動有冷氣嗎"）
}
```

## 3. CandidateEvents：為什麼要前端先篩、後端還要再篩一次

架構文件裡說「前端先用一般邏輯粗篩，只把篩過的候選清單放進 request」。這是對的，
但 `/api/ai` 內部**還會再做一層防呆**：即使前端傳來的清單過大，Route 也會依
`now` 排序後只取前 60 筆送進 Gemini（可調整），避免：
- 前端邏輯有 bug 送出全部活動時，一次呼叫花費暴增
- prompt 過長拖慢回應速度

`CandidateEvent` 是 `NormalizedEvent` 的精簡版，只帶 Gemini 判斷需要的欄位，不需要
整包 `ai.bullets` 這種本來就是 AI 產出的欄位（避免遞迴地把 AI 產出的內容又餵回 AI）：

```ts
interface CandidateEvent {
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
  suitableFor: string[];       // 沿用批次 AI enrich 產生的結果，可以直接用
  estimatedStayMinutes: number;
  hasAircon: boolean | null;
}
```

## 4. Response

```ts
type AiIntent = "search" | "plan" | "recommend" | "ask" | "restaurant";

interface AiResponse {
  intent: AiIntent;
  replyText: string;   // 一律會有，可直接顯示給使用者的自然語言回覆

  // 依 intent 只會有其中一個非 null：
  search: {
    matchedEventIds: string[];
    filters: { city?: string; region?: Region; category?: Category; freeOnly?: boolean };
  } | null;

  plan: {
    timeline: Array<{ time: string; title: string; eventId: string | null; note: string }>;
  } | null;

  recommend: {
    picks: Array<{ eventId: string; reasons: string[] }>;
  } | null;

  ask: {
    answer: string;
  } | null;

  restaurant: {
    picks: Array<{ name: string; cuisine: string; priceRange: string; areaHint: string; reason: string }>;
    disclaimer: string; // 一定要填，提醒使用者這是 AI 一般知識整理，不是即時營業資訊
  } | null;
}
```

**restaurant 是唯一不受「只能從候選活動清單挑」限制的意圖**（2026/07 新增）。找餐廳
跟找活動是兩件事——候選清單裡放的是活動，不是餐廳，逼著 Gemini 只能從活動清單裡
「找餐廳」沒有意義。這個意圖改用 Gemini 自己對台灣餐廳的一般知識回答，所以：
- `disclaimer` 欄位強制要求填寫，明確告知使用者這不是即時驗證過的營業資訊
- 沒有候選清單可以grounding，代表比其他意圖更容易產生不準確的資訊（餐廳可能已歇業、
  地址記錯等），這是刻意接受的取捨——「有 AI 輔助但需要自行確認」好過「完全没有這個
  功能」，但使用者體驗上必須誠實揭露這個限制，不能包裝成即時資料

## 5. Gemini responseSchema（實際送進 API 的 JSON Schema）

實作在 `apps/web/lib/ai-schema.ts`，結構對應上面的 `AiResponse`，四個結果欄位都設成
`nullable`，並在 prompt 裡明講「只填 intent 對應的那一個欄位，其餘設為 null」。

## 6. 三層 fallback 的行為定義

```
呼叫 gemini-3.6-flash
  成功 → 回傳結果
  失敗（逾時 / 5xx / 額度超過）→ 呼叫 gemini-3.5-flash
    成功 → 回傳結果，並在 server log 記錄「已降級」
    失敗 → 呼叫 gemini-3.1-flash-lite
      成功 → 回傳結果，並在 server log 記錄「已降級兩層」
      失敗 → Route 回傳 HTTP 503，前端顯示「AI 暫時無法使用，稍後再試」
```

**不做的事**：不會在三層都失敗時退回「規則式假 AI」（跟上一版 taiwan-events-pwa 的
demo 邏輯不同）。這裡是真的 AI 產品，失敗就明確告訴使用者失敗，不偷偷用關鍵字規則
冒充 AI 結果。

## 7. Prompt 模板（骨架）

實際模板在 `apps/web/lib/ai-prompt.ts`，結構大致如下：

```
System instruction:
  你是「Event Radar AI」的活動助理，只根據使用者提供的候選活動清單回答，
  不要編造清單以外的活動。現在時間是 {now}。使用者位置：{userLocation}。
  先判斷使用者訊息屬於 search／plan／recommend／ask 哪一種，只填該類型對應欄位。

User message:
  {message}

候選活動清單（JSON）：
  {candidateEvents}

使用者收藏（eventId 清單）：
  {favoriteEventIds}
```

---

## 8. 錯誤處理總覽

| 情況 | HTTP 狀態 | 回應 |
|---|---|---|
| `message` 為空字串 | 400 | `{ error: "message is required" }` |
| `candidateEvents` 為空陣列 | 200 | 正常呼叫 Gemini，讓它在 `replyText` 裡說明目前沒有候選活動 |
| 三層 Gemini 皆失敗 | 503 | `{ error: "AI service unavailable" }` |
| Gemini 回傳非法 JSON（理論上 responseSchema 會避免，但保留防呆） | 502 | `{ error: "AI response parse error" }` |
