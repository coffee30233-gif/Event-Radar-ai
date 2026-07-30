"""手動維護的活動清單 collector。

背景：像「大稻埕夏日節煙火」這類活動，是由台北市政府觀光傳播局主辦的觀光行銷活動，
不是文化部「藝文活動」系統會收錄的類型（後者比較是展覽/表演/講座這類藝文場館活動）。
實測發現這類城市級觀光活動目前沒有一個統一、有明確 API 文件、我能實際驗證可用的
全國性開放資料源——data.taipei 這類縣市平台確實有 API，但每個資料集要各自對應到
一組 resource_id，沒有實際打過拿到真實回應之前，我不會把猜測的 resource_id 寫進
程式碼裡（那樣如果猜錯，會是一支看起來能動、實際上默默抓不到資料的 collector，
比明確的「還沒做」更危險）。

務實的解法：這支 collector 直接讀一份你自己維護的 JSON 檔案
（scripts/collectors/manual_events.json），把你知道的活動手動加進去就好——例如
大稻埕煙火這種每年固定會辦、你自己會關注的大型活動，或是林口在地你自己知道的活動。
這比等一個尚未驗證存在的 API 實際，你的判斷力在這裡比自動化更可靠。

manual_events.json 格式（陣列，每筆一個活動）：
    {
      "id": "唯一識別碼，同一場活動下次更新用同一個 id 才會被 dedupe/快取正確比對",
      "title": "活動名稱",
      "address": "完整地址（用來判斷縣市）",
      "venueName": "場地名稱（選填，沒有就跟 address 一樣）",
      "start": "ISO 8601 時間，例如 2026-08-05T20:00:00+08:00",
      "end": "ISO 8601 時間",
      "category": "分類關鍵字（會用 category_rules.py 的規則判斷，寫活動類型的中文詞就好，
                    例如「煙火」「市集」「演唱會」）",
      "price": "票價說明，免費就寫「免費」",
      "description": "簡介，AI enrich 會用這段文字產生重點摘要",
      "url": "官方資訊連結",
      "lat": 緯度（選填）,
      "lon": 經度（選填）
    }
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

from .base import BaseCollector
from scripts.normalize.schema import RawEvent

DATA_FILE = os.path.join(os.path.dirname(__file__), "manual_events.json")


class ManualCollector(BaseCollector):
    source_id = "manual"

    def fetch(self) -> list[dict]:
        if not os.path.exists(DATA_FILE):
            return []
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, list):
                print(f"[manual] {DATA_FILE} 格式不對（預期是陣列），略過", file=sys.stderr)
                return []
            return data
        except Exception as e:  # noqa: BLE001
            print(f"[manual] 讀取 {DATA_FILE} 失敗：{e}", file=sys.stderr)
            return []

    def to_raw_events(self, raw: list[dict]) -> list[RawEvent]:
        fetched_at = datetime.now(timezone.utc).isoformat()
        events: list[RawEvent] = []
        for item in raw:
            required = ("id", "title", "start", "end")
            if not all(item.get(k) for k in required):
                print(f"[manual] 略過缺少必要欄位的項目：{item.get('id', '(無 id)')}", file=sys.stderr)
                continue
            events.append(RawEvent(
                source_id=self.source_id,
                source_ref_id=str(item["id"]),
                raw_title=item["title"],
                raw_address=item.get("address"),
                raw_venue_name=item.get("venueName"),
                raw_location_blob=json.dumps(item, ensure_ascii=False),
                raw_start=item["start"],
                raw_end=item["end"],
                raw_category=item.get("category"),
                raw_price=item.get("price"),
                raw_description=item.get("description"),
                raw_url=item.get("url"),
                lat=item.get("lat"),
                lon=item.get("lon"),
                fetched_at=fetched_at,
            ))
        print(f"[manual] 取得 {len(events)} 筆手動維護的活動資料", file=sys.stderr)
        return events
