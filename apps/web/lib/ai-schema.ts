// Gemini responseSchema：定義 /api/ai 單次呼叫要回傳的 JSON 結構。
// 四個結果欄位（search/plan/recommend/ask）都用 anyOf [null, object] 表示「可能不存在」，
// 對應 docs/03-AI-CONTRACTS.md 第 5 節的設計。

export const AI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["search", "plan", "recommend", "ask", "restaurant"],
      description: "使用者這句話屬於哪一種意圖",
    },
    replyText: {
      type: "string",
      description: "一律要填，給使用者看的自然語言回覆",
    },
    search: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            matchedEventIds: { type: "array", items: { type: "string" } },
            filters: {
              type: "object",
              properties: {
                city: { type: "string" },
                region: { type: "string" },
                category: { type: "string" },
                freeOnly: { type: "boolean" },
              },
            },
          },
          required: ["matchedEventIds", "filters"],
        },
      ],
    },
    plan: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            timeline: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  time: { type: "string" },
                  title: { type: "string" },
                  eventId: { anyOf: [{ type: "string" }, { type: "null" }] },
                  note: { type: "string" },
                },
                required: ["time", "title", "eventId", "note"],
              },
            },
          },
          required: ["timeline"],
        },
      ],
    },
    recommend: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            picks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  eventId: { type: "string" },
                  reasons: { type: "array", items: { type: "string" } },
                },
                required: ["eventId", "reasons"],
              },
            },
          },
          required: ["picks"],
        },
      ],
    },
    ask: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
        },
      ],
    },
    restaurant: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            picks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  cuisine: { type: "string" },
                  priceRange: { type: "string" },
                  areaHint: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["name", "cuisine", "priceRange", "areaHint", "reason"],
              },
            },
            disclaimer: { type: "string" },
          },
          required: ["picks", "disclaimer"],
        },
      ],
    },
  },
  required: ["intent", "replyText", "search", "plan", "recommend", "ask", "restaurant"],
} as const;
