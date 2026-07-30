"""ticket collector（骨架）。
目前沒有已知可用的公開開放資料來源，先建立符合 BaseCollector 介面的骨架，
run() 回傳空清單，不會為了湊功能造假資料。
TODO：找到可用來源後補上 fetch() / to_raw_events() 實作。
見 docs/01-ARCHITECTURE.md 第 9 節。
"""
from .base import BaseCollector


class TicketCollector(BaseCollector):
    source_id = "ticket"

    def fetch(self) -> list[dict]:
        return []

    def to_raw_events(self, raw: list[dict]) -> list[dict]:
        return []
