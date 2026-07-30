"""文化部全國藝文活動開放資料 collector（主力來源，全國適用，不篩選縣市）。

資料源已驗證可用：https://data.gov.tw/dataset/6478
JSON 端點：https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=all
授權方式：政府資料開放授權條款-第1版（無償使用，需標示資料來源）
官方更新頻率：每日一次

⚠️ 這支程式需要對外網路連線才能執行，不能在沒有網路的沙盒環境裡直接測試，
   實際欄位若跟下面的假設有落差，執行時會印出警告，而不是整支程式當掉。
"""
from __future__ import annotations

import sys
import urllib.request
import json
from datetime import datetime, timezone

from .base import BaseCollector
from scripts.normalize.schema import RawEvent

SOURCE_URL = "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=all"


class CultureCollector(BaseCollector):
    source_id = "culture"

    def fetch(self) -> list[dict]:
        req = urllib.request.Request(
            SOURCE_URL,
            headers={"User-Agent": "event-radar-ai-collector/1.0 (open data integration)"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
        data = json.loads(raw.decode("utf-8", errors="ignore"))
        if not isinstance(data, list):
            print(f"[culture] 預期回傳陣列，實際拿到 {type(data)}，回傳空清單", file=sys.stderr)
            return []
        return data

    def to_raw_events(self, raw: list[dict]) -> list[RawEvent]:
        fetched_at = datetime.now(timezone.utc).isoformat()
        events: list[RawEvent] = []
        skipped = 0

        for item in raw:
            uid = item.get("UID") or item.get("uid")
            title = item.get("titile") or item.get("title")  # 官方欄位本身拼成 titile
            start = item.get("startDate")
            if not uid or not title or not start:
                skipped += 1
                continue

            lat, lon = item.get("latitude"), item.get("longitude")
            try:
                lat = float(lat) if lat not in (None, "", "0") else None
                lon = float(lon) if lon not in (None, "", "0") else None
            except (TypeError, ValueError):
                lat = lon = None

            events.append(RawEvent(
                source_id=self.source_id,
                source_ref_id=str(uid),
                raw_title=title.strip(),
                raw_address=item.get("location"),
                raw_venue_name=item.get("locationName"),
                # 官方資料的 location/locationName 常常是空的（尤其多場次/巡迴類活動），
                # 這裡把整筆原始資料轉成文字存起來，normalize 階段找不到縣市時可以在這裡面
                # 搜尋（例如 showinfo 場次資訊裡可能藏著地址），寧可多掃一點也不要整筆丟掉。
                raw_location_blob=json.dumps(item, ensure_ascii=False),
                raw_start=start,
                raw_end=item.get("endDate") or start,
                raw_category=item.get("category"),
                raw_price=item.get("Price") or item.get("price"),
                raw_description=(item.get("descriptionFilterHtml") or item.get("comment") or "")[:800],
                raw_url=item.get("sourceWebPromote") or item.get("webSales") or "",
                lat=lat,
                lon=lon,
                fetched_at=fetched_at,
            ))

        if skipped:
            print(f"[culture] 略過 {skipped} 筆缺少必要欄位（UID/標題/日期）的資料", file=sys.stderr)
        print(f"[culture] 取得 {len(events)} 筆原始活動資料", file=sys.stderr)
        return events
