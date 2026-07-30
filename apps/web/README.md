# apps/web

Next.js 15 App Router 前端。詳見根目錄 `docs/01-ARCHITECTURE.md`。

## 目前狀態（第六階段：UI 優化 + 天氣播報 + Google 日曆）

- **收藏**：每張活動卡片與詳情頁的愛心按鈕，存 `localStorage`，`/favorites` 頁面可看
  全部收藏與已參加紀錄
- **Google 日曆連結**（`lib/calendar.ts` 的 `googleCalendarUrl()`）：活動詳情頁的
  「📅 Google 日曆」按鈕，開啟 Google 日曆網頁版的「新增活動」畫面並預先填好資訊。
  **刻意不做 OAuth 登入串接**（那需要 Google Cloud 專案/用戶端密鑰/登入流程，
  跟「不做登入、盡量簡單」的原則衝突），所以是「使用者按一下確認」而不是全自動寫入，
  這是有意的取捨。原本的 .ics 下載（給 Apple 日曆/Outlook）也還在，兩個按鈕並排。
- 新增 **天氣播報**（`components/ui/WeatherBroadcast.tsx` + `lib/weather.ts` 的
  `getWeatherAdvisory()`）：規則式判讀，不呼叫 Gemini（閾值判斷用不到語言模型）。
  炎熱 ≥34°C 體感、降雨機率 ≥60%、風速 ≥30km/h、體感 ≤15°C、降雨機率 ≥30% 五種情境，
  首頁在天氣播報卡片顯示，`/search` 頁面呼叫 AI 推薦/規劃時也會把天氣資訊一起送給
  Gemini（見 `lib/ai-prompt.ts`），符合「AI 推薦要考慮天氣」的原始需求
- 字體：改用 `next/font/google` 載入 Noto Sans TC（中文內文）+ JetBrains Mono
  （時間/溫度/倒數這類數字），比系統預設字體更有一致的視覺調性
- Tailwind 加了語意化 design token（`app`/`surface`/`surface-hi`/`accent`），
  取代原本到處寫死的 `neutral-900` 這類色階，之後要調整整體色調只要改
  `tailwind.config.ts` 一個地方
- 補上 iPhone safe-area 處理：底部導覽列跟頁面內容都會避開 home indicator 佔用的區域
- 卡片/按鈕加上輕微的按壓回饋（`active:scale-*`），操作起來更有「App 感」而不是網頁感

**這輪已經把其餘頁面也套上同一套視覺語言**：行事曆、地圖、收藏、AI 搜尋頁全部換成
`app`/`surface`/`accent` token，並統一加上：
- 載入骨架（`components/ui/Skeleton.tsx`）取代原本單純的「載入中…」文字
- 明確的錯誤訊息區塊（events.json 讀取失敗時會顯示具體錯誤，不是整頁空白）
- 按壓回饋（`active:scale-*`）套用到所有可點擊的按鈕/卡片/月曆格子
- 統一的空狀態文案（例如收藏頁還沒收藏任何活動時的提示）

第六階段（UI 優化）到此視為完成。

## 目前狀態（個人化設定 + 白色主題）

- **視覺主題改成白色底**：`tailwind.config.ts` 的 `app`/`surface`/`surface-hi`/`accent`
  幾個 token 從深色值換成白色系（accent 用 amber-600），套用這幾個 token 的元件不用
  改 class 名稱。所有頁面跟元件都已經套用過一輪，細節顏色（錯誤訊息、天氣播報卡片、
  分類標籤等）也一併從深色配色換成淺色配色，不是只換背景色。
- **個人化預設值在 `lib/config.ts`**：預設位置（新北市林口區）、預設感興趣分類
  （煙火/展覽/演唱會/市集）、首頁排除的分類（講座/課程）、首頁最大顯示距離（30km）。
  這是給你自己用的設定值，不是給不特定使用者用的偏好設定頁面，改這個檔案就好，
  不用另外做 UI。
- **天氣播報加了「今天稍後何時可能降雨」**：`lib/weather.ts` 多拿了 Open-Meteo 的
  逐小時降雨機率預報，不是只看「現在」的天氣。
- **AI 搜尋/規劃現在會考慮距離跟活動是不是長期展覽**：`CandidateEvent` 多了
  `distanceKm`（前端先算好，不用 Gemini 自己猜）跟 `isMultiDay`，prompt 也明確要求
  優先推薦近的、非長期展覽的活動，除非使用者指定地區或找不到更好的選項。

## 本機開發

```bash
npm install
cp .env.local.example .env.local   # 填入你的 GEMINI_API_KEY
npm run dev
```

首頁預設讀 `public/events.json`，目前是空殼（`{"events": []}`）。要看到真實資料，
先在 repo 根目錄跑一次 pipeline（見根目錄 README「快速開始」），或者手動把測試資料
貼進 `public/events.json` 驗證頁面渲染。

## 手動測試 /api/ai

```bash
curl -X POST http://localhost:3000/api/ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": "今天晚上想約會",
    "now": "2026-07-29T18:00:00+08:00",
    "candidateEvents": [
      {
        "id": "demo-1",
        "title": "大稻埕河岸煙火之夜",
        "city": "台北市",
        "region": "北部",
        "category": "fireworks",
        "start": "2026-07-29T20:00:00+08:00",
        "end": "2026-07-29T20:30:00+08:00",
        "isFree": true,
        "lat": 25.0554,
        "lon": 121.5095,
        "suitableFor": ["約會", "戶外"],
        "estimatedStayMinutes": 60,
        "hasAircon": false
      }
    ]
  }'
```

## 已知限制 / 下一步（第六階段 UI 優化會處理）

- 視覺是功能優先的陽春 Tailwind 樣式，色彩/字體/圓角系統還沒有統一規劃
- 沒有 loading skeleton，只有簡單的文字「載入中…」
- 沒有做錯誤重試 UI，events.json 讀取失敗只顯示錯誤訊息
- Leaflet 地圖沒有做叢集（cluster），活動一多會有大量重疊標記
