/**
 * POST /api/live — run one policy question live through Gemini.
 *
 * Server-only: the API key never leaves this process. Accepts a questionId from
 * the fixed question set (no free-text, to keep the surface controlled), runs
 * the shared answer + analysis pipeline, and returns the answer plus detected
 * institution mentions. A small in-memory rate limit protects the API budget.
 */

import { NextResponse } from "next/server";
import { createLLMClient } from "../../../lib/llm.js";
import { answerAndAnalyze } from "../../../lib/analyze.js";
import questionSet from "../../../scripts/questions.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rate limit: at most MAX_PER_WINDOW live queries per rolling WINDOW_MS.
// Process-global (single instance) — enough to protect the budget in this demo;
// a multi-instance deploy would move this to a shared store.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const recentHits: number[] = [];

function rateLimited(now: number): boolean {
  while (recentHits.length > 0 && now - recentHits[0] > WINDOW_MS) {
    recentHits.shift();
  }
  return recentHits.length >= MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const now = Date.now();
  if (rateLimited(now)) {
    return NextResponse.json(
      { error: `Rate limit reached (${MAX_PER_WINDOW}/min). Please wait a moment.` },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const questionId =
    body && typeof body === "object" ? (body as { questionId?: unknown }).questionId : undefined;
  const question = questionSet.questions.find((q) => q.id === questionId);
  if (!question) {
    return NextResponse.json({ error: "Unknown question id." }, { status: 400 });
  }

  // Reserve a slot only once we know we'll make a real call.
  recentHits.push(now);

  try {
    const llm = createLLMClient();
    const { rawAnswer, mentions } = await answerAndAnalyze(
      llm,
      question.text,
      questionSet.competitors,
    );
    return NextResponse.json({
      question: { id: question.id, domain: question.domain, text: question.text },
      model: llm.model,
      answer: rawAnswer,
      mentions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Live query failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
