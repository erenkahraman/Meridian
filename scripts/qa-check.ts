/**
 * qa-check.ts — QA discrepancy report.
 *
 * Reads the latest stored run from Supabase and re-runs the regex cross-check
 * over each raw answer, comparing what the regex detects against what the LLM
 * extraction stored as mentions. Lists every response where the regex found a
 * tracked institution the LLM did not — the same check the collector runs
 * inline, here as a standalone audit over persisted data.
 *
 * Run with:  npm run qa-check
 * Scores are never modified; this is reporting only.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
for (const file of [".env.local", ".env"]) {
  const path = join(HERE, "..", file);
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

import { createSupabaseClient } from "../lib/supabase.js";
import { fetchLatestRunId } from "../lib/scores";
import { qaDiscrepancies } from "../lib/qa.js";
import questionSet from "../scripts/questions.json";

interface Row {
  question_id: string;
  domain: string;
  raw_answer: string;
  mentions: { institution: string }[];
}

async function main() {
  const supabase = createSupabaseClient();
  const runId = await fetchLatestRunId(supabase);
  if (!runId) {
    console.log("No runs found. Run the collector first.");
    return;
  }

  const { data, error } = await supabase
    .from("responses")
    .select("question_id, domain, raw_answer, mentions(institution)")
    .eq("run_id", runId)
    .order("question_id");
  if (error) throw new Error(`qa-check: ${error.message}`);

  const rows = (data ?? []) as unknown as Row[];
  const institutions: string[] = questionSet.competitors;

  const flagged = rows
    .map((r) => ({
      questionId: r.question_id,
      domain: r.domain,
      missed: qaDiscrepancies(
        r.raw_answer,
        r.mentions.map((m) => m.institution),
        institutions,
      ),
    }))
    .filter((r) => r.missed.length > 0);

  console.log(`QA CHECK — run ${runId}`);
  console.log(`Responses examined: ${rows.length}`);
  console.log(`Responses with a regex-vs-LLM discrepancy: ${flagged.length}\n`);

  if (flagged.length === 0) {
    console.log("No discrepancies — regex found nothing the LLM extraction missed.");
  } else {
    // Tally by institution for a quick systemic-bias read.
    const byInstitution: Record<string, number> = {};
    for (const f of flagged) {
      for (const inst of f.missed) {
        byInstitution[inst] = (byInstitution[inst] ?? 0) + 1;
      }
    }
    console.log("Discrepancies by institution (regex found, LLM missed):");
    for (const [inst, n] of Object.entries(byInstitution).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${inst.padEnd(12)} ${n}`);
    }
    console.log("\nPer response:");
    for (const f of flagged) {
      console.log(`   ${f.questionId.padEnd(10)} ${f.domain.padEnd(24)} ${f.missed.join(", ")}`);
    }
    console.log(
      "\nNote: flags indicate possible LLM under-extraction. Scores are NOT auto-corrected.",
    );
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
