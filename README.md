# Event Radar AI（全台活動雷達）

自己用的**全台灣**活動探索 PWA。Lite 版架構：沒有資料庫、沒有登入、沒有 Push 通知，
只有「靜態 events.json + 一支會呼叫 AI 的 API Route」。每天更新完全靠 GitHub Actions
雲端排程，不需要本地端開機。

- 架構設計：見 `docs/01-ARCHITECTURE.md`
- 目前狀態：第二階段（資料夾結構）已建立，檔案內容多數是 TODO 骨架，
  尚未進入第三階段（實作 API/型別）

## 開發階段
1. ~~架構設計~~ ✅
2. ~~建立資料夾~~ ✅
3. ~~建立 API 與資料型別~~ ✅（`/api/ai` 已完整實作，見 `apps/web/README.md`）
4. ~~建立 Collectors~~ ✅（`culture` 已完整實作並跑過離線邏輯測試；其餘 9 個
   collector 仍是骨架，等你想擴充涵蓋率時再逐一查證實作）
5. ~~建立前端頁面~~ ✅（首頁/行事曆/地圖/AI 搜尋/收藏 五個頁面都能動，見
   `apps/web/README.md`）
6. ~~UI 優化~~ ✅（design token、字體、safe-area、載入骨架、錯誤訊息、按壓回饋
   全部頁面都套用完成；新增了**天氣播報**與**Google 日曆連結**，見
   `apps/web/README.md`）

## 目前整體狀態：功能面已完整，可以開始部署測試

七個開發階段全部做完，接下來是你說的「開始部署測試」。部署前建議先看過
`apps/web/README.md` 的「已知限制」，以及下面「部署前檢查清單」。

## events.json 是空的？先看這裡（2026/07 更新）

如果你照著上面步驟部署後，`events.json` 還是空的、GitHub Actions 也沒有產生資料，
依序檢查：

### 1. 我這邊有一個真的會讓 pipeline 整個崩潰的 bug，已修好

`scripts/ai/enrich.py` 原本只接住 `GeminiAllModelsFailedError` 這一種例外，但
`GEMINI_API_KEY` 沒設定時，`scripts/ai/gemini_client.py` 丟出的是**一般的
`RuntimeError`**，不會被接住——結果就是只要 secret 沒設定好，整條 pipeline 會在
AI enrich 階段直接崩潰，**連一份 events.json 都不會寫出來**（不是「寫出一份沒有 AI
摘要的 events.json」，而是整個腳本中斷、什麼都沒寫）。這很可能就是你這次
「GitHub Actions 尚未產生任何活動資料」的原因。

現在已經改成接住所有例外：只要 Gemini 呼叫失敗（不管是金鑰沒設、額度用完、網路
問題），都會改用規則式簡易摘要，不會讓整條 pipeline 中斷。

### 2. 先確認 GitHub Actions 有沒有真的跑過

去 repo 的 **Actions** 頁籤看 `Update events.json` 這個 workflow：
- 如果完全沒有執行紀錄：代表排程時間還沒到（每天台灣時間 06:00），去手動點
  **Run workflow** 觸發一次（對應 workflow 檔案裡的 `workflow_dispatch`），不用等到明天
- 如果有執行紀錄但失敗（紅色 ❌）：點進去看 log，特別留意「執行 pipeline」這個步驟
  印出的訊息，例如「篩選後剩下 X 筆」這行，可以看出是抓資料階段還是 AI 階段出問題
- 確認 repo 的 **Settings → Secrets and variables → Actions** 裡有設定
  `GEMINI_API_KEY`（就算前面的 bug 修好了，沒有真正的金鑰，AI 摘要還是只能用規則式
  備援版本，不是真的 AI 產出）

### 3. Collectors 目前確實只有 `culture` 是真的實作

`scripts/collectors/` 裡目前只有 `culture.py`（文化部全國藝文活動）是完整實作，
其餘 9 個（taipei/newtaipei/taoyuan/hsinchu/taichung/tainan/kaohsiung/ticket/
shopping/festival）都還是骨架，而且 `scripts/pipeline.py` 的 `COLLECTOR_REGISTRY`
只註冊了 `CultureCollector`，所以其他骨架不會被執行、也不會造成 pipeline 出錯。
`culture.py` 本身因為沒有對外網路的沙盒環境沒辦法實測過真實回傳資料，欄位對應是
根據官方文件描述寫的，如果 GitHub Actions 的 log 顯示「篩選後剩下 0 筆」，最可能
是 `culture.py` 裡的欄位假設（例如 `titile` 這個官方文件本身拼錯的欄位名）跟
實際回傳的 JSON 對不上，把 Actions log 裡的錯誤或原始資料筆數貼給我，我可以照實際
狀況調整。

### 4. 已經幫你準備好一份示範資料，可以先測試網站功能

在等 collector 資料真正跑通之前，`apps/web/public/events.json` 裡已經放了
**18 筆虛構的示範活動**（`scripts/generate_demo_events.py` 產生的），涵蓋 8 個
縣市、18 種分類，時間都是相對「現在」往後推算，讓首頁/地圖/行事曆/收藏/AI 搜尋
都有東西可以測試。這些活動的 `sources` 欄位是 `["demo"]`，一眼就能看出不是真實資料。

等你確認 GitHub Actions 真的能成功跑出真實資料後，直接重新執行：
```bash
python3 -m scripts.pipeline --out apps/web/public/events.json
```
就會覆蓋掉這份示範資料，不需要額外清理步驟。想要隨時重新產生新一批示範資料
（例如日期看起來太舊了），可以重跑：
```bash
python3 scripts/generate_demo_events.py --out apps/web/public/events.json
```



1. **本機先跑過一次**：`cd apps/web && npm install && npm run dev`，確認
   `npm run typecheck` 沒有錯誤（這邊的沙盒環境沒有網路，沒辦法先幫你跑這一步）
2. **申請 Gemini API 金鑰**：https://aistudio.google.com/ 申請，本機測試放
   `apps/web/.env.local`，正式部署要放在 Vercel 專案的環境變數
3. **先手動跑一次 pipeline**，確認 `events.json` 真的能產生：
   ```bash
   pip install -r scripts/requirements.txt
   export GEMINI_API_KEY=...
   python3 -m scripts.pipeline --out apps/web/public/events.json
   ```
4. **部署到 Vercel**：把 repo 推到 GitHub，Vercel 匯入這個 repo，Root Directory
   設成 `apps/web`，環境變數加 `GEMINI_API_KEY`
5. **設定 GitHub Actions secret**：repo 的 Settings → Secrets → Actions，
   新增 `GEMINI_API_KEY`，這樣每天的自動更新才能呼叫 Gemini
6. **iPhone 安裝測試**：部署後用 Safari 打開網址 → 分享 → 加入主畫面

## AI 摘要卡在瘋狂重試 429？先看這裡（2026/07 更新）

如果 workflow log 看到滿滿的 `429 RESOURCE_EXHAUSTED`、跑很久還沒結束，這是因為
**Gemini 免費方案的配額比想像中低很多**（實測 `gemini-3.6-flash`／`gemini-3.5-flash`
每分鐘只能打 5 次、每天大概 20 次），第一次批次處理幾千筆新活動遠遠超過這個配額。

已經修正：
- 每個模型照各自的 RPM 排隊呼叫，不會再瞬間打爆配額
- 偵測到「當日配額用完」會直接跳過該模型，不會浪費時間重試注定失敗的請求
- 每次執行限制最多真的呼叫 150 次 Gemini（`scripts/ai/enrich.py` 的
  `DEFAULT_MAX_AI_CALLS`，可用 `--max-ai-calls` 調整），優先處理最快開始的活動
- 修了一個快取邏輯的坑：原本配額用完退回的規則式簡易摘要，因為活動內容沒變、
  content hash 一樣，會被誤判成「已經處理過」永遠不會重試——現在會正確在下次
  執行時重新嘗試

**實際影響**：免費方案上，2500+ 筆活動要全部補上真正的 AI 摘要，大概需要 **2-3 週**
（每天排程跑一次、每次補 150 筆），不是一次執行就能做完。這段期間網站不會空白，
還沒輪到的活動會先顯示規則式簡易摘要，基本資訊都在，只是還沒有真正的 AI 整理內容。
細節見 `docs/02-DATA-SCHEMA.md` 第 9 節。

## 這輪修正（2026/07）

1. **天氣播報加了「何時可能降雨」**：不只看現在，會講「預計 18:00 後降雨機率較高」
   這種具體時間點。
2. **首頁不顯示課程/動漫**：`apps/web/lib/config.ts` 的 `HOME_EXCLUDED_CATEGORIES`。
3. **個人化預設值**：預設位置新北市林口區、預設興趣煙火/展覽/演唱會/市集，都在
   `apps/web/lib/config.ts`，改這個檔案就好。
4. **首頁不顯示太遠的活動**：預設 30km（`HOME_MAX_DISTANCE_KM`），可調整。
5. **首頁移除了「今天共有 X 場活動」那個統計區塊**，「今日推薦」也改成「週末推薦」。
6. **新增餐廳搜尋（AI 輔助）**：`/api/ai` 多了 `restaurant` 意圖，靠 Gemini 自己的
   知識推薦餐廳，**不是即時驗證過的營業資訊**，畫面上會明確標示這個限制。
7. **整個介面改成白色主題**。
8. **新增 `manual` collector**（`scripts/collectors/manual.py` +
   `scripts/collectors/manual_events.json`）：像「大稻埕夏日節煙火」這種台北市政府
   觀光傳播局主辦的城市行銷活動，不在文化部藝文活動資料裡，目前也沒有查證到一個
   有明確 API 文件、我能實際驗證可用的統一資料源可以自動抓——**與其硬猜一個可能是
   錯的 API endpoint，不如提供一份你可以手動維護的 JSON 清單**，已經先幫你把
   2026 大稻埕夏日節的 3 場煙火（7/25、8/5、8/15，皆為晚間 8 點於大稻埕碼頭）填進去了。
   想加林口在地你自己知道的活動，照 `scripts/collectors/manual.py` 開頭的格式說明，
   直接編輯 `manual_events.json` 加進去即可，不需要寫程式。

## 每天更新機制（已實作）

- GitHub Actions 排程改成**每天一次**（台灣時間 06:00），不是原本規劃的三次，
  完全在 GitHub 雲端執行，不需要本地端開機
- `scripts/pipeline.py`：collectors → normalize → merge → dedupe → AI enrich → 寫入
  `apps/web/public/events.json`
- **AI 摘要有快取**：只對「新活動」或「內容有變動的活動」呼叫 Gemini，已存在且沒變
  的活動直接沿用舊摘要。判斷方式是對每筆活動算 `contentHash`，兩次執行間 hash 沒變
  就不重新呼叫。細節見 `docs/02-DATA-SCHEMA.md` 第 7 節、`scripts/ai/enrich.py`
- 這個快取邏輯已經用假資料離線測試過（不需要網路也能驗證邏輯本身正確），見下方
  「開發備註」

## 快速開始
```bash
cd apps/web
npm install
cp .env.local.example .env.local   # 填入你的 GEMINI_API_KEY
npm run dev
```
`/api/ai` 現在就能實際呼叫測試（見 `apps/web/README.md` 的 curl 範例）。要產生真實的
`events.json`，在 repo 根目錄執行：
```bash
pip install -r scripts/requirements.txt
export GEMINI_API_KEY=...
python3 -m scripts.pipeline --out apps/web/public/events.json
```
首頁等頁面還是空的，要等第五階段（前端頁面）。

## 開發備註

`scripts/pipeline.py` 需要對外網路才能真的抓資料、呼叫 Gemini，沒辦法在完全離線的
環境裡跑到底，但 normalize／dedupe／AI 快取這幾個核心邏輯都已經用假資料＋
monkeypatch 掉 Gemini 呼叫的方式做過離線驗證，包含：新活動會呼叫 Gemini、資料沒變
時全部沿用舊摘要、只改動其中一筆時只有那一筆會重新呼叫。
