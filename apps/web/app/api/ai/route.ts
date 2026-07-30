// 唯一的 AI 端點。判斷 intent（search/plan/recommend/ask）並在同一次 Gemini 呼叫裡
// 回傳對應結果。合約見 docs/03-AI-CONTRACTS.md。
import { NextResponse } from "next/server";
import { generateStructured } from "@/lib/gemini";
import { AI_RESPONSE_SCHEMA } from "@/lib/ai-schema";
import { AI_SYSTEM_INSTRUCTION, buildUserContent } from "@/lib/ai-prompt";
import type { AiRequest, AiResponse, AiErrorResponse, CandidateEvent } from "@/types/ai";

// 防呆：即使前端邏輯有誤傳了過大的候選清單，這裡也只取離現在最近的 N 筆送進 Gemini，
// 避免單次呼叫過貴、過慢。見 docs/03-AI-CONTRACTS.md 第 3 節。
const MAX_CANDIDATE_EVENTS = 60;

function isValidCandidateEvent(v: unknown): v is CandidateEvent {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.title === "string" && typeof e.start === "string";
}

function capCandidates(events: CandidateEvent[], now: string): CandidateEvent[] {
  const nowMs = Date.parse(now);
  return [...events]
    .filter((e) => Date.parse(e.end) >= nowMs) // 已結束的活動不用送給 AI 判斷
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, MAX_CANDIDATE_EVENTS);
}

export async function POST(request: Request) {
  let body: AiRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<AiErrorResponse>({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json<AiErrorResponse>({ error: "message is required" }, { status: 400 });
  }
  if (!body.now || Number.isNaN(Date.parse(body.now))) {
    return NextResponse.json<AiErrorResponse>({ error: "now must be a valid ISO timestamp" }, { status: 400 });
  }
  if (!Array.isArray(body.candidateEvents) || !body.candidateEvents.every(isValidCandidateEvent)) {
    return NextResponse.json<AiErrorResponse>({ error: "candidateEvents is invalid" }, { status: 400 });
  }

  const cappedRequest: AiRequest = {
    ...body,
    candidateEvents: capCandidates(body.candidateEvents, body.now),
  };

  try {
    const result = await generateStructured<AiResponse>({
      systemInstruction: AI_SYSTEM_INSTRUCTION,
      userContent: buildUserContent(cappedRequest),
      responseSchema: AI_RESPONSE_SCHEMA,
    });

    return NextResponse.json(result.data, {
      headers: { "X-Gemini-Model": result.modelUsed, "X-Gemini-Fallback-Depth": String(result.fallbackDepth) },
    });
  } catch (err) {
    console.error("[/api/ai] Gemini 呼叫全部失敗", err);
    return NextResponse.json<AiErrorResponse>({ error: "AI service unavailable" }, { status: 503 });
  }
}
