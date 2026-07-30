"""把多個來源的 NormalizedEvent 清單合併成一份。
目前只是單純串接（normalize 階段已經替每筆事件標好 sources），真正的去重
留給 scripts/dedupe/dedupe.py 處理，這裡故意保持單純。
"""
from scripts.normalize.schema import NormalizedEvent


def merge_events(*event_lists: list[NormalizedEvent]) -> list[NormalizedEvent]:
    merged: list[NormalizedEvent] = []
    for events in event_lists:
        merged.extend(events)
    return merged
