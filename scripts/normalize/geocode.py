"""地址轉經緯度：只給「沒有提供 lat/lon 的來源」當備援用。
文化部資料（主力來源）大多本來就有經緯度，這支通常用不到，但保留給以後補充的
縣市 collector 使用（很多縣市開放資料只有地址，沒有經緯度）。

用 OpenStreetMap 的 Nominatim（免費、不需金鑰，但有嚴格的使用頻率限制：
每秒最多 1 次請求，且要標示合理的 User-Agent，見
https://operations.osmfoundation.org/policies/nominatim/）。

⚠️ 這支程式需要對外網路連線才能執行。
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request

_CACHE: dict[str, tuple[float, float] | None] = {}
_LAST_REQUEST_TS = 0.0
_MIN_INTERVAL_SEC = 1.0  # 遵守 Nominatim 使用政策：每秒最多 1 次請求

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "event-radar-ai-collector/1.0 (personal project; contact: see repo README)"


def geocode(address: str) -> tuple[float, float] | None:
    """回傳 (lat, lon)，查不到回傳 None。有內建快取避免重複查詢同一地址。"""
    if not address:
        return None
    if address in _CACHE:
        return _CACHE[address]

    global _LAST_REQUEST_TS
    wait = _MIN_INTERVAL_SEC - (time.time() - _LAST_REQUEST_TS)
    if wait > 0:
        time.sleep(wait)

    params = urllib.parse.urlencode({"q": address, "format": "json", "limit": 1, "countrycodes": "tw"})
    req = urllib.request.Request(f"{NOMINATIM_URL}?{params}", headers={"User-Agent": USER_AGENT})

    result: tuple[float, float] | None = None
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if data:
            result = (float(data[0]["lat"]), float(data[0]["lon"]))
    except Exception as e:
        print(f"[geocode] 查詢失敗（{address}）：{e}", file=sys.stderr)
    finally:
        _LAST_REQUEST_TS = time.time()

    _CACHE[address] = result
    return result
