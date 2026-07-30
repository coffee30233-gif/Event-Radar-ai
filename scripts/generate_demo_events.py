#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_demo_events.py
========================================================
產生一份「示範用」events.json，讓你在真正的 collector 資料還沒接上／
GitHub Actions 還沒成功跑過一次之前，可以先看到完整的網站功能（首頁、
地圖、行事曆、收藏、AI 搜尋）長什麼樣子。

⚠️ 這裡的活動全部是虛構的示範資料，不是真實活動，sources 欄位標成
   ["demo"] 以便跟真實資料明顯區分。日期是「執行當下」往後推算的，
   所以每次重跑這支腳本，活動時間都會自動往後移，看起來像是「最近」的活動。

使用方式：
    python3 scripts/generate_demo_events.py --out apps/web/public/events.json

跟正式的 scripts/pipeline.py 是兩支完全獨立的腳本，不會互相干擾——
等 pipeline.py 真的成功跑過一次、產生真實資料後，直接重新執行 pipeline
覆蓋掉這份示範資料即可，不需要額外清理步驟。
========================================================
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone

TZ = timezone(timedelta(hours=8))


def iso(dt: datetime) -> str:
    return dt.isoformat()


def make_event(
    idx: int,
    title: str,
    city: str,
    region: str,
    venue: str,
    lat: float,
    lon: float,
    category: str,
    day_offset: int,
    start_hour: int,
    start_minute: int,
    duration_hours: float,
    price: str,
    is_free: bool,
    popularity: int,
    bullets: list[str],
    reason: str,
    suitable_for: list[str],
    stay_minutes: int,
    has_aircon: bool | None,
    now: datetime,
) -> dict:
    start = now.replace(hour=start_hour, minute=start_minute, second=0, microsecond=0) + timedelta(days=day_offset)
    end = start + timedelta(hours=duration_hours)
    return {
        "id": f"demo-{idx:03d}",
        "title": title,
        "city": city,
        "region": region,
        "address": venue,
        "venue": venue,
        "lat": lat,
        "lon": lon,
        "category": category,
        "start": iso(start),
        "end": iso(end),
        "price": price,
        "isFree": is_free,
        "url": "https://example.com/demo-event",
        "sources": ["demo"],
        "popularityScore": popularity,
        "contentHash": f"demo-hash-{idx:03d}",
        "ai": {
            "bullets": bullets,
            "recommendReason": reason,
            "suitableFor": suitable_for,
            "estimatedStayMinutes": stay_minutes,
            "hasAircon": has_aircon,
        },
        "updatedAt": iso(now),
    }


def build_events(now: datetime) -> list[dict]:
    return [
        make_event(1, "大稻埕河岸煙火之夜", "台北市", "北部", "台北市大同區民生西路底（大稻埕碼頭）",
                   25.0554, 121.5095, "fireworks", 0, 20, 0, 0.5, "免費入場", True, 92,
                   ["煙火施放時間為晚間20:00起約30分鐘", "河堤區席地而坐，建議提前2小時占位", "雨天原地順延一日"],
                   "夏夜限定的河岸煙火，適合傍晚就去吃小吃、佔位子看夜景", ["約會", "朋友聚會"], 90, False, now),
        make_event(2, "淡水漁人碼頭火舞表演", "新北市", "北部", "新北市淡水區漁人碼頭",
                   25.1785, 121.4079, "firedance", 0, 19, 30, 0.75, "免費入場", True, 78,
                   ["情人橋畔火舞表演，配合夕陽時段演出", "表演約45分鐘，含互動橋段", "現場席地區域有限"],
                   "夕陽配火舞，情侶約會的經典路線", ["約會"], 75, False, now),
        make_event(3, "海浪男孩夏夜演唱會", "台北市", "北部", "台北市信義區大巨蛋園區",
                   25.0453, 121.5610, "concert", 1, 19, 0, 3.0, "$1,200起", False, 95,
                   ["開場嘉賓19:00演出，主秀約19:45開始", "現場開放少量周邊商品販售", "入場採電子票證"],
                   "今年最受矚目的夏季戶外演唱會之一", ["朋友聚會", "約會"], 180, False, now),
        make_event(4, "華山文創市集", "台北市", "北部", "台北市中正區華山1914文創園區",
                   25.0443, 121.5296, "market", 1, 11, 0, 8.0, "免費入場", True, 70,
                   ["近80組手作與選物品牌參與", "週末場加開街頭表演", "園區內用餐選擇多"],
                   "適合安排半日行程，慢慢逛慢慢吃", ["朋友聚會", "一日遊"], 120, None, now),
        make_event(5, "台中國家歌劇院當代雕塑展", "台中市", "中部", "台中市西屯區台中國家歌劇院",
                   24.1651, 120.6415, "exhibition", 2, 10, 0, 8.0, "$280", False, 60,
                   ["匯集10位當代藝術家的雕塑創作", "假日提供免費導覽，整點一場", "建築本身也是知名打卡景點"],
                   "展覽跟建築本身都很值得慢慢看", ["獨自前往", "朋友聚會"], 90, True, now),
        make_event(6, "中壢觀光夜市美食週", "桃園市", "北部", "桃園市中壢區中原夜市",
                   24.9587, 121.2469, "nightmarket", 0, 17, 0, 6.0, "依攤位計價", False, 65,
                   ["集結12個在地特色攤位快閃進駐", "美食護照集章可兌換折價券", "為期兩週的活動本日為第3天"],
                   "在地小吃控不要錯過", ["朋友聚會", "家人"], 90, None, now),
        make_event(7, "花蓮鯉魚潭星空音樂會", "花蓮縣", "東部", "花蓮縣壽豐鄉鯉魚潭",
                   23.8763, 121.5237, "musicfest", 3, 19, 0, 2.5, "$500", False, 55,
                   ["湖畔草地席地而坐的戶外音樂會", "邀請多組獨立樂團演出", "自備野餐墊與防蚊液"],
                   "遠離城市光害，適合安排花東小旅行順道參加", ["約會", "一日遊"], 150, False, now),
        make_event(8, "板橋435藝文特區草地電影院", "新北市", "北部", "新北市板橋區435藝文特區",
                   25.0125, 121.4590, "family", 1, 18, 30, 2.5, "免費入場", True, 58,
                   ["本場播映闔家動畫片，映前有兒童手偶表演", "園區內可推嬰兒車、有廁所與飲水機", "建議提早入場占草地"],
                   "適合帶小朋友的免費親子夜晚", ["親子", "家人"], 120, None, now),
        make_event(9, "內湖運動公園全民路跑體驗營", "台北市", "北部", "台北市內湖區內湖運動公園",
                   25.0826, 121.5877, "run", 2, 7, 0, 2.5, "$200", False, 50,
                   ["適合初學者的3K輕量體驗路線，教練隨隊陪跑", "完成者提供運動毛巾一條", "現場備有免費熱身伸展課程"],
                   "新手友善的路跑活動，順便運動流汗", ["獨自前往", "朋友聚會"], 90, None, now),
        make_event(10, "台南國華街深夜食堂美食祭", "台南市", "南部", "台南市中西區國華街商圈",
                   22.9963, 120.2010, "food", 0, 18, 0, 5.0, "依攤位計價", False, 82,
                   ["台南在地20年以上老店聯合擺攤", "現場提供限量古早味點心", "營業至深夜11點"],
                   "台南美食一次吃透透的好機會", ["朋友聚會", "家人"], 120, None, now),
        make_event(11, "新竹護城河中元水燈遊行", "新竹市", "北部", "新竹市北區護城河親水公園",
                   24.8047, 120.9686, "lantern", 4, 18, 0, 3.5, "免費參加", True, 88,
                   ["傳統水燈遊行路線由城隍廟出發，晚間6點集合", "沿河設置百餘座燈飾造景，21:00熄燈", "活動當晚周邊交通管制"],
                   "百年傳統民俗祭典，適合帶長輩一起參加", ["家人", "一日遊"], 150, None, now),
        make_event(12, "高雄駁二動漫祭", "高雄市", "南部", "高雄市鹽埕區駁二藝術特區",
                   22.6203, 120.2825, "anime", 3, 11, 0, 8.0, "$300（一日票）", False, 90,
                   ["多家遊戲廠商新作試玩，現場排隊發放號碼牌", "Cosplay大賽決賽於下午2點開始", "會場周邊攤位同步開放同人誌販售"],
                   "南部規模最大的動漫活動之一", ["朋友聚會"], 240, True, now),
        make_event(13, "鶯歌陶瓷老街手作體驗市集", "新北市", "北部", "新北市鶯歌區陶瓷老街",
                   24.9540, 121.3536, "creative", 2, 10, 0, 8.0, "體驗費用$150起", False, 62,
                   ["近30間工作室聯合開放拉坏、彩繪體驗攤位", "假日人潮多，熱門體驗建議提前一小時排隊", "部分作品需等待窯燒"],
                   "適合親子或情侶一起動手做點什麼", ["親子", "約會"], 120, None, now),
        make_event(14, "台中貓咪領養暨寵物友善市集", "台中市", "中部", "台中市西區美術園道",
                   24.1577, 120.6544, "pet", 5, 10, 0, 6.0, "免費參觀", True, 48,
                   ["聯合5個動物保護團體開放現場領養", "領養前需完成簡易資格審查與飼養說明", "現場同步販售寵物友善市集攤位"],
                   "想養毛小孩或單純想擼貓都適合來看看", ["寵物", "家人"], 90, None, now),
        make_event(15, "陽明山夏季賞蝶生態導覽", "台北市", "北部", "台北市北投區陽明山國家公園",
                   25.1552, 121.5599, "outdoor", 6, 8, 0, 3.0, "$150（兒童$80）", False, 40,
                   ["由生態解說員帶隊，適合親子共同參與", "建議自備望遠鏡，現場亦有少量租借", "全程約3小時，含步道健行"],
                   "夏天早上去正好，回程前中午前就結束", ["親子", "家人", "戶外"], 180, None, now),
        make_event(16, "桃園科學園區職涯發展講座", "桃園市", "北部", "桃園市中壢區中央大學國際會議廳",
                   24.9683, 121.1954, "talk", 4, 14, 0, 3.0, "免費（需報名）", True, 35,
                   ["講者陣容含三位科學園區資深研發主管", "座位有限採線上報名，現場保留少量候補名額", "會後保留30分鐘一對一交流時段"],
                   "對半導體/科技業職涯有興趣可以來聽聽", ["獨自前往"], 150, True, now),
        make_event(17, "林口三井Outlet夏日水花園祭", "新北市", "北部", "新北市林口區三井Outlet",
                   25.0777, 121.3915, "mall", 1, 10, 0, 10.0, "免費入場（設施另計）", True, 68,
                   ["戶外廣場設置大型戲水裝置與摩天輪限定燈光秀", "每整點噴水秀約5分鐘", "園區周邊有免費接駁車往返捷運站"],
                   "商場逛街兼消暑，小孩玩水大人購物兩相宜", ["親子", "家人"], 180, True, now),
        make_event(18, "台北信義區快閃書店市集", "台北市", "北部", "台北市信義區信義商圈廣場",
                   25.0340, 121.5645, "popup", 0, 12, 0, 8.0, "免費入場", True, 45,
                   ["聯合10家獨立書店快閃三天，本日為最終日", "同步舉辦二手書交換活動", "現場提供借閱野餐墊服務"],
                   "只有今天，錯過就要等下次巡迴", ["獨自前往", "朋友聚會"], 60, None, now),
    ]


def main():
    ap = argparse.ArgumentParser(description="產生示範用 events.json（虛構活動，方便先測試網站功能）")
    ap.add_argument("--out", default="apps/web/public/events.json", help="輸出檔案路徑")
    args = ap.parse_args()

    now = datetime.now(TZ)
    events = build_events(now)
    events.sort(key=lambda e: e["start"])

    output = {
        "generatedAt": now.isoformat(),
        "sources": ["demo"],
        "eventCount": len(events),
        "events": events,
    }

    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"已產生 {len(events)} 筆示範活動到 {out_path}")
    print("⚠️ 這是虛構的示範資料（sources=['demo']），等真正的 pipeline 成功跑過一次後，")
    print("   直接重新執行 scripts/pipeline.py 覆蓋掉這份檔案即可。")


if __name__ == "__main__":
    main()
