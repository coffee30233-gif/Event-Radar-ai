"""RawEvent → NormalizedEvent 的轉換邏輯。
輸出的 NormalizedEvent 還沒有 ai / content_hash（那是 scripts/ai/enrich.py 的工作），
這裡只負責：統一欄位、統一分類、統一日期格式、地址 → city/region、產生穩定 id。

城市偵測策略（多層備援，實測發現文化部資料的 location 欄位常常是空的）：
  1. raw_address（location 欄位）裡找縣市關鍵字
  2. raw_venue_name（locationName 場地名稱）裡找
  3. raw_location_blob（整筆原始資料的 JSON 文字，含 showinfo 等巢狀欄位）裡找
  4. 都找不到：不丟棄這筆資料，city 標記為「未知」，region 也標記為「未知」，
     讓活動至少能在「全部」分頁看到，只是無法用縣市/地區篩選
"""
from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta, timezone

from scripts.normalize.schema import NormalizedEvent, RawEvent, CITY_TO_REGION
from scripts.normalize.category_rules import detect_category
from scripts.normalize.geocode import geocode

_DEFAULT_HOUR = 19  # 找不到時間時的預設時段（多數藝文活動常見時段）
UNKNOWN_CITY = "未知"
UNKNOWN_REGION = "未知"

# 城市關鍵字對照表：(關鍵字, 對應的標準縣市名稱)，由「精確」到「寬鬆」排序。
# 實測發現兩個問題，這裡一併修正：
#   1. 很多場地名稱只寫「台中國家歌劇院」「高雄展覽館」，完全沒有「市/縣」這個字，
#      原本只比對「台中市」這種完整縣市名稱會全部漏掉，所以加上不帶「市/縣」的裸字版本
#      當作次一級的比對關鍵字（裸字版本排在後面，讓完整縣市名稱優先命中，避免不必要的
#      優先序問題，雖然大部分縣市這兩層结果其實一樣）
#   2. 政府資料常混用「臺」「台」兩種寫法（臺北/台北、臺中/台中、臺南/台南、臺東/台東），
#      兩種都要能比對到
# 「新竹」「嘉義」裸字版本有歧義（可能是市或縣），沒有更多線索時預設猜「市」，
# 這是已知的簡化，之後如果發現猜錯的情況比預期多，可以再調整策略。
_CITY_ALIASES: list[tuple[str, str]] = [
    ("台北市", "台北市"), ("臺北市", "台北市"),
    ("新北市", "新北市"),
    ("桃園市", "桃園市"),
    ("新竹市", "新竹市"), ("新竹縣", "新竹縣"),
    ("基隆市", "基隆市"),
    ("宜蘭縣", "宜蘭縣"),
    ("台中市", "台中市"), ("臺中市", "台中市"),
    ("苗栗縣", "苗栗縣"),
    ("彰化縣", "彰化縣"),
    ("南投縣", "南投縣"),
    ("雲林縣", "雲林縣"),
    ("台南市", "台南市"), ("臺南市", "台南市"),
    ("高雄市", "高雄市"),
    ("嘉義市", "嘉義市"), ("嘉義縣", "嘉義縣"),
    ("屏東縣", "屏東縣"),
    ("花蓮縣", "花蓮縣"),
    ("台東縣", "台東縣"), ("臺東縣", "台東縣"),
    ("澎湖縣", "澎湖縣"),
    ("金門縣", "金門縣"),
    ("連江縣", "連江縣"),
    # ↓ 不帶「市/縣」的裸字版本，優先序較低，只有前面都沒命中才會用到
    ("台北", "台北市"), ("臺北", "台北市"),
    ("新北", "新北市"),
    ("桃園", "桃園市"),
    ("新竹", "新竹市"),  # 有歧義（市/縣皆可能），預設猜市
    ("基隆", "基隆市"),
    ("宜蘭", "宜蘭縣"),
    ("台中", "台中市"), ("臺中", "台中市"),
    ("苗栗", "苗栗縣"),
    ("彰化", "彰化縣"),
    ("南投", "南投縣"),
    ("雲林", "雲林縣"),
    ("台南", "台南市"), ("臺南", "台南市"),
    ("高雄", "高雄市"),
    ("嘉義", "嘉義市"),  # 有歧義（市/縣皆可能），預設猜市
    ("屏東", "屏東縣"),
    ("花蓮", "花蓮縣"),
    ("台東", "台東縣"), ("臺東", "台東縣"),
    ("澎湖", "澎湖縣"),
    ("金門", "金門縣"),
    ("連江", "連江縣"),
]


def _find_city_in_text(text: str | None) -> str | None:
    if not text:
        return None
    for keyword, city in _CITY_ALIASES:
        if keyword in text:
            return city
    return None


def _detect_city(raw: RawEvent) -> tuple[str | None, str]:
    """回傳 (city, 偵測來源)，偵測來源給統計/除錯用，city 為 None 代表三層都沒找到。"""
    city = _find_city_in_text(raw.raw_address)
    if city:
        return city, "address"
    city = _find_city_in_text(raw.raw_venue_name)
    if city:
        return city, "venue_name"
    city = _find_city_in_text(raw.raw_location_blob)
    if city:
        return city, "location_blob"
    return None, "none"


def _parse_dt(date_str: str | None) -> datetime | None:
    """解析日期字串，盡量寬鬆——實測發現原本的 strptime 逐一嘗試寫法在真實資料上
    100% 解析失敗（見 docs/02-DATA-SCHEMA.md 第 7 節的除錯記錄），問題出在：
      1. 原本用「切固定長度字串再 strptime」這招，切出來的長度跟格式對不上就會直接失敗
      2. 沒有考慮到民國年（例如「115-07-29」= 2026）或斜線分隔（"2026/07/29"）這類變體
    現在改用 python-dateutil 的彈性解析當主力，先手動處理民國年轉換（dateutil 看不懂
    民國年），再交給 dateutil 解析；dateutil 不在環境裡或解析失敗時，退回最基本的
    「抓數字」正規表示式當最後防線，確保至少能救回「年-月-日」這種最基本資訊。
    """
    if not date_str:
        return None
    date_str = date_str.strip()
    if not date_str:
        return None

    # 民國年偵測並轉換成西元年（例如 "115-07-29" → "2026-07-29"）。
    # 判斷依據：年份部分只有 2-3 位數字，西元年至少 4 位數，用這個粗略區分。
    m = re.match(r"^(\d{2,3})([-/])(\d{1,2})\2(\d{1,2})(.*)$", date_str)
    if m and int(m.group(1)) < 200:
        roc_year, sep, mo, d, rest = m.groups()
        date_str = f"{int(roc_year) + 1911}{sep}{mo}{sep}{d}{rest}"

    dt: datetime | None = None
    try:
        from dateutil import parser as dateutil_parser
        # default 提供「找不到的欄位」要用什麼填，這裡讓沒寫時間的日期自動補上
        # _DEFAULT_HOUR，不用另外判斷字串裡有沒有時間資訊
        dt = dateutil_parser.parse(date_str, default=datetime(2000, 1, 1, _DEFAULT_HOUR, 0, 0))
    except Exception:
        dt = None

    if dt is None:
        # dateutil 不在環境裡，或字串真的太怪解析失敗：只搶救「年-月-日」這組數字，
        # 時間一律用預設值，比完全放棄這筆活動好
        m2 = re.search(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})", date_str)
        if not m2:
            return None
        y, mo, d = map(int, m2.groups())
        try:
            dt = datetime(y, mo, d, _DEFAULT_HOUR, 0)
        except ValueError:
            return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone(timedelta(hours=8)))
    return dt


def _detect_is_free(price: str | None) -> bool:
    if not price:
        return False
    text = price.strip()
    return ("免費" in text) or (text in ("0", "$0")) or ("free" in text.lower())


def normalize_raw_events(raw_events: list[RawEvent], allow_geocode_fallback: bool = False) -> list[NormalizedEvent]:
    normalized: list[NormalizedEvent] = []

    stats = {
        "total": len(raw_events),
        "location_empty": 0,       # raw_address（location 欄位）是空的筆數
        "city_from_address": 0,
        "city_from_venue_name": 0,
        "city_from_location_blob": 0,
        "city_unknown": 0,         # 三層都找不到，標記「未知」但仍保留
        "skipped_no_date": 0,      # 真的沒有可用日期，這種才會整筆略過
        "normalized_ok": 0,
    }
    now_iso = datetime.now(timezone.utc).isoformat()
    date_fail_samples: list[str] = []

    for raw in raw_events:
        if not raw.raw_address or not raw.raw_address.strip():
            stats["location_empty"] += 1

        city, source = _detect_city(raw)
        if source == "address":
            stats["city_from_address"] += 1
        elif source == "venue_name":
            stats["city_from_venue_name"] += 1
        elif source == "location_blob":
            stats["city_from_location_blob"] += 1
        else:
            stats["city_unknown"] += 1
            city = UNKNOWN_CITY  # 不丟棄，保留活動但標記未知（見模組說明的第 4 點）

        start_dt = _parse_dt(raw.raw_start)
        if not start_dt:
            stats["skipped_no_date"] += 1
            if len(date_fail_samples) < 5:
                date_fail_samples.append(raw.raw_start)
            continue  # 真的沒有日期就沒辦法排進行事曆/看板，這種才略過
        end_dt = _parse_dt(raw.raw_end) or (start_dt + timedelta(hours=2))
        if end_dt <= start_dt:
            end_dt = start_dt + timedelta(hours=2)

        lat, lon = raw.lat, raw.lon
        if (lat is None or lon is None) and allow_geocode_fallback and raw.raw_address:
            geo = geocode(raw.raw_address)
            if geo:
                lat, lon = geo

        category = detect_category(raw.raw_title, raw.raw_category)
        price = raw.raw_price or "詳見官方資訊"
        region = CITY_TO_REGION.get(city, UNKNOWN_REGION) if city != UNKNOWN_CITY else UNKNOWN_REGION

        normalized.append(NormalizedEvent(
            id=f"{raw.source_id}-{raw.source_ref_id}",
            title=raw.raw_title.strip(),
            city=city,
            region=region,
            address=raw.raw_address or "",
            venue=raw.raw_venue_name or raw.raw_address or "",
            lat=lat,
            lon=lon,
            category=category,
            start=start_dt.isoformat(),
            end=end_dt.isoformat(),
            price=price,
            is_free=_detect_is_free(price),
            url=raw.raw_url or "",
            sources=[raw.source_id],
            popularity_score=50,  # 沒有熱度訊號時的中性預設值，之後可接入點閱數/售票熱度做加權
            updated_at=now_iso,
            raw_description=raw.raw_description or "",
        ))
        stats["normalized_ok"] += 1

    print(
        f"[normalize] location 空白：{stats['location_empty']} 筆 | "
        f"city 推導成功：{stats['city_from_address'] + stats['city_from_venue_name'] + stats['city_from_location_blob']} 筆 "
        f"（地址 {stats['city_from_address']}／場地名稱 {stats['city_from_venue_name']}／"
        f"其他欄位推測 {stats['city_from_location_blob']}）| "
        f"city 未知但保留：{stats['city_unknown']} 筆 | "
        f"因缺少日期而略過：{stats['skipped_no_date']} 筆 | "
        f"normalize 成功：{stats['normalized_ok']} 筆（共 {stats['total']} 筆輸入）",
        file=sys.stderr,
    )
    if date_fail_samples:
        print(
            "[normalize] ⚠️ 因日期解析失敗而略過的 raw_start 原始值範例（用來診斷日期格式問題）：\n  "
            + "\n  ".join(f"{i+1}. {repr(s)}" for i, s in enumerate(date_fail_samples)),
            file=sys.stderr,
        )
    return normalized
