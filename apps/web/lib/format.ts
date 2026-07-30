// 活動時間顯示的共用邏輯。
//
// 修正一個實際發生過的顯示問題：長期展覽（例如「展期橫跨 2026 全年度」這種活動，
// start=2026-01-01、end=2026-12-31）如果直接用「開始時間 - 結束時間」的格式顯示，
// 因為畫面只印結束時間的「時間」部分沒印日期，會變成「2026/1/1 19:00 - 19:00」，
// 看起來像是同一天開始又結束、甚至像是已經過期的活動，其實它是還在展出中的長期展覽。
// 這裡統一判斷「是不是跨很多天的活動」，是的話用日期區間顯示，不是的話才用原本的
// 「今天/明天 HH:mm」格式。
import type { NormalizedEvent } from "@/types/event";

const MULTI_DAY_THRESHOLD_DAYS = 2; // 開始跟結束差超過這幾天，視為「長期活動」而非單場活動

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

export function isMultiDayEvent(event: NormalizedEvent): boolean {
  const start = new Date(event.start);
  const end = new Date(event.end);
  return daysBetween(start, end) >= MULTI_DAY_THRESHOLD_DAYS;
}

function fmtMD(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 卡片上顯示的簡短時間文字。 */
export function formatEventWhen(event: NormalizedEvent, now: Date): string {
  const start = new Date(event.start);
  const end = new Date(event.end);

  if (isMultiDayEvent(event)) {
    const ongoing = start <= now && end >= now;
    return ongoing ? `展期中・至 ${fmtMD(end)}` : `${fmtMD(start)} 起・至 ${fmtMD(end)}`;
  }

  const sameDay = start.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = start.toDateString() === tomorrow.toDateString();

  if (sameDay) return `今天 ${fmtHM(start)}`;
  if (isTomorrow) return `明天 ${fmtHM(start)}`;
  return `${fmtMD(start)} ${fmtHM(start)}`;
}

/** 活動詳情頁「時間」那一列的完整文字。 */
export function formatEventDateRange(event: NormalizedEvent): string {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const localeOpts: Intl.DateTimeFormatOptions = { hour12: false };

  if (isMultiDayEvent(event)) {
    return `${start.toLocaleDateString("zh-TW")} - ${end.toLocaleDateString("zh-TW")}（長期展出）`;
  }
  return `${start.toLocaleString("zh-TW", localeOpts)} - ${end.toLocaleString("zh-TW", localeOpts)}`;
}
