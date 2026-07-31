"""RawEvent / NormalizedEvent 的 Python 版型別。
與 apps/web/types/event.ts 手動保持同步，詳見 docs/02-DATA-SCHEMA.md。
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional

# ---------------------------------------------------------------
# Category：20 種分類（跟 apps/web/types/event.ts 的 Category 同一組 key）
# ---------------------------------------------------------------
CATEGORIES = [
    "fireworks", "firedance", "concert", "musicfest", "performance", "exhibition",
    "creative", "market", "nightmarket", "anime", "game", "talk",
    "festival", "lantern", "family", "pet", "run", "experience", "outdoor",
    "food", "popup", "mall",
]

# ---------------------------------------------------------------
# CITY_TO_REGION：22 縣市標準名稱 → 5 分區
# ---------------------------------------------------------------
CITY_TO_REGION: dict[str, str] = {
    "台北市": "北部", "新北市": "北部", "桃園市": "北部",
    "新竹市": "北部", "新竹縣": "北部", "基隆市": "北部", "宜蘭縣": "北部",
    "台中市": "中部", "苗栗縣": "中部", "彰化縣": "中部", "南投縣": "中部", "雲林縣": "中部",
    "台南市": "南部", "高雄市": "南部", "嘉義市": "南部", "嘉義縣": "南部", "屏東縣": "南部",
    "花蓮縣": "東部", "台東縣": "東部",
    "澎湖縣": "離島", "金門縣": "離島", "連江縣": "離島",
}


@dataclass
class RawEvent:
    """Collector 輸出，各來源長相不同，這是最低共同格式。"""
    source_id: str
    source_ref_id: str
    raw_title: str
    raw_start: str                      # 原始字串，格式不保證一致，交給 normalize 處理
    raw_address: Optional[str] = None
    raw_venue_name: Optional[str] = None  # 場地名稱（跟地址是分開的兩件事，例如「大稻埕碼頭」vs 完整地址）
    raw_location_blob: Optional[str] = None  # 整筆原始資料的完整文字（JSON 字串），city 偵測失敗時的最後備援
    raw_end: Optional[str] = None
    raw_category: Optional[str] = None
    raw_price: Optional[str] = None
    raw_description: Optional[str] = None
    raw_url: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    fetched_at: Optional[str] = None


@dataclass
class AiEnrichment:
    bullets: list[str] = field(default_factory=list)
    recommend_reason: str = ""
    suitable_for: list[str] = field(default_factory=list)
    estimated_stay_minutes: int = 60
    has_aircon: Optional[bool] = None

    def to_dict(self) -> dict:
        return {
            "bullets": self.bullets,
            "recommendReason": self.recommend_reason,
            "suitableFor": self.suitable_for,
            "estimatedStayMinutes": self.estimated_stay_minutes,
            "hasAircon": self.has_aircon,
        }

    @staticmethod
    def from_dict(d: dict) -> "AiEnrichment":
        return AiEnrichment(
            bullets=d.get("bullets", []),
            recommend_reason=d.get("recommendReason", ""),
            suitable_for=d.get("suitableFor", []),
            estimated_stay_minutes=d.get("estimatedStayMinutes", 60),
            has_aircon=d.get("hasAircon"),
        )


@dataclass
class NormalizedEvent:
    """merge/dedupe/AI 之後的標準格式，也是 events.json 裡每一筆的格式。"""
    id: str
    title: str
    city: str
    region: str
    address: str
    venue: str
    lat: Optional[float]
    lon: Optional[float]
    category: str
    start: str                          # ISO 8601
    end: str                            # ISO 8601
    price: str
    is_free: bool
    url: str
    sources: list[str]
    popularity_score: int
    updated_at: str
    raw_description: str = ""           # 內部用：給 AI enrich 當輸入、算 content_hash 用
    content_hash: str = ""              # 內部用：偵測「訊息有沒有變動」，見 scripts/ai/enrich.py
    ai_source: str = "pending"          # "gemini"=真的 AI 產出／"fallback"=規則式備援／"pending"=還沒處理過
    ai: Optional[AiEnrichment] = None

    def to_public_dict(self) -> dict:
        """輸出進 events.json 的格式，不含 raw_description（那只是內部暫存用）。"""
        return {
            "id": self.id,
            "title": self.title,
            "city": self.city,
            "region": self.region,
            "address": self.address,
            "venue": self.venue,
            "lat": self.lat,
            "lon": self.lon,
            "category": self.category,
            "start": self.start,
            "end": self.end,
            "price": self.price,
            "isFree": self.is_free,
            "url": self.url,
            "sources": self.sources,
            "popularityScore": self.popularity_score,
            "contentHash": self.content_hash,
            "aiSource": self.ai_source,
            "ai": self.ai.to_dict() if self.ai else AiEnrichment().to_dict(),
            "updatedAt": self.updated_at,
        }
