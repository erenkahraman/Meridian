/**
 * score.ts — Phase 3 scoring CLI.
 *
 * Reads the latest run from Supabase, computes the OAVS + four sub-components
 * for every institution (competitor comparison), and prints a fully itemized
 * hand-verification breakdown for the subject institution (OECD) plus a
 * per-domain table. Run with:  npm run score
 *
 * Uses the typed metric in lib/metric.ts directly (via tsx), so the numbers
 * here are produced by the exact same code the dashboard will use.
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
import {
  fetchLatestRunId,
  fetchAnalyzedResponses,
  compareInstitutions,
} from "../lib/scores";
import {
  computeOAVS,
  computeOAVSByDomain,
  computePresenceRate,
  computePositionWeight,
  computeCitationDepth,
  computeShareOfVoice,
  DEFAULT_OAVS_WEIGHTS,
  SUBJECT_INSTITUTION,
  INSTITUTIONS,
} from "../lib/metric";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mirrors metric.ts's position mapping, for display of intermediate steps. */
function positionScoreDisplay(p: number): number {
  if (p === 1) return 100;
  if (p === 2) return 70;
  if (p === 3) return 40;
  if (p >= 4) return 20;
  return 0;
}

async function main() {
  const supabase = createSupabaseClient();
  const runId = await fetchLatestRunId(supabase);
  if (!runId) {
    console.log("No runs found. Run the collector first.");
    return;
  }
  const responses = await fetchAnalyzedResponses(supabase, runId);
  const N = responses.length;
  console.log(`Run ${runId} — ${N} responses`);
  console.log(`Weights: ${JSON.stringify(DEFAULT_OAVS_WEIGHTS)}\n`);

  /* ---- Competitor comparison ---- */
  console.log("=== COMPETITOR COMPARISON (all sub-scores 0–100) ===");
  console.table(
    compareInstitutions(responses).map((r) => ({
      institution: r.institution,
      presence: r2(r.presenceRate),
      position: r2(r.positionWeight),
      citation: r2(r.citationDepth),
      share: r2(r.shareOfVoice),
      OAVS: r2(r.oavs),
    })),
  );

  /* ---- Hand-verification for the subject institution ---- */
  const subj = SUBJECT_INSTITUTION;
  const present = responses.filter((r) =>
    r.mentions.some((m) => m.institution === subj),
  );
  console.log(`\n=== HAND-VERIFICATION: ${subj} ===`);
  console.log(`Total responses (N): ${N}`);
  console.log(
    `Presence Rate = ${present.length}/${N} * 100 = ${r2(
      computePresenceRate(responses, subj),
    )}`,
  );

  console.log(`\nPosition contributions (present responses only):`);
  let posSum = 0;
  for (const r of present) {
    const earliest = r.mentions
      .filter((m) => m.institution === subj)
      .sort((a, b) => a.position - b.position)[0];
    const s = positionScoreDisplay(earliest.position);
    posSum += s;
    console.log(`  ${r.questionId.padEnd(10)} position ${earliest.position} -> ${s}`);
  }
  console.log(
    `Position Weight = ${posSum}/${N} = ${r2(computePositionWeight(responses, subj))}`,
  );

  console.log(`\nCitation contributions (present responses only):`);
  let citSum = 0;
  for (const r of present) {
    const cited = r.mentions
      .filter((m) => m.institution === subj)
      .some((m) => m.citesPublication);
    const s = cited ? 100 : 50;
    citSum += s;
    console.log(`  ${r.questionId.padEnd(10)} ${cited ? "cited  " : "uncited"} -> ${s}`);
  }
  console.log(
    `Citation Depth = ${citSum}/${N} = ${r2(computeCitationDepth(responses, subj))}`,
  );

  let subjMentions = 0;
  let allMentions = 0;
  for (const r of responses) {
    for (const m of r.mentions) {
      if (!INSTITUTIONS.includes(m.institution)) continue;
      allMentions += 1;
      if (m.institution === subj) subjMentions += 1;
    }
  }
  console.log(
    `\nShare of Voice = ${subjMentions}/${allMentions} * 100 = ${r2(
      computeShareOfVoice(responses, subj),
    )}`,
  );

  const w = DEFAULT_OAVS_WEIGHTS;
  const res = computeOAVS(responses, w, subj);
  console.log(
    `\nComposite OAVS = ${r2(res.presenceRate)}*${w.presenceRate} + ` +
      `${r2(res.positionWeight)}*${w.positionWeight} + ` +
      `${r2(res.citationDepth)}*${w.citationDepth} + ` +
      `${r2(res.shareOfVoice)}*${w.shareOfVoice} = ${r2(res.oavs)}`,
  );

  /* ---- Per-domain breakdown for the subject institution ---- */
  console.log(`\n=== ${subj} OAVS BY DOMAIN ===`);
  console.table(
    computeOAVSByDomain(responses, w, subj).map((d) => ({
      domain: d.domain,
      n: responses.filter((r) => r.domain === d.domain).length,
      presence: r2(d.result.presenceRate),
      position: r2(d.result.positionWeight),
      citation: r2(d.result.citationDepth),
      share: r2(d.result.shareOfVoice),
      OAVS: r2(d.result.oavs),
    })),
  );
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
