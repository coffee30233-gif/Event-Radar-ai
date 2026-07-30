"""去重邏輯：用「標題相似度 + 同一天 + 地點距離接近」找出重複活動，合併成一筆。

目前只有 culture 這一個來源在跑，理論上不會有重複；但保留這支是為了：
1. 之後加第二個來源（例如某縣市開放資料）時，同一場活動很可能兩邊都有登記
2. 就算只有一個來源，同一個主辦單位偶爾也會誤植兩筆幾乎一樣的資料

策略故意選最簡單可行的做法（標題相似度用標準函式庫的 difflib，不上向量相似度
這種重量級做法），效能跟可維護性優先。
"""
from __future__ import annotations

import math
from difflib import SequenceMatcher

from scripts.normalize.schema import NormalizedEvent

TITLE_SIMILARITY_THRESHOLD = 0.82
DISTANCE_THRESHOLD_KM = 0.5


def _title_similar(a: str, b: str) -> bool:
    return SequenceMatcher(None, a, b).ratio() >= TITLE_SIMILARITY_THRESHOLD


def _same_day(a: str, b: str) -> bool:
    return a[:10] == b[:10]  # ISO 8601 字串前 10 碼就是日期


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _is_duplicate(a: NormalizedEvent, b: NormalizedEvent) -> bool:
    if not _same_day(a.start, b.start):
        return False
    if not _title_similar(a.title, b.title):
        return False
    if a.lat is not None and a.lon is not None and b.lat is not None and b.lon is not None:
        if _haversine_km(a.lat, a.lon, b.lat, b.lon) > DISTANCE_THRESHOLD_KM:
            return False
    return True


def dedupe_events(events: list[NormalizedEvent]) -> list[NormalizedEvent]:
    """O(n^2) 比對，在「全台灣一天幾百到幾千筆」的規模下還算可接受。
    未來資料量大到影響 pipeline 執行時間時，可以先用 city + 日期分桶，
    只在同一桶內做兩兩比對，這裡先不做這個優化（YAGNI）。
    """
    result: list[NormalizedEvent] = []
    for event in events:
        merged_into = None
        for existing in result:
            if _is_duplicate(existing, event):
                merged_into = existing
                break
        if merged_into:
            merged_into.sources = sorted(set(merged_into.sources) | set(event.sources))
        else:
            result.append(event)
    return result
