/**
 * dashboard.ts — server-side data assembly for the dashboard.
 *
 * Pulls the latest stored run out of Supabase and shapes it for the overview
 * screen: headline OAVS, competitor comparison, per-domain heatmap matrix,
 * and the live figures the Findings narrative interpolates (share of voice,
 * mention counts, QA cross-check result). Server-only (uses the privileged
 * Supabase client) — never import from a client component.
 *
 * Run selection: only runs whose question_count matches the CURRENT question
 * set are considered. Older runs collected against a previous question set
 * remain stored (the collection history is append-only) but are not
 * comparable, so the dashboard never mixes them into what it displays.
 *
 * Performance: two Supabase round trips, then cached for 5 minutes — the
 * data only changes when a collection run executes.
 */

import { unstable_cache } from "next/cache";
import { createSupabaseClient } from "./supabase.js";
import {
  computeOAVSByDomain,
  DEFAULT_OAVS_WEIGHTS,
  SUBJECT_INSTITUTION,
  INSTITUTIONS,
  type AnalyzedResponse,
  type OAVSResult,
} from "./metric";
import { compareInstitutions } from "./scores";
// The same regex cross-check the collector runs inline; re-computed here so
// the QA figure shown in Findings always reflects the displayed run.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain ESM JS module without type declarations
import { qaDiscrepancies } from "./qa.js";
import questionSet from "../scripts/questions.json";

export interface RunMeta {
  id: string;
  createdAt: string;
  model: string;
  questionCount: number;
}

export interface HeatmapRow {
  domain: string;
  /** One cell per institution, in INSTITUTIONS order. */
  cells: { institution: string; oavs: number }[];
}

export interface OverviewData {
  run: RunMeta | null;
  subject: string;
  subjectResult: OAVSResult | null;
  comparison: OAVSResult[];
  heatmap: HeatmapRow[];
  institutions: string[];
  domainsPerQuestionCount: number;
  /** Subject-institution mention count vs all tracked mentions (for prose). */
  mentionCounts: { subject: number; total: number };
  /** Regex-vs-LLM QA cross-check over this run's raw answers. */
  qa: { flaggedResponses: number; totalResponses: number };
}

/** Shape of one joined row from the responses-with-mentions query. */
interface JoinedResponseRow {
  question_id: string;
  domain: string;
  raw_answer: string;
  mentions: {
    institution: string;
    position: number;
    cites_publication: boolean;
  }[];
}

const EMPTY: OverviewData = {
  run: null,
  subject: SUBJECT_INSTITUTION,
  subjectResult: null,
  comparison: [],
  heatmap: [],
  institutions: INSTITUTIONS,
  domainsPerQuestionCount: 0,
  mentionCounts: { subject: 0, total: 0 },
  qa: { flaggedResponses: 0, totalResponses: 0 },
};

/**
 * Uncached loader. Exported for verification/tooling; the app should use
 * getOverviewData (the cached wrapper) instead.
 */
export async function loadOverviewData(): Promise<OverviewData> {
  const supabase = createSupabaseClient();

  // Round trip 1: the newest run collected against the CURRENT question set.
  const { data: runs, error } = await supabase
    .from("runs")
    .select("id, created_at, model, question_count")
    .eq("question_count", questionSet.questions.length)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`loadOverviewData/runs: ${error.message}`);
  const latest = runs?.[0];
  if (!latest) return EMPTY;

  // Round trip 2: that run's responses with mentions embedded. raw_answer is
  // included so the QA cross-check can be recomputed over the displayed data.
  const { data: rows, error: rErr } = await supabase
    .from("responses")
    .select(
      "question_id, domain, raw_answer, mentions(institution, position, cites_publication)",
    )
    .eq("run_id", latest.id)
    .order("question_id");
  if (rErr) throw new Error(`loadOverviewData/responses: ${rErr.message}`);

  const joined = (rows ?? []) as JoinedResponseRow[];
  const responses: AnalyzedResponse[] = joined.map((row) => ({
    questionId: row.question_id,
    domain: row.domain,
    mentions: row.mentions.map((m) => ({
      institution: m.institution,
      position: m.position,
      citesPublication: m.cites_publication,
    })),
  }));

  const comparison = compareInstitutions(responses);
  const subjectResult =
    comparison.find((c) => c.institution === SUBJECT_INSTITUTION) ?? null;

  // Heatmap: domains (in question-set order) × institutions.
  const byInstitution = new Map(
    INSTITUTIONS.map((inst) => [
      inst,
      new Map(
        computeOAVSByDomain(responses, DEFAULT_OAVS_WEIGHTS, inst).map((d) => [
          d.domain,
          d.result.oavs,
        ]),
      ),
    ]),
  );
  const heatmap: HeatmapRow[] = questionSet.domains.map((domain: string) => ({
    domain,
    cells: INSTITUTIONS.map((institution) => ({
      institution,
      oavs: byInstitution.get(institution)?.get(domain) ?? 0,
    })),
  }));

  // Mention counts for the narrative ("X of Y institutional mentions").
  let subjectMentions = 0;
  let totalMentions = 0;
  for (const r of responses) {
    for (const m of r.mentions) {
      if (!INSTITUTIONS.includes(m.institution)) continue;
      totalMentions += 1;
      if (m.institution === SUBJECT_INSTITUTION) subjectMentions += 1;
    }
  }

  // QA cross-check, recomputed over the displayed run's raw answers.
  const flaggedResponses = joined.filter(
    (row) =>
      qaDiscrepancies(
        row.raw_answer,
        row.mentions.map((m) => m.institution),
        INSTITUTIONS,
      ).length > 0,
  ).length;

  return {
    run: {
      id: latest.id,
      createdAt: latest.created_at,
      model: latest.model,
      questionCount: latest.question_count,
    },
    subject: SUBJECT_INSTITUTION,
    subjectResult,
    comparison,
    heatmap,
    institutions: INSTITUTIONS,
    domainsPerQuestionCount: Math.round(
      questionSet.questions.length / questionSet.domains.length,
    ),
    mentionCounts: { subject: subjectMentions, total: totalMentions },
    qa: { flaggedResponses, totalResponses: responses.length },
  };
}

/**
 * Cached overview: recomputed at most every 5 minutes (matching the page's
 * ISR window). Collection runs are batch events, so staleness is bounded and
 * harmless; the `overview` tag allows explicit invalidation later if a
 * "collect" trigger ever moves in-process.
 */
export const getOverviewData = unstable_cache(
  loadOverviewData,
  ["overview-data-v3"],
  { revalidate: 300, tags: ["overview"] },
);
