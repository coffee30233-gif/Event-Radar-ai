// 行事曆相關工具：下載 .ics（給 Apple 日曆/Outlook 用）。
// Google 日曆連結功能已依你的要求移除，只留 .ics 下載。
import type { NormalizedEvent } from "@/types/event";

function toUtcStamp(iso: string): string {
  const withoutMs = new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
  return `${withoutMs}Z`;
}

export function downloadIcs(event: NormalizedEvent): void {
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
    `UID:${event.id}@event-radar-ai`,
    `DTSTART:${toUtcStamp(event.start)}`,
    `DTEND:${toUtcStamp(event.end)}`,
    `SUMMARY:${event.title}`,
    `LOCATION:${event.venue || event.address}`,
    `DESCRIPTION:${event.ai.bullets.join(" / ")}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${event.title}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}
