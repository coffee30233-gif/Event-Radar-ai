"""taichung 開放資料 collector（選用加強來源）。
主力來源 culture.py 已涵蓋全國，這支是選用的，等你覺得這個縣市的資料涵蓋率不夠時
再查證、實作。
TODO：查證該縣市開放資料平台是否有可用的活動類資料集。
"""
from .base import BaseCollector


class TaichungCollector(BaseCollector):
    source_id = "taichung"
