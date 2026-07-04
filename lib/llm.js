/**
 * llm.js — provider-agnostic LLM client.
 *
 * Phase 1 ships a single provider (Gemini) by design. The rest of the codebase
 * only ever touches the small interface returned by createLLMClient():
 *
 *   client.generateText(prompt, { system })  -> Promise<string>
 *   client.generateJSON(prompt, { system })  -> Promise<string>  (raw JSON text)
 *
 * Adding Anthropic or OpenAI later means writing one more create*Client()
 * function and a branch below — no caller has to change.
 */

import { GoogleGenAI } from "@google/genai";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Create an LLM client for the configured provider.
 * Provider is chosen by the LLM_PROVIDER env var (defaults to "gemini").
 */
export function createLLMClient({ provider } = {}) {
  const chosen = provider || process.env.LLM_PROVIDER || "gemini";
  switch (chosen) {
    case "gemini":
      return createGeminiClient();
    default:
      throw new Error(
        `Unsupported LLM provider: "${chosen}". Only "gemini" is implemented.`,
      );
  }
}

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set (add it to .env.local).");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  async function call(prompt, { system, json, temperature } = {}) {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        ...(system ? { systemInstruction: system } : {}),
        ...(json ? { responseMimeType: "application/json" } : {}),
        ...(temperature != null ? { temperature } : {}),
      },
    });
    const text = response.text;
    if (text == null || text === "") {
      throw new Error("LLM returned an empty response.");
    }
    return text;
  }

  return {
    provider: "gemini",
    model,
    /** Free-text generation (the answer call). */
    generateText: (prompt, opts = {}) => call(prompt, { ...opts, json: false }),
    /** JSON-mode generation (the analysis call). Returns raw JSON text. */
    generateJSON: (prompt, opts = {}) => call(prompt, { ...opts, json: true }),
  };
}
