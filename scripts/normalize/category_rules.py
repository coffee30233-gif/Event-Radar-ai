"""分類關鍵字對應表：把各來源原始的分類文字/標題關鍵字對應到 22 種前端分類。
規則由上到下依序比對，第一個命中的就採用；都沒命中時用 DEFAULT_CATEGORY。
順序有講究：越明確、越不容易誤判的關鍵字放前面（例如「煙火」比「展覽」更明確）。
"""

CATEGORY_RULES: list[tuple[str, list[str]]] = [
    ("fireworks", ["煙火", "花火"]),
    ("firedance", ["火舞"]),
    ("nightmarket", ["夜市"]),
    ("lantern", ["燈會", "燈節", "水燈"]),
    ("musicfest", ["音樂節", "音樂祭"]),
    ("performance", ["音樂劇", "舞台劇", "話劇", "歌劇", "舞蹈劇場", "戲劇", "戲曲", "偶戲", "劇場"]),
    ("concert", ["演唱會", "演唱", "音樂會", "Live", "livehouse"]),
    ("mall", ["outlet", "Outlet", "購物中心", "百貨"]),
    ("popup", ["快閃"]),
    ("anime", ["動漫", "漫展", "Cosplay", "cosplay"]),
    ("game", ["電玩", "遊戲展", "電競"]),
    ("run", ["路跑", "馬拉松", "夜跑"]),
    ("experience", ["浮潛", "衝浪", "滑水", "獨木舟", "立槳", "SUP", "潛水", "攀岩", "飛行傘", "熱氣球", "泛舟", "溯溪"]),
    ("pet", ["寵物", "貓咪", "狗狗", "犬"]),
    ("family", ["親子", "兒童", "闖關"]),
    ("outdoor", ["戶外", "登山", "健行", "露營", "賞鳥"]),
    ("food", ["美食", "餐酒", "啤酒節", "小吃"]),
    ("market", ["市集", "園遊會", "園游會", "早市", "農夫市集"]),
    ("creative", ["文創", "手作", "工藝", "設計展"]),
    ("talk", ["講座", "論壇", "研討會", "工作坊", "課程", "研習", "營隊", "培訓"]),
    ("festival", ["節慶", "祭典", "嘉年華"]),
    ("exhibition", ["展覽", "特展", "美術", "博物館", "畫展"]),
]

DEFAULT_CATEGORY = "exhibition"


def detect_category(title: str, raw_category: str | None) -> str:
    text = f"{title or ''} {raw_category or ''}"
    for cat_key, keywords in CATEGORY_RULES:
        for kw in keywords:
            if kw and kw in text:
                return cat_key
    return DEFAULT_CATEGORY
