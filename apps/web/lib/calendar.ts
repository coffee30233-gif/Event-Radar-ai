// 行事曆相關工具：下載 .ics（給 Apple 日曆/Outlook 用）+ Google 日曆連結。
//
// Google 日曆這邊刻意選「網址帶參數開啟 Google 日曆的新增活動頁面」這個做法
// （https://calendar.google.com/calendar/render?action=TEMPLATE&...），
// 不做 Google OAuth 登入串接。理由：OAuth 需要 Google Cloud 專案、用戶端密鑰、
// 登入流程、token 保存，這些都跟「自己用、盡量簡單、不做登入」的原則衝突。
// render 連結不需要任何金鑰或登入設定，使用者點了之後 Google 日曆會開啟一個
// 預先填好活動資訊的新增畫面，使用者按「儲存」就完成了，體驗上已經很順，
// 只是需要使用者自己按一下確認（不是全自動寫入），這是有意的取捨。
import type { NormalizedEvent } from "@/types/event";

function toUtcStamp(iso: string): string {
  const withoutMs = new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
  return `${withoutMs}Z`;
}

export function googleCalendarUrl(event: NormalizedEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toUtcStamp(event.start)}/${toUtcStamp(event.end)}`,
    details: event.ai.bullets.join("\n") + (event.url ? `\n\n官方資訊：${event.url}` : ""),
    location: event.venue || event.address,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
