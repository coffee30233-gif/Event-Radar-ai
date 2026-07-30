"""hsinchu 開放資料 collector。
TODO(第四階段)：查證該縣市開放資料平台是否有可用的活動類資料集，確認後實作。
目前狀態：來源尚未查證，見 docs/01-ARCHITECTURE.md 第 9 節。
"""
from .base import BaseCollector


class HsinchuCollector(BaseCollector):
    source_id = "hsinchu"
