"""AI 摘要層：只對「新活動」或「內容有變動的活動」呼叫 Gemini，已存在且沒變、而且
上次「真的成功用 AI 產生過摘要」的活動，直接沿用 events.json 裡舊的 ai 欄位，不重新呼叫。

比對方式：content_hash = 對「會影響摘要內容的欄位」做 hash，兩次 pipeline 執行間
只要這些欄位完全沒變，hash 就會相同 → 直接沿用舊摘要；只要有任何一個欄位變了
（例如主辦單位改了簡介、時間異動、地點變更），hash 就會不同 → 視為需要更新，
重新呼叫 Gemini。

⚠️ 重要修正（實測免費方案配額後加上的）：光是 content_hash 比對還不夠。第一次
批次處理幾千筆活動時，免費方案配額很快就會用完，用完之後的活動會退到規則式簡易
摘要（`ai_source="fallback"`）。如果只比對 hash，下次執行時這些活動的內容沒變、
hash 一樣，會被誤判成「已經處理過」而永遠沿用那個規則式簡易摘要，永遠不會真的被
排進 Gemini 佇列——所以快取條件除了比對 hash，還多加一條：**上次必須是真的用 AI
產生（ai_source == "gemini"）才算數**，`fallback` 或 `pending` 一律視為還沒處理完，
下次執行會繼續嘗試。

⚠️ 另一個重要修正：免費方案配額低到一次執行不可能處理完幾千筆活動的量，所以加了
`max_ai_calls` 參數限制「這次執行最多真的呼叫幾次 Gemini」，超過額度的活動這次
維持規則式簡易摘要，排到下一次排程執行時再繼續處理（因為 ai_source 是 "fallback"，
下次會自動被撿回來重試，不需要額外的追蹤邏輯）。呼叫端（pipeline.py）會把活動
依開始時間排序後再送進來，確保配額優先用在「快要開始的活動」上，而不是隨機分配。
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone

from scripts.normalize.schema import NormalizedEvent, AiEnrichment
from scripts.ai.gemini_client import generate_structured, GeminiAllModelsFailedError

ENRICH_SYSTEM_INSTRUCTION = """
你是活動資訊整理助理。根據提供的活動原始資訊，整理成結構化摘要：
1. bullets：剛好 3 條重點，每條不超過 30 字，講活動內容、時段、或注意事項這類實用資訊
2. recommendReason：一句話的推薦理由（不超過 40 字），語氣輕鬆自然，不要制式官腔
3. suitableFor：適合族群標籤，從這些裡面選 0-3 個：["情侶","親子","朋友聚會","家人","獨自前往","毛小孩"]
4. estimatedStayMinutes：預估這個活動會讓人待多久（分鐘），依活動類型合理估計
5. hasAircon：如果原始資訊完全沒提到室內外或空調相關線索，就回傳 null，不要用猜的
只能根據提供的原始資訊整理，不要編造原始資訊沒有的具體事實（例如不要編造票價數字）。
""".strip()

ENRICH_SCHEMA = {
    "type": "object",
    "properties": {
        "bullets": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 3},
        "recommendReason": {"type": "string"},
        "suitableFor": {"type": "array", "items": {"type": "string"}},
        "estimatedStayMinutes": {"type": "integer"},
        "hasAircon": {"anyOf": [{"type": "boolean"}, {"type": "null"}]},
    },
    "required": ["bullets", "recommendReason", "suitableFor", "estimatedStayMinutes", "hasAircon"],
}

# 這些欄位任何一個變動，就視為「訊息有變動」，需要重新呼叫 Gemini。
_HASH_FIELDS = ("title", "venue", "address", "category", "price", "start", "end", "raw_description")

# 免費方案配額低，一次執行預設最多真的呼叫這麼多次 Gemini，避免單次執行跑幾小時、
# 也避免一次把當天配額全部打光。可以用 pipeline.py 的 --max-ai-calls 覆蓋這個預設值。
DEFAULT_MAX_AI_CALLS = 150


def compute_content_hash(event: NormalizedEvent) -> str:
    payload = {f: getattr(event, f) for f in _HASH_FIELDS}
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _fallback_enrichment(event: NormalizedEvent) -> AiEnrichment:
    """Gemini 沒有額度可用、或三層都失敗時的暫時內容，不假裝是 AI 產出。
    這筆活動的 ai_source 會標成 "fallback"，下次排程執行會自動重試 Gemini，
    不會永遠卡在這個規則式版本。
    """
    return AiEnrichment(
        bullets=[
            f"地點：{event.venue or event.address or '詳見官方資訊'}",
            f"票價：{event.price or '詳見官方資訊'}",
            "AI 摘要尚未產生（配額限制），下次自動更新時會補上",
        ],
        recommend_reason="詳情請見活動官方頁面",
        suitable_for=[],
        estimated_stay_minutes=60,
        has_aircon=None,
    )


def enrich_events(
    events: list[NormalizedEvent],
    previous_by_id: dict[str, dict],
    max_ai_calls: int = DEFAULT_MAX_AI_CALLS,
) -> tuple[list[NormalizedEvent], dict[str, int]]:
    """依快取規則幫每筆活動填上 ai + content_hash。

    events：呼叫端應該先依「開始時間」由近到遠排序過，這樣配額用完時，優先保住的
            會是最快要開始、對使用者最有用的活動。
    previous_by_id：上一次 events.json 裡 `events` 陣列，用 id 建成的 dict。
    max_ai_calls：這次執行最多真的呼叫幾次 Gemini（不含被 content_hash 快取掉的部分）。
    """
    stats = {
        "reused": 0,          # 沿用上次「真的是 AI 產出」的摘要，沒有重新呼叫
        "called_gemini": 0,   # 這次真的成功呼叫 Gemini
        "fallback_used": 0,   # Gemini 呼叫失敗（額度用完/其他錯誤），改用規則式暫時內容
        "skipped_budget": 0,  # 這次執行的呼叫預算用完，還沒輪到就直接跳過，沿用/建立規則式內容
        "total": len(events),
    }
    now_iso = datetime.now(timezone.utc).isoformat()
    calls_made = 0

    for event in events:
        event.content_hash = compute_content_hash(event)
        prev = previous_by_id.get(event.id)

        # 只有「hash 沒變」而且「上次是真的用 AI 產生」才算數，fallback/pending 一律重試
        if prev and prev.get("contentHash") == event.content_hash and prev.get("aiSource") == "gemini" and prev.get("ai"):
            event.ai = AiEnrichment.from_dict(prev["ai"])
            event.ai_source = "gemini"
            stats["reused"] += 1
            continue

        if calls_made >= max_ai_calls:
            # 這次執行的 Gemini 呼叫預算用完了：如果剛好有舊的（即使是 fallback）內容
            # 就先沿用，沒有的話才產生新的規則式內容，兩種情況都標成 fallback，
            # 確保下次執行還會再嘗試
            if prev and prev.get("ai"):
                event.ai = AiEnrichment.from_dict(prev["ai"])
            else:
                event.ai = _fallback_enrichment(event)
            event.ai_source = "fallback"
            stats["skipped_budget"] += 1
            event.updated_at = now_iso
            continue

        try:
            data, model, depth = generate_structured(
                system_instruction=ENRICH_SYSTEM_INSTRUCTION,
                user_content=_build_enrich_prompt(event),
                response_schema=ENRICH_SCHEMA,
            )
            event.ai = AiEnrichment.from_dict(data)
            event.ai_source = "gemini"
            stats["called_gemini"] += 1
        except GeminiAllModelsFailedError as e:
            # 全部模型今天配額都用完了：後面每一筆都會是同樣結果，不用再浪費時間逐一嘗試，
            # 直接把預算歸零，讓後面的活動走「預算用完」那條路徑（沿用舊內容或簡易備援）
            print(f"[enrich] Gemini 完全無法使用，本次執行剩餘活動改用備援：{e}", file=sys.stderr)
            max_ai_calls = calls_made  # 讓後面的 calls_made >= max_ai_calls 立刻成立
            if prev and prev.get("ai"):
                event.ai = AiEnrichment.from_dict(prev["ai"])
            else:
                event.ai = _fallback_enrichment(event)
            event.ai_source = "fallback"
            stats["skipped_budget"] += 1
            event.updated_at = now_iso
            continue
        except Exception as e:  # noqa: BLE001 - 單一活動的其他非預期錯誤，不能讓整條 pipeline 中斷
            print(f"[enrich] {event.title} 的 AI 摘要失敗，改用規則式備援：{e}", file=sys.stderr)
            event.ai = _fallback_enrichment(event)
            event.ai_source = "fallback"
            stats["fallback_used"] += 1

        calls_made += 1
        event.updated_at = now_iso

    return events, stats


def _build_enrich_prompt(event: NormalizedEvent) -> str:
    return json.dumps({
        "title": event.title,
        "city": event.city,
        "venue": event.venue,
        "address": event.address,
        "category": event.category,
        "start": event.start,
        "end": event.end,
        "price": event.price,
        "description": event.raw_description,
    }, ensure_ascii=False)
