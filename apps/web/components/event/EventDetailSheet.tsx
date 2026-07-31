"use client";

import { useEffect, useState } from "react";
import { CATEGORY_LABELS, type NormalizedEvent } from "@/types/event";
import { isFavorite, toggleFavorite, getAttendedMap, toggleAttended, getFavoriteIds } from "@/lib/storage";
import { downloadIcs } from "@/lib/calendar";
import { formatEventDateRange, isMultiDayEvent } from "@/lib/format";
import { haversineKm, getCurrentPosition } from "@/lib/geo";
import type { CandidateEvent } from "@/types/ai";

function toCandidate(e: NormalizedEvent, distanceKm: number | null): CandidateEvent {
  return {
    id: e.id, title: e.title, city: e.city, region: e.region, category: e.category,
    start: e.start, end: e.end, isFree: e.isFree, lat: e.lat, lon: e.lon,
    distanceKm, isMultiDay: isMultiDayEvent(e),
    suitableFor: e.ai.suitableFor, estimatedStayMinutes: e.ai.estimatedStayMinutes,
    hasAircon: e.ai.hasAircon,
  };
}

export default function EventDetailSheet({
  event,
  onClose,
}: {
  event: NormalizedEvent;
  onClose: () => void;
}) {
  const [fav, setFav] = useState(false);
  const [attended, setAttended] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setFav(isFavorite(event.id));
    setAttended(!!getAttendedMap()[event.id]);
  }, [event.id]);

  async function askAi() {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(null);
    try {
      let distanceKm: number | null = null;
      try {
        const loc = await getCurrentPosition();
        if (event.lat != null && event.lon != null) {
          distanceKm = Math.round(haversineKm(loc.lat, loc.lon, event.lat, event.lon) * 10) / 10;
        }
      } catch {
        // 沒有定位權限就不附距離，AI 問答本身還是能正常運作
      }
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          now: new Date().toISOString(),
          favoriteEventIds: getFavoriteIds(),
          candidateEvents: [toCandidate(event, distanceKm)],
          focusEventId: event.id,
        }),
      });
      if (!res.ok) throw new Error("AI 服務暫時無法使用");
      const data = await res.json();
      setAnswer(data.ask?.answer || data.replyText || "（AI 沒有回覆內容）");
    } catch (err) {
      setAnswer(err instanceof Error ? err.message : "發生錯誤");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl bg-surface p-5 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-neutral-200" />
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-neutral-100 text-neutral-600">{event.city}</span>
          <span className="text-xs text-neutral-500">{CATEGORY_LABELS[event.category]}</span>
          {isMultiDayEvent(event) && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
              長期展出
            </span>
          )}
          <button
            className={`ml-auto text-xl leading-none transition-transform active:scale-90 ${fav ? "text-rose-500" : "text-neutral-300"}`}
            onClick={() => setFav(toggleFavorite(event.id).includes(event.id))}
          >
            {fav ? "♥" : "♡"}
          </button>
        </div>
        <h2 className="text-lg font-bold mb-1 text-neutral-900">{event.title}</h2>
        <p className="text-sm text-neutral-500 mb-4">{event.venue || event.address || "詳見官方資訊"}</p>

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm bg-surface-hi rounded-xl p-3 mb-4">
          <span className="text-neutral-500">時間</span>
          <span className="text-neutral-800">{formatEventDateRange(event)}</span>
          <span className="text-neutral-500">地點</span>
          <span className="text-neutral-800">{event.venue || event.address || "詳見官方資訊"}</span>
          <span className="text-neutral-500">費用</span>
          <span className="text-neutral-800">{event.isFree ? "免費" : event.price}</span>
          <span className="text-neutral-500">空調</span>
          <span className="text-neutral-800">{event.ai.hasAircon === null ? "不確定" : event.ai.hasAircon ? "有" : "無"}</span>
          <span className="text-neutral-500">預估停留</span>
          <span className="text-neutral-800">約 {event.ai.estimatedStayMinutes} 分鐘</span>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 mb-4">
          <div className="text-xs font-bold text-indigo-600 mb-2">✦ AI 重點整理</div>
          <ul className="list-disc list-inside text-sm space-y-1.5 text-neutral-700">
            {event.ai.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          {event.ai.recommendReason && (
            <p className="text-sm text-amber-700 mt-3">💡 {event.ai.recommendReason}</p>
          )}
          {event.ai.suitableFor.length > 0 && (
            <p className="text-xs text-neutral-500 mt-2">適合：{event.ai.suitableFor.join("、")}</p>
          )}
          {event.aiSource !== "gemini" && (
            <p className="text-[11px] text-neutral-400 mt-3 border-t border-indigo-100 pt-2">
              這份摘要還沒排到真正的 AI 整理，下次自動更新時會補上完整版本
            </p>
          )}
        </div>

        <div className="mb-4">
          <div className="text-xs font-bold text-neutral-500 mb-2">問 AI 關於這個活動</div>
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askAi()}
              placeholder="例如：有冷氣嗎？適合情侶嗎？"
              className="flex-1 rounded-lg bg-surface-hi px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent text-neutral-800"
            />
            <button
              onClick={askAi}
              disabled={asking}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white disabled:opacity-50 active:scale-95 transition-transform"
            >
              {asking ? "詢問中…" : "問"}
            </button>
          </div>
          {answer && <p className="text-sm text-neutral-700 mt-2 bg-surface-hi rounded-lg p-3">{answer}</p>}
        </div>

        <button
          onClick={() => downloadIcs(event)}
          className="block w-full rounded-xl bg-surface-hi py-3 text-sm font-bold text-neutral-700 active:scale-95 transition-transform"
        >
          📥 加入行事曆
        </button>
        {event.lat != null && event.lon != null && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lon}`}
            target="_blank" rel="noopener noreferrer"
            className="block w-full rounded-xl bg-surface-hi py-3 text-sm font-bold text-center text-neutral-700 mt-2 active:scale-95 transition-transform"
          >
            🧭 導航
          </a>
        )}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setAttended(!!toggleAttended(event.id)[event.id])}
            className={`flex-1 rounded-xl py-3 text-sm font-bold active:scale-95 transition-transform ${attended ? "bg-accent text-white" : "bg-surface-hi text-neutral-700"}`}
          >
            {attended ? "✔ 已標記參加" : "標記已參加"}
          </button>
          {event.url && (
            <a href={event.url} target="_blank" rel="noopener noreferrer"
               className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-white text-center active:scale-95 transition-transform">
              官方資訊
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
