"""Collector 抽象基底類別。所有來源都要實作這個介面。
詳見 docs/01-ARCHITECTURE.md 第 5 節。
"""
from abc import ABC, abstractmethod

from scripts.normalize.schema import RawEvent


class BaseCollector(ABC):
    source_id: str

    @abstractmethod
    def fetch(self) -> list[dict]:
        """打對應來源的 API，回傳原始資料（未整理）"""

    @abstractmethod
    def to_raw_events(self, raw: list[dict]) -> list[RawEvent]:
        """把原始資料轉成 RawEvent 清單"""

    def run(self) -> list[RawEvent]:
        return self.to_raw_events(self.fetch())
