/**
 * dashboard.ts — server-side data assembly for the dashboard.
 *
 * Pulls stored runs out of Supabase and shapes them for the overview screen:
 * headline OAVS, competitor comparison, per-domain heatmap matrix, and the
 * OAVS time series across runs. Server-only (uses the privileged Supabase
 * client) — never import from a client component.
 *
 * Performance: exactly TWO Supabase round trips regardless of how many runs
 * exist — one for the runs list, one joined query for every run's responses
 * with their mentions embedded. The result is then cached (5-minute
 * revalidate) because the underlying data only changes when a collection run
 * executes.
 */

import { unstable_cache } from "next/cache";
import { createSupabaseClient } from "./supabase.js";
import {
  computeOAVS,
  computeOAVSByDomain,
  DEFAULT_OAVS_WEIGHTS,
  SUBJECT_INSTITUTION,
  INSTITUTIONS,
  type AnalyzedResponse,
  type OAVSResult,
} from "./metric";
import { compareInstitutions } from "./scores";
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

export interface SeriesPoint {
  runId: string;
  date: string;
  oavs: number;
}

export interface OverviewData {
  run: RunMeta | null;
  subject: string;
  subjectResult: OAVSResult | null;
  comparison: OAVSResult[];
  heatmap: HeatmapRow[];
  series: SeriesPoint[];
  institutions: string[];
}

/** Shape of one joined row from the responses-with-mentions query. */
interface JoinedResponseRow {
  run_id: string;
  question_id: string;
  domain: string;
  mentions: {
    institution: string;
    position: number;
    cites_publication: boolean;
  }[];
}

/**
 * Uncached loader. Exported for verification/tooling; the app should use
 * getOverviewData (the cached wrapper) instead.
 */
export async function loadOverviewData(): Promise<OverviewData> {
  const supabase = createSupabaseClient();

  // Round trip 1: every run, oldest first (drives the time series).
  const { data: runs, error } = await supabase
    .from("runs")
    .select("id, created_at, model, question_count")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`loadOverviewData/runs: ${error.message}`);

  if (!runs || runs.length === 0) {
    return {
      run: null,
      subject: SUBJECT_INSTITUTION,
      subjectResult: null,
      comparison: [],
      heatmap: [],
      series: [],
      institutions: INSTITUTIONS,
    };
  }

  // Round trip 2: all responses for those runs with mentions embedded —
  // replaces the former 2-queries-per-run loop (N+1) plus a duplicate fetch
  // of the latest run.
  const { data: rows, error: rErr } = await supabase
    .from("responses")
    .select(
      "run_id, question_id, domain, mentions(institution, position, cites_publication)",
    )
    .in(
      "run_id",
      runs.map((r) => r.id),
    )
    .order("question_id");
  if (rErr) throw new Error(`loadOverviewData/responses: ${rErr.message}`);

  // Group into AnalyzedResponse[] per run (rows arrive ordered by question_id,
  // matching the previous per-run query ordering).
  const byRun = new Map<string, AnalyzedResponse[]>();
  for (const row of (rows ?? []) as JoinedResponseRow[]) {
    const list = byRun.get(row.run_id) ?? [];
    list.push({
      questionId: row.question_id,
      domain: row.domain,
      mentions: row.mentions.map((m) => ({
        institution: m.institution,
        position: m.position,
        citesPublication: m.cites_publication,
      })),
    });
    byRun.set(row.run_id, list);
  }

  // Time series: OAVS of the subject institution for every run.
  const series: SeriesPoint[] = runs.map((run) => ({
    runId: run.id,
    date: run.created_at,
    oavs: computeOAVS(
      byRun.get(run.id) ?? [],
      DEFAULT_OAVS_WEIGHTS,
      SUBJECT_INSTITUTION,
    ).oavs,
  }));

  // Everything else comes from the latest run — same data, no re-fetch.
  const latest = runs[runs.length - 1];
  const responses = byRun.get(latest.id) ?? [];
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
    series,
    institutions: INSTITUTIONS,
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
  ["overview-data"],
  { revalidate: 300, tags: ["overview"] },
);
