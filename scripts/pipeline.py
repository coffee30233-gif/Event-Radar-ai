#!/usr/bin/env python3
"""主流程：collectors → normalize → merge → dedupe → ai enrich（含快取）→ 輸出 events.json

使用方式：
    export GEMINI_API_KEY=...
    python3 -m scripts.pipeline --out apps/web/public/events.json
（要用 -m scripts.pipeline 從 repo 根目錄執行，因為程式碼裡用了絕對 import
 scripts.xxx.yyy，這樣本機執行方式跟 GitHub Actions 裡的方式才會一致。）

⚠️ 需要對外網路連線才能真的抓資料、呼叫 Gemini，這支無法在沒有網路的沙盒環境裡完整執行。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

from scripts.collectors.base import BaseCollector
from scripts.collectors.culture import CultureCollector
from scripts.collectors.manual import ManualCollector
from scripts.normalize.normalize import normalize_raw_events
from scripts.merge.merge import merge_events
from scripts.dedupe.dedupe import dedupe_events
from scripts.ai.enrich import enrich_events

# 目前有兩個真的會抓資料的 collector：
#   - culture：文化部全國藝文活動開放資料（API，全國適用，主力來源）
#   - manual：你自己維護的 scripts/collectors/manual_events.json（像大稻埕煙火這種
#     城市觀光行銷活動，文化部資料沒有收錄，見 scripts/collectors/manual.py 說明）
# 其餘（taipei/newtaipei/taoyuan/hsinchu/taichung/tainan/kaohsiung/ticket/
# shopping/festival）都還是骨架，run() 會回傳空清單或還沒實作 fetch/to_raw_events，
# 先不放進 registry 避免 NotImplementedError 讓整條 pipeline 中斷。
COLLECTOR_REGISTRY: list[type[BaseCollector]] = [
    CultureCollector,
    ManualCollector,
]


def run_all_collectors() -> tuple[list, list[str]]:
    """跑過 COLLECTOR_REGISTRY 裡的每個 collector，單一 collector 失敗只記警告，
    不讓整條 pipeline 中斷（見 docs/01-ARCHITECTURE.md 第 5 節）。
    回傳 (所有 RawEvent 的清單, 這次成功跑完的 source_id 清單)。
    """
    all_raw = []
    succeeded_sources = []
    for collector_cls in COLLECTOR_REGISTRY:
        collector = collector_cls()
        try:
            raw = collector.run()
            all_raw.extend(raw)
            succeeded_sources.append(collector.source_id)
        except Exception as e:  # noqa: BLE001 - 故意接住任何例外，單一來源失敗不能拖垮全部
            print(f"[pipeline] collector {collector_cls.__name__} 失敗，略過：{e}", file=sys.stderr)
    return all_raw, succeeded_sources


def load_previous_events(path: str) -> dict[str, dict]:
    """讀取上一次的 events.json，回傳 {id: event_dict}，供 enrich 階段比對快取用。
    檔案不存在或格式錯誤時回傳空 dict（等同於「這次全部都是新活動」）。
    """
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        events = data.get("events", [])
        return {e["id"]: e for e in events if "id" in e}
    except Exception as e:  # noqa: BLE001
        print(f"[pipeline] 讀取舊 events.json 失敗，視為沒有舊資料：{e}", file=sys.stderr)
        return {}


def main():
    ap = argparse.ArgumentParser(description="Event Radar AI 資料蒐集管線")
    ap.add_argument("--out", default="apps/web/public/events.json", help="輸出檔案路徑")
    ap.add_argument(
        "--max-ai-calls", type=int, default=None,
        help="這次執行最多真的呼叫幾次 Gemini（免費方案配額低，預設用 enrich.py 裡的 DEFAULT_MAX_AI_CALLS）"
    )
    args = ap.parse_args()

    print("[pipeline] 開始跑 collectors…", file=sys.stderr)
    raw_events, succeeded_sources = run_all_collectors()
    print(f"[pipeline] collectors 完成，共 {len(raw_events)} 筆原始資料，"
          f"成功來源：{succeeded_sources}", file=sys.stderr)

    print("[pipeline] normalize…", file=sys.stderr)
    normalized = normalize_raw_events(raw_events)

    print("[pipeline] merge + dedupe…", file=sys.stderr)
    merged = merge_events(normalized)
    deduped = dedupe_events(merged)
    print(f"[pipeline] 去重後剩下 {len(deduped)} 筆", file=sys.stderr)

    # 只保留現在以後（含正在進行）的活動，過期活動不需要留在 events.json 裡
    now = datetime.now(timezone.utc)
    upcoming = [e for e in deduped if datetime.fromisoformat(e.end) >= now]
    print(f"[pipeline] 篩掉已結束的活動後剩下 {len(upcoming)} 筆", file=sys.stderr)

    # 安全機制：這次抓到 0 筆有效活動時，保留舊的 events.json 不動，不要用空資料覆蓋掉。
    # 理由：文化部 API 某天抽風、collector 暫時性失敗、normalize 邏輯意外把全部資料濾掉
    # 這幾種情況都不該讓網站瞬間變成空白——「保留昨天的舊資料」永遠比「顯示 0 筆活動」
    # 對使用者更友善，之後排程下一次成功執行就會自動修正回來。
    if len(upcoming) == 0:
        print(
            "[pipeline] ⚠️ 這次沒有抓到任何有效活動（0 筆），保留現有的 events.json 不覆蓋，"
            "直接結束（不會呼叫 Gemini，也不會寫檔）。請檢查上面的 log 找出是哪個環節出問題。",
            file=sys.stderr,
        )
        return

    print("[pipeline] AI enrich（只對新活動/有變動的活動呼叫 Gemini，免費方案配額有限，" +
          "優先處理最快開始的活動）…", file=sys.stderr)
    previous_by_id = load_previous_events(args.out)
    # 依開始時間排序：Gemini 呼叫預算有限時，優先保住「快要開始」的活動有真正的 AI 摘要，
    # 半年後才開始的活動晚一點才輪到也沒關係。
    upcoming.sort(key=lambda e: e.start)
    enrich_kwargs = {} if args.max_ai_calls is None else {"max_ai_calls": args.max_ai_calls}
    enriched, stats = enrich_events(upcoming, previous_by_id, **enrich_kwargs)
    print(
        f"[pipeline] AI enrich 完成 — 沿用舊摘要（真的是 AI 產出）：{stats['reused']}，"
        f"這次成功呼叫 Gemini：{stats['called_gemini']}，"
        f"呼叫失敗改規則式備援：{stats['fallback_used']}，"
        f"預算用完暫時擱置：{stats['skipped_budget']}，"
        f"共 {stats['total']} 筆",
        file=sys.stderr,
    )

    enriched.sort(key=lambda e: e.start)
    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": succeeded_sources,
        "eventCount": len(enriched),
        "events": [e.to_public_dict() for e in enriched],
    }

    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"[pipeline] 完成！寫入 {len(enriched)} 筆活動到 {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
