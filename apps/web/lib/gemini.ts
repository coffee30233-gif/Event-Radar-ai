// Gemini client，server-only（絕對不能被 import 進任何 client component / 前端 bundle）。
// 三層 fallback：gemini-3.6-flash → gemini-3.5-flash → gemini-3.1-flash-lite
// 詳見 docs/01-ARCHITECTURE.md 第 6.3 節、docs/03-AI-CONTRACTS.md 第 6 節。

import "server-only";
import { GoogleGenAI } from "@google/genai";

export const MODEL_CHAIN = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
] as const;

export type GeminiModel = (typeof MODEL_CHAIN)[number];

let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY 未設定。請在 apps/web/.env.local 裡設定（本機開發），" +
        "或在 Vercel 專案的環境變數裡設定（正式部署）。"
    );
  }
  if (!_client) {
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export interface GenerateStructuredOptions {
  systemInstruction: string;
  userContent: string;
  responseSchema: object;
}

export interface GenerateStructuredResult<T> {
  data: T;
  modelUsed: GeminiModel;
  fallbackDepth: number; // 0 = 用主要模型就成功，1 = 降級一次，2 = 降級兩次
}

/**
 * 依 MODEL_CHAIN 順序嘗試呼叫 Gemini，第一層失敗（逾時/5xx/額度超過/內容被擋）
 * 就換下一層，全部失敗才丟出例外。呼叫端（route.ts）負責把例外轉成 503。
 */
export async function generateStructured<T>(
  opts: GenerateStructuredOptions
): Promise<GenerateStructuredResult<T>> {
  const client = getClient();
  let lastError: unknown = null;

  for (const [i, model] of MODEL_CHAIN.entries()) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: opts.userContent,
        config: {
          systemInstruction: opts.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: opts.responseSchema,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error(`${model} 回傳空內容`);
      }

      const data = JSON.parse(text) as T;
      if (i > 0) {
        console.warn(`[gemini] 已降級到第 ${i + 1} 層模型：${model}`);
      }
      return { data, modelUsed: model, fallbackDepth: i };
    } catch (err) {
      lastError = err;
      console.warn(`[gemini] ${model} 失敗，${i < MODEL_CHAIN.length - 1 ? "嘗試下一層" : "已無下一層"}`, err);
      continue;
    }
  }

  throw new Error(
    `所有 Gemini 模型皆失敗（${MODEL_CHAIN.join(" → ")}）。最後錯誤：${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
