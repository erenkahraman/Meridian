/**
 * collect.js — Meridian data-collection engine (Phase 2).
 *
 * For each policy question it makes TWO LLM calls:
 *   1. Answer call     — asks the question plainly, captures the raw answer.
 *   2. Analysis call   — feeds that answer back and extracts, as strict JSON,
 *                        which tracked institutions are mentioned, their order,
 *                        whether each is backed by a specific publication, and a
 *                        short context snippet.
 * Results are written to Supabase (one `runs` row, plus `responses` and
 * `mentions`), and a full artifact is saved locally for inspection.
 *
 * Usage:
 *   node scripts/collect.js                 # first 5 questions, writes to Supabase
 *   node scripts/collect.js --limit 5       # explicit count
 *   node scripts/collect.js --all           # every question
 *   node scripts/collect.js --dry-run       # no DB write, print + save artifact only
 *   node scripts/collect.js --notes "..."   # label the run
 *
 * Requires .env.local with GEMINI_API_KEY (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * unless --dry-run).
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createLLMClient } from "../lib/llm.js";
import { createSupabaseClient } from "../lib/supabase.js";
import { answerAndAnalyze } from "../lib/analyze.js";
import { qaDiscrepancies } from "../lib/qa.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* Env + config                                                        */
/* ------------------------------------------------------------------ */

// Load .env.local (falling back to .env) into process.env.
for (const file of [".env.local", ".env"]) {
  const path = join(HERE, "..", file);
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

const { values: args } = parseArgs({
  options: {
    limit: { type: "string", default: "5" },
    all: { type: "boolean", default: false },
    ids: { type: "string" }, // comma-separated question ids (overrides limit/all)
    "dry-run": { type: "boolean", default: false },
    notes: { type: "string" },
  },
});

const DRY_RUN = args["dry-run"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE_MS = 1000; // gentle pacing between questions

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

async function writeToSupabase(supabase, { llm, questionCount, records }) {
  const { data: run, error: runErr } = await supabase
    .from("runs")
    .insert({
      model: llm.model,
      provider: llm.provider,
      question_count: questionCount,
      notes: args.notes ?? null,
    })
    .select()
    .single();
  if (runErr) throw new Error(`Failed to create run: ${runErr.message}`);

  for (const rec of records) {
    const { data: resp, error: respErr } = await supabase
      .from("responses")
      .insert({
        run_id: run.id,
        question_id: rec.questionId,
        domain: rec.domain,
        question_text: rec.questionText,
        raw_answer: rec.rawAnswer,
      })
      .select()
      .single();
    if (respErr)
      throw new Error(`Failed to save response ${rec.questionId}: ${respErr.message}`);

    if (rec.mentions.length > 0) {
      const { error: memErr } = await supabase.from("mentions").insert(
        rec.mentions.map((m) => ({
          response_id: resp.id,
          institution: m.institution,
          position: m.position,
          cites_publication: m.citesPublication,
          context: m.context,
        })),
      );
      if (memErr)
        throw new Error(
          `Failed to save mentions for ${rec.questionId}: ${memErr.message}`,
        );
    }
  }
  return run.id;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const questionSet = JSON.parse(
    readFileSync(join(HERE, "questions.json"), "utf8"),
  );
  const institutions = questionSet.competitors;

  // Select questions: explicit --ids wins, else --all, else first --limit.
  let questions;
  if (args.ids) {
    const byId = new Map(questionSet.questions.map((q) => [q.id, q]));
    questions = args.ids.split(",").map((raw) => {
      const id = raw.trim();
      const q = byId.get(id);
      if (!q) throw new Error(`Unknown question id in --ids: "${id}"`);
      return q;
    });
  } else {
    const limit = args.all ? questionSet.questions.length : Number(args.limit);
    questions = questionSet.questions.slice(0, limit);
  }

  const llm = createLLMClient();
  console.log(
    `Meridian collector — provider=${llm.provider} model=${llm.model} ` +
      `questions=${questions.length}${DRY_RUN ? " (DRY RUN)" : ""}\n`,
  );

  const records = [];
  const failures = [];

  for (const [idx, q] of questions.entries()) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`[${idx + 1}/${questions.length}] ${q.id} (${q.domain})`);
    console.log(`Q: ${q.text}`);
    try {
      // Shared pipeline (answer + temperature-0 structured analysis).
      const { rawAnswer, rawAnalysis, mentions } = await answerAndAnalyze(
        llm,
        q.text,
        institutions,
      );

      // Independent regex cross-check: institutions the regex found in the raw
      // answer that the LLM did NOT extract. Flag only — scores are untouched.
      const qaFlags = qaDiscrepancies(
        rawAnswer,
        mentions.map((m) => m.institution),
        institutions,
      );

      records.push({
        questionId: q.id,
        domain: q.domain,
        questionText: q.text,
        rawAnswer,
        rawAnalysis,
        mentions,
        qaFlags,
      });

      const preview =
        rawAnswer.length > 500 ? rawAnswer.slice(0, 500) + " …[truncated]" : rawAnswer;
      console.log(`\n--- ANSWER (${rawAnswer.length} chars) ---\n${preview}`);
      console.log(`\n--- RAW ANALYSIS JSON ---\n${rawAnalysis.trim()}`);
      console.log(`\n--- PARSED MENTIONS ---`);
      console.log(JSON.stringify(mentions, null, 2));
      if (qaFlags.length > 0) {
        console.log(
          `\n!! QA FLAG — regex found ${qaFlags.join(", ")} in the answer but the LLM did not extract ${qaFlags.length > 1 ? "them" : "it"}.`,
        );
      }
    } catch (err) {
      console.error(`\n!! FAILED on ${q.id}: ${err.message}`);
      failures.push({ questionId: q.id, error: err.message });
    }
    if (idx < questions.length - 1) await sleep(PAUSE_MS);
  }

  // Save a full artifact so nothing is lost to console truncation.
  const outDir = join(HERE, "output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactPath = join(outDir, `run-${stamp}.json`);
  writeFileSync(
    artifactPath,
    JSON.stringify(
      { collectedAt: new Date().toISOString(), provider: llm.provider, model: llm.model, records, failures },
      null,
      2,
    ),
  );

  const flaggedRecords = records.filter((r) => r.qaFlags.length > 0);

  console.log(`\n${"=".repeat(70)}`);
  console.log(
    `Done. ${records.length} succeeded, ${failures.length} failed. Artifact: ${artifactPath}`,
  );
  console.log(
    `QA: ${flaggedRecords.length} response(s) where regex found an institution the LLM missed.`,
  );
  for (const r of flaggedRecords) {
    console.log(`   ${r.questionId} (${r.domain}): ${r.qaFlags.join(", ")}`);
  }

  if (DRY_RUN) {
    console.log("DRY RUN — nothing written to Supabase.");
    return;
  }
  if (records.length === 0) {
    console.log("No successful records — skipping Supabase write.");
    return;
  }

  const supabase = createSupabaseClient();
  const runId = await writeToSupabase(supabase, {
    llm,
    questionCount: records.length,
    records,
  });
  console.log(`Wrote run ${runId} to Supabase.`);
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
