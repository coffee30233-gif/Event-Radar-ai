# Event Radar AI（全台活動雷達）— 架構設計（Lite 版，v3：全台灣範圍）

狀態：**架構已定案（Lite 版），第二階段資料夾結構已建立，範圍已擴大為全台灣**。

> 這份文件取代原本的完整版設計。差異只在「拿掉不需要的複雜度」，資料流、Collector
> 介面、NormalizedEvent schema 這些核心設計沒有變，因為它們本來就不貴，值得保留。

## v3 異動摘要（這次調整）

1. **「不用本地端就可進行」→ 這件事其實在 v2 就已經滿足了**：GitHub Actions 是
   GitHub 提供的雲端執行環境，排程觸發時是在 GitHub 的伺服器上跑 `pipeline.py`，
   跟你自己的電腦有沒有開機、有沒有連網完全無關。你不需要另外做任何事，這點在
   第 10 節有更明確的說明。
2. **地理範圍從「北北桃竹」擴大為「全台灣」**：這其實讓架構**變簡單**，不是變複雜——
   主要資料來源「文化部全國藝文活動」本來就是全國資料，之前是我們自己加了一層
   「只保留北北桃竹」的篩選；拿掉這層篩選之後，反而少了一段邏輯要維護。詳見第 1、
   4、9 節的異動。

---

## 0. 這次的簡化決定（對照你的 9 點回覆，v2 版）

| # | 你的要求 | 對應調整 |
|---|---|---|
| 1 | 不用 Supabase / Vercel KV / 其他資料庫 | 全部拿掉，`events.json` 是唯一的資料儲存 |
| 2 | 不做登入/會員/評論/排行榜 | 原本就沒規劃，維持不做 |
| 3 | 不做 Web Push | 拿掉 `/api/push/*`、拿掉 Service Worker 的 push handler，Service Worker 只保留離線快取 |
| 4 | 收藏/偏好存 localStorage | 維持，且因為拿掉資料庫，**沒有任何伺服器端使用者狀態** |
| 5 | Python Collector 每天更新 events.json | 維持，pipeline 設計不變 |
| 6 | Gemini 3.6 Flash 主要／3.5 Flash 次要／3.1 Flash-Lite 備援 | 見第 6 節，三層 fallback 鏈 |
| 7 | AI 功能集中一支 `/api/ai` | 拆掉原本 4 支 route，改成單一 route + intent 判斷 prompt |
| 8 | 保留 PWA，Safari 加入主畫面 | 維持，但拿掉 Background Sync／Push 相關描述，只留基本安裝＋離線快取 |
| 9 | 容易維護、容易新增 Collector | Collector 抽象介面維持不變（這是新增來源時最重要的擴充點） |

拿掉資料庫後，整個系統變成「**靜態資料 + 一支會呼叫 AI 的 API Route**」，沒有任何需要
你自己維護的伺服器狀態，符合「自己用、盡量簡單」的目標。

---

## 1. 專案定位（v3：全台灣）

| 項目 | 決定 |
|---|---|
| 產品名稱 | Event Radar AI（全台活動雷達） |
| 範圍 | **全台灣 22 縣市**（實際涵蓋率取決於資料源，見第 9 節） |
| 使用對象 | 你自己，不對外開放、不上架 App Store |
| 前端框架 | Next.js 15（App Router）＋ TypeScript ＋ TailwindCSS |
| 部署 | Vercel（前端 + 唯一的 `/api/ai` Route） |
| 資料儲存 | **只有 `public/events.json`，沒有資料庫** |
| AI Provider | Gemini，三層 fallback（見第 6 節），金鑰只存在伺服器端環境變數 |
| 資料蒐集 | Python Collector，**GitHub Actions 雲端排程**，全程不需要本地端開機（見第 10 節） |
| 使用者資料 | 不需登入，全部存 `localStorage` |
| 通知 | 不做 |
| PWA | Safari「加入主畫面」可安裝、離線可看上次抓到的活動 |

---

## 2. 整體資料流（最重要的一張圖）

```
┌──────────────────────────────────────────────────────────────┐
│                     COLLECTORS（各自獨立）                      │
│  culture（全國，主力來源）  taipei  newtaipei  taoyuan  hsinchu  │
│  taichung  tainan  kaohsiung  ticket  shopping  festival       │
│  每個 collector 只做一件事：把「自己那個來源」的原始資料          │
│  轉成同一份 RawEvent 介面，互不依賴彼此                          │
└───────────────────────────┬──────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  NORMALIZE   統一欄位、統一分類、統一日期格式、地址轉經緯度        │
└───────────────────────────┬──────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  MERGE       把多個來源的 NormalizedEvent 合併成一份清單          │
└───────────────────────────┬──────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  DEDUPLICATE 用「標題相似度 + 日期 + 地點距離」找出重複活動並合併  │
└───────────────────────────┬──────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  AI ENRICH   呼叫 Gemini：三個重點／推薦理由／適合族群／          │
│              預估停留時間／分類校正                              │
└───────────────────────────┬──────────────────────────────────┘
                             ▼
              events.json（唯一的資料儲存，寫在 apps/web/public/events.json）
                             │
                             ▼
              Next.js 前端讀取 → 首頁 / 地圖 / 行事曆 / 搜尋
                             │
                             ▼（使用者輸入自然語言時才會用到）
                    /api/ai（單一 Route，判斷 intent 後呼叫 Gemini）
```

**關鍵原則**：Collector 只認識「自己的來源」，Normalize 只認識「RawEvent → NormalizedEvent
的轉換規則」，Merge/Dedup/AI 完全不管資料是哪裡來的。這樣未來加一個新來源，只要新增一個
collector 檔案，不用動其他任何程式碼。

---

## 3. Monorepo 資料夾結構（第二階段會照這個建立）

```
event-radar-ai/
├── apps/
│   └── web/                          # Next.js 15 App Router 專案
│       ├── app/
│       │   ├── page.tsx               # 首頁
│       │   ├── map/page.tsx
│       │   ├── calendar/page.tsx
│       │   ├── search/page.tsx
│       │   ├── favorites/page.tsx
│       │   ├── api/
│       │   │   └── ai/route.ts        # 唯一的 AI 端點，見第 6 節
│       │   ├── manifest.ts
│       │   └── layout.tsx
│       ├── components/
│       │   ├── ui/                    # 按鈕、卡片、底部導覽等原子元件
│       │   ├── event/                 # EventCard, EventDetailSheet…
│       │   ├── map/
│       │   └── search/
│       ├── lib/
│       │   ├── gemini.ts              # Gemini client + 三層 fallback（server-only）
│       │   ├── geo.ts                 # Haversine、GPS 相關
│       │   └── storage.ts             # localStorage 存取封裝（收藏/偏好）
│       ├── public/
│       │   ├── icons/
│       │   ├── events.json            # Collector pipeline 產生，前端直接 fetch 這個靜態檔
│       │   └── sw.js                  # Service Worker（只做離線快取，不含 push）
│       ├── types/
│       │   └── event.ts               # 前端共用的 Event 型別
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       └── .env.local.example
│
├── scripts/                           # Python 資料蒐集管線（獨立於 Next.js）
│   ├── collectors/
│   │   ├── base.py                    # Collector 抽象介面
│   │   ├── culture.py                 # 文化部全國藝文活動（主力來源，已驗證可用，全國適用）
│   │   ├── taipei.py                  # data.taipei（縣市加強來源，選用）
│   │   ├── newtaipei.py               # data.ntpc.gov.tw（選用）
│   │   ├── taoyuan.py                 # data.tycg.gov.tw（選用）
│   │   ├── hsinchu.py                 # 新竹市/縣開放資料（選用）
│   │   ├── taichung.py                # 台中市開放資料（選用，待查證）
│   │   ├── tainan.py                  # 台南市開放資料（選用，待查證）
│   │   ├── kaohsiung.py               # 高雄市開放資料（選用，待查證）
│   │   ├── ticket.py                  # 待確認來源，先建骨架
│   │   ├── shopping.py                # 待確認來源，先建骨架
│   │   └── festival.py                # 待確認來源，先建骨架
│   ├── normalize/
│   │   ├── schema.py                  # NormalizedEvent dataclass
│   │   ├── category_rules.py          # 分類關鍵字對應表（20 種分類）
│   │   └── geocode.py                 # 地址 → 經緯度（沒有經緯度的來源用）
│   ├── merge/
│   │   └── merge.py                   # 合併多來源清單
│   ├── dedupe/
│   │   └── dedupe.py                  # 標題相似度 + 日期 + 距離 去重
│   ├── ai/
│   │   └── enrich.py                  # 產生三重點/推薦理由/適合族群/停留時間（呼叫 Gemini）
│   ├── pipeline.py                    # 主流程：collectors → normalize → merge → dedupe → ai → 輸出
│   └── requirements.txt
│
├── .github/
│   └── workflows/
│       └── update-events.yml          # 06:00 / 12:00 / 18:00 台灣時間排程，直接 commit events.json
│
├── docs/
│   ├── 01-ARCHITECTURE.md             # 就是這份文件
│   ├── 02-DATA-SCHEMA.md              # 第三階段前會補上
│   └── 03-AI-CONTRACTS.md             # /api/ai 的 intent 判斷與 prompt 規格
│
└── README.md
```

---

## 4. 資料模型（先定介面，第三階段照這個實作）

### 4.1 RawEvent（Collector 輸出，各來源長相不同，這只是「最低共同格式」）

```ts
interface RawEvent {
  sourceId: string;        // 例如 "culture", "taipei"
  sourceRefId: string;     // 該來源的原始 ID，用來追蹤/除錯
  rawTitle: string;
  rawAddress?: string;
  rawStart: string;        // 原始字串，不保證格式一致，交給 normalize 處理
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

### 4.2 NormalizedEvent（進入 merge/dedupe/AI 之後的標準格式，也是前端最終拿到的格式）

```ts
type Category =
  | "fireworks" | "firedance" | "concert" | "musicfest" | "exhibition"
  | "creative" | "market" | "nightmarket" | "anime" | "game" | "talk"
  | "festival" | "lantern" | "family" | "pet" | "run" | "outdoor"
  | "food" | "popup" | "mall";  // 20 種分類，對應你列的收錄清單

interface NormalizedEvent {
  id: string;               // 去重後的穩定 ID（多來源合併時保留其一）
  title: string;
  city: string;              // 全台 22 縣市標準名稱之一，見 CITY_LIST（第 9 節）
  region: "北部" | "中部" | "南部" | "東部" | "離島"; // 依 city 自動歸類，方便前端分區篩選
  address: string;
  venue: string;
  lat: number | null;
  lon: number | null;
  category: Category;
  start: string;            // ISO 8601
  end: string;              // ISO 8601
  price: string;
  isFree: boolean;
  url: string;
  sources: string[];        // 去重後可能來自多個來源，全部列出
  popularityScore: number;  // 0-100，由來源熱度/點閱數/售票速度等訊號組成
  ai: {
    bullets: string[];        // 三個重點
    recommendReason: string;  // 一句推薦理由
    suitableFor: string[];    // 適合族群，例如 ["情侶","親子","朋友聚會"]
    estimatedStayMinutes: number;
    hasAircon: boolean | null; // 供 AI 問答「有冷氣嗎」使用，來源沒有就是 null
  };
  updatedAt: string;
}
```

`city` 從原本寫死的 5 選 1 union type 改成自由字串（比對到官方 22 縣市標準名稱之一），
`region` 是衍生欄位，由 normalize 階段依 `city` 自動算出，前端可以直接用 `region` 做
「北部/中部/南部/東部/離島」的分區篩選，不用自己維護縣市→分區的對照表。

這份 schema 會在第三階段整理成 `docs/02-DATA-SCHEMA.md`，並同步產出 Python 的
`pydantic` 版本與 TypeScript 的 `types/event.ts`，兩邊手動保持同步（monorepo 沒有共用型別
產生器，這是刻意的取捨，先求簡單）。

---

## 5. Collector 介面設計

每個 collector 必須實作同一個抽象基底，`pipeline.py` 才能用同一種方式呼叫所有來源：

```python
class BaseCollector(ABC):
    source_id: str

    @abstractmethod
    def fetch(self) -> list[dict]:
        """打對應來源的 API，回傳原始資料（未整理）"""

    @abstractmethod
    def to_raw_events(self, raw: list[dict]) -> list[RawEvent]:
        """把原始資料轉成 RawEvent 清單"""

    def run(self) -> list[RawEvent]:
        return self.to_raw_events(self.fetch())
```

`pipeline.py` 會用一個 `COLLECTOR_REGISTRY` 列表跑過所有 collector，單一 collector
失敗（來源掛掉、格式變動）只記錄警告、不讓整條 pipeline 中斷——這點很重要，因為你列了
8 個來源，任一個不穩都不該讓每天的自動更新整個失敗。

---

## 6. AI 層設計（單一 `/api/ai`，三層 Gemini fallback）

### 6.1 兩種呼叫時機（維持不變）

| 時機 | 誰呼叫 | 用途 |
|---|---|---|
| **離線批次**（pipeline 產生 events.json 時） | `scripts/ai/enrich.py` | 幫每筆活動產生三重點/推薦理由/適合族群/停留時間（成本可控、不即時） |
| **線上即時**（使用者互動時） | `apps/web/app/api/ai/route.ts` | 搜尋／推薦／問答／行程規劃，這些需要當下輸入，不能預先算好 |

### 6.2 單一 Route 的 intent 設計

不拆成 4 支 route，改成一支 `POST /api/ai`，由 prompt 自己判斷使用者想做什麼：

```
POST /api/ai
  body: {
    message: string,                     // 使用者輸入，例如「今天晚上想約會」「附近有什麼」
    context: {
      now: string,                       // ISO timestamp
      userLocation?: { lat: number, lon: number },
      favorites?: string[],              // eventId 清單，來自前端 localStorage
      candidateEvents: NormalizedEvent[] // 前端先用一般邏輯粗篩過的候選清單（見下）
    }
  }
  回傳: {
    intent: "search" | "plan" | "recommend" | "ask",
    // 依 intent 不同，下面欄位擇一出現：
    searchResult?: { filters: {...}, keyword?: string, matchedEventIds: string[], explanation: string },
    planResult?: { timeline: [{ time: string, title: string, eventId?: string, note: string }] },
    recommendResult?: { picks: [{ eventId: string, reasons: string[] }] },
    askResult?: { answer: string },
    replyText: string   // 一律附一句可以直接顯示給使用者的自然語言回覆
  }
```

**為什麼可以用一支 route 做四件事**：第一步先讓 Gemini 判斷 `intent`（這本身就是一次
分類任務，成本很低），Route 內部再用同一個 prompt 模板、依 intent 補上對應的輸出格式
要求（用 `responseSchema` 強制 JSON 結構）。這樣前端只需要呼叫一個端點、維護一份型別，
新增一種 intent 也只要改 prompt，不用開新檔案。

**候選清單粗篩**：跟原本設計一樣，不會把全部活動塞給 Gemini。前端先用一般 TypeScript
邏輯依日期/城市/收藏做初步篩選（例如「今天在北北桃竹的活動」通常就幾十筆），只把篩過的
`candidateEvents` 放進 request body，Gemini 只需要做語意理解與排序/摘要，不需要自己
搜尋全部資料。

### 6.3 三層 Gemini fallback（你指定的模型順序）

```ts
// apps/web/lib/gemini.ts（設計骨架，第五階段實作）
const MODEL_CHAIN = [
  "gemini-3.6-flash",       // 主要：能力最完整
  "gemini-3.5-flash",       // 次要：主要模型逾時/錯誤/超額時用
  "gemini-3.1-flash-lite",  // 備援：前兩層都失敗時的最後防線，成本最低
] as const;

async function callGeminiWithFallback(prompt, schema) {
  for (const model of MODEL_CHAIN) {
    try {
      return await callGemini(model, prompt, schema);
    } catch (err) {
      console.warn(`[gemini] ${model} 失敗，嘗試下一層`, err);
      continue;
    }
  }
  throw new Error("所有 Gemini 模型皆失敗");
}
```

備註：確認模型可用性時我查了一下，Google 目前的 3.x Flash 家族裡，`gemini-3.5-flash-lite`
是比 `gemini-3.1-flash-lite` 更新、更划算的備援選項（3.1 已經是舊一代）。你原本指定
3.1 Flash-Lite 我會照做，但如果你想要備援層也用最新的，之後只要把 `MODEL_CHAIN` 最後一項
換成 `"gemini-3.5-flash-lite"` 即可，這是一行設定，不影響架構。

**關鍵規則（不變）**：
- `/api/ai` 在 Vercel Serverless Function 裡執行，`GEMINI_API_KEY` 只存在 Vercel 環境變數
  （對應本機 `.env.local`），前端永遠只呼叫「自己的 `/api/ai`」，不直接打 Gemini API。
- 所有 Gemini 呼叫都要求回傳結構化 JSON（`responseMimeType: "application/json"` +
  schema 約束），前端才能穩定渲染。

### 6.4 離線批次 AI enrich 的快取機制（v4，已實作）

`scripts/ai/enrich.py` 只對「新活動」或「內容有變動的活動」呼叫 Gemini，已存在且沒變的
活動直接沿用 `events.json` 裡舊的 `ai` 欄位。完整規則見 `docs/02-DATA-SCHEMA.md` 第 8
節，這裡只講設計理由：一天一次的排程長期跑下來，大部分活動會是「昨天抓過、今天還在、
內容沒變」，只有真正的新活動或官方更新過內容的活動才需要重新呼叫 Gemini，Gemini 呼叫量
會遠低於「每天全部重新摘要一次」。`scripts/pipeline.py` 執行完會印出這次「沿用舊摘要
N 筆 / 呼叫 Gemini N 筆」的統計，方便你確認快取真的有生效。

---

## 7. 儲存層：確認不需要

上一版我建議加 Vercel KV 是為了撐 Web Push 訂閱清單。既然你確認不做 Push 通知，也不需要
即時查詢附近熱門活動的動態服務，那這層就整個拿掉：

- `events.json` 是唯一的資料儲存，每天由 GitHub Actions 更新、直接 commit 回 repo
- 「附近活動」改成前端拿到 `events.json` 後，用瀏覽器端的 GPS 定位 + Haversine 距離計算
  即時篩選，不需要伺服器幫忙算
- 收藏／偏好／已參加：`localStorage`，沒有任何伺服器端使用者狀態

整個專案因此完全沒有資料庫、沒有 ORM、沒有 migration，這是這次簡化裡影響最大的一項。

---

## 8. PWA / 前端架構重點（Lite）

- **Service Worker**（`public/sw.js`，手寫即可，不需要 `next-pwa` 那麼多功能）：
  app shell 快取 + `events.json` network-first，**不含** push handler
- **Offline**：離線時至少能看「上次抓到的活動清單」，靠 Service Worker 快取即可，不需要
  額外的 IndexedDB 層
- **不做 Background Sync**：拿掉之後就不用處理 iOS Safari 支援落差的問題，離線恢復後
  使用者重新整理頁面即可拿到最新資料
- **安裝體驗**：`manifest.ts` 設定好 icons/theme_color/display:standalone，Safari
  分享選單「加入主畫面」即可用，不需要額外引導流程（畢竟只有你自己用）
- **視覺方向**：Apple/Material 3 那種「有呼吸感、大量留白、卡片有層次」的方向，具體
  design token 留到**第七階段 UI 優化**再定案，現在先不做視覺決策

---

## 9. 資料來源涵蓋範圍（v3：全台灣）

**核心決定**：主力來源改成「不篩選地區」，`culture.py` 直接收下文化部全國藝文活動資料
裡的**所有**縣市，不再只留北北桃竹。這比 v2 的架構還單純——v2 需要一段「地址關鍵字比對
四個城市」的篩選邏輯，v3 不需要，只需要把地址對應到 22 縣市其中之一（用來算 `city` 跟
`region` 欄位），不需要篩掉任何東西。

- `culture/`（文化部全國藝文活動）：**已驗證可用，天生就是全國資料**，不需要額外查證
- `taipei/` `newtaipei/` `taoyuan/` `hsinchu/` `taichung/` `tainan/` `kaohsiung/`：
  各縣市自己的開放資料平台，屬於**加強/補充來源**，不是必要的——`culture` 這個來源
  已經能撐起「全台灣都有基本涵蓋率」，這幾個縣市 collector 的意義是「原本涵蓋率不夠時
  拿來補洞」，優先序低於 `culture`
- `ticket/`（售票平台）：多數平台沒有公開開放資料 API，直接爬蟲違反服務條款，先跳過
- `shopping/`（大型商場活動）：通常沒有結構化開放資料，先跳過
- `festival/`（節慶/燈會）：文化部資料裡已經包含節慶類活動，不一定需要獨立來源

**實作優先序建議**：第四階段先把 `culture.py` 做完整、做穩（這一支就能讓全台灣都有資料），
其餘縣市 collector 先建骨架＋TODO，之後你覺得某個縣市資料涵蓋率不夠時，再挑那個縣市去
查證、實作，不需要一次把 7 個縣市 collector 都做完。

### CITY_LIST（22 縣市標準名稱，`normalize` 階段比對地址用）

```
北部：台北市 新北市 桃園市 新竹市 新竹縣 基隆市 宜蘭縣
中部：台中市 苗栗縣 彰化縣 南投縣 雲林縣
南部：台南市 高雄市 嘉義市 嘉義縣 屏東縣
東部：花蓮縣 台東縣
離島：澎湖縣 金門縣 連江縣
```

---

## 10. 排程設計（v4：改成每天一次 + 確認不需要本地端）

```yaml
# .github/workflows/update-events.yml（已實作，見第四階段）
on:
  schedule:
    - cron: '0 22 * * *'   # UTC 22:00 = 台灣 06:00
  workflow_dispatch: {}
```

從原本一天三次改成**一天一次**（早上 06:00）。理由：活動資訊不像新聞那樣分秒必爭，
一天一次的更新頻率已經足夠，而且搭配第 6.4 節的 AI 摘要快取機制後，一天一次也代表
「每天只需要判斷一次哪些活動是新的／有變動的」，跟 Gemini 呼叫量的控制邏輯更直觀。

`schedule` 觸發的 workflow 是由 GitHub 自己的伺服器在排定時間執行，不是「你的電腦上有
個程式在背景等時間到」。你的筆電關機、你人在睡覺，一樣會準時跑。你唯一要做的事是把
這個 repo push 到 GitHub 一次，之後排程就會一直自動跑。`workflow_dispatch: {}` 則是
讓你想手動立即跑一次時，可以在 GitHub 網頁上按一個按鈕觸發。

流程：checkout → 裝 Python 依賴 → 跑 `python3 -m scripts.pipeline`（內部依序呼叫所有
collector → normalize → merge → dedupe → AI enrich，AI enrich 內建快取，只對新/變動
活動呼叫 Gemini）→ 把結果寫到 `apps/web/public/events.json` → commit + push 回 repo
（沒有變動就不 commit，避免洗 git 歷史）。Vercel 偵測到 repo 更新會自動重新部署。

唯一需要本地端的時刻，是你自己想開發/除錯的時候，這跟「日常自動更新」是兩件事，
日常更新完全在雲端跑。

---

## 11. 狀態（v3）

架構已依全台灣範圍調整完成。第二階段（資料夾結構）需要補幾個新的 collector 骨架
（`taichung.py` `tainan.py` `kaohsiung.py`）與更新既有檔案（`culture.py` 拿掉地區篩選
註解、`types/event.ts` 的 `city` 型別放寬），這些我會在下一則回覆裡直接更新到已建立好
的資料夾裡，不影響其他已完成的部分。

確認這份 v3 架構沒問題的話，就進入**第三階段：建立所有 API**（定案 `NormalizedEvent`
完整型別、把 `/api/ai` 的 request/response 實際寫出來）。
