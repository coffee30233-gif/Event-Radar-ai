"""Gemini client（Python 版），跟 apps/web/lib/gemini.ts 用同一套三層 fallback 邏輯。
詳見 docs/01-ARCHITECTURE.md 第 6.3 節。

⚠️ 這支程式需要對外網路連線，且需要環境變數 GEMINI_API_KEY 才能真的呼叫成功。
   套件：pip install google-genai

免費方案的配額非常低（實測 gemini-3.6-flash / gemini-3.5-flash 每分鐘只能打 5 次，
每天大概只有 20 次），第一次對幾千筆活動做批次 AI enrich 時，如果不做限速，
會在幾秒內就把配額打爆，然後陷入「瘋狂重試、瘋狂被 429 拒絕」的無限迴圈，
實際浪費掉的時間比乖乖排隊還久。這支檔案因此做了兩件事：
  1. 每個模型各自照 RPM（每分鐘請求數）限制排隊，呼叫前該等多久就等多久
  2. 一旦偵測到某個模型當天的配額已經用完（錯誤訊息裡有 "PerDay" 字樣），
     這次執行接下來就直接跳過那個模型，不再浪費時間重試注定失敗的請求
"""
from __future__ import annotations

import json
import os
import re
import sys
import time

MODEL_CHAIN = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]

# 每分鐘請求數上限（RPM），對應免費方案在 Google AI Studio 的 Rate limits 頁面實測數字。
# 如果你之後升級付費方案、額度變高，把這幾個數字調大即可，其他程式碼不用動。
MODEL_RPM: dict[str, int] = {
    "gemini-3.6-flash": 5,
    "gemini-3.5-flash": 5,
    "gemini-3.1-flash-lite": 15,
}

_client = None
_last_call_at: dict[str, float] = {}          # 每個模型上一次呼叫的時間戳記，用來算限速間隔
_exhausted_today: set[str] = set()             # 這次執行期間，偵測到「當日配額用完」的模型
_last_used_model: str | None = None            # 上一次成功呼叫的模型，用來判斷要不要印「已降級」


def _get_client():
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY 未設定。本機執行請 export GEMINI_API_KEY=...，"
            "GitHub Actions 排程請在 repo secrets 設定 GEMINI_API_KEY。"
        )
    from google import genai  # 延後 import，沒裝套件時只有真的要呼叫 AI 才會噴錯
    _client = genai.Client(api_key=api_key)
    return _client


class GeminiAllModelsFailedError(RuntimeError):
    pass


def _wait_for_rate_limit(model: str) -> None:
    """呼叫前先確保跟上一次呼叫這個模型的間隔，符合它的 RPM 上限。"""
    rpm = MODEL_RPM.get(model, 5)
    min_interval = 60.0 / rpm
    last = _last_call_at.get(model)
    if last is not None:
        elapsed = time.monotonic() - last
        wait = min_interval - elapsed
        if wait > 0:
            time.sleep(wait)
    _last_call_at[model] = time.monotonic()


def _is_daily_quota_error(err: Exception) -> bool:
    """粗略判斷是不是「當天配額用完」這種重試也沒用的錯誤（跟「這分鐘打太多次、等一下
    就好」的錯誤要分開處理，後者靠 _wait_for_rate_limit 排隊就能解決，不用整個模型跳過）。
    """
    text = str(err)
    return "PerDay" in text or "RequestsPerDay" in text


def generate_structured(system_instruction: str, user_content: str, response_schema: dict) -> tuple[dict, str, int]:
    """依 MODEL_CHAIN 順序嘗試呼叫，回傳 (解析後的 JSON dict, 使用的 model, fallback 層數)。
    全部失敗（或全部當日配額已用完）時丟出 GeminiAllModelsFailedError。
    """
    client = _get_client()
    last_error: Exception | None = None
    all_skipped = True  # 如果三個模型都因為「當日配額已用完」被跳過（不是真的打過失敗），
                         # 代表根本沒有額度可用，呼叫端應該知道這件事，見下方判斷

    for depth, model in enumerate(MODEL_CHAIN):
        if model in _exhausted_today:
            continue  # 這次執行已經確認這個模型今天用完了，不用再浪費時間打它

        all_skipped = False
        _wait_for_rate_limit(model)
        try:
            response = client.models.generate_content(
                model=model,
                contents=user_content,
                config={
                    "system_instruction": system_instruction,
                    "response_mime_type": "application/json",
                    "response_schema": response_schema,
                },
            )
            text = response.text
            if not text:
                raise RuntimeError(f"{model} 回傳空內容")
            data = json.loads(text)
            global _last_used_model
            if model != _last_used_model:
                # 只在「這次用的模型」跟「上一次用的模型」不一樣時才印，避免同一個模型
                # 連續成功呼叫上百次時洗版 log（例如主力模型配額用完後，備援模型變成
                # 唯一可用的模型，接下來每一次呼叫都會成功，不需要每次都提醒）
                if depth > 0:
                    print(f"[gemini] 目前使用第 {depth + 1} 層模型：{model}", file=sys.stderr)
                else:
                    print(f"[gemini] 已恢復使用主要模型：{model}", file=sys.stderr)
                _last_used_model = model
            return data, model, depth
        except Exception as e:  # noqa: BLE001 - 需要接住任何 SDK 例外，統一走 fallback
            last_error = e
            if _is_daily_quota_error(e):
                _exhausted_today.add(model)
                print(f"[gemini] {model} 今日配額已用完，本次執行後續全部跳過此模型", file=sys.stderr)
            else:
                print(f"[gemini] {model} 失敗：{e}", file=sys.stderr)
            continue

    if all_skipped:
        raise GeminiAllModelsFailedError(
            f"所有模型今天的配額都已經用完（{' / '.join(MODEL_CHAIN)}），這次執行完全沒有可用額度。"
        )
    raise GeminiAllModelsFailedError(
        f"所有 Gemini 模型皆失敗（{' → '.join(MODEL_CHAIN)}）。最後錯誤：{last_error}"
    )
