/**
 * dashboard.ts — server-side data assembly for the dashboard.
 *
 * Pulls stored runs out of Supabase and shapes them for the overview screen:
 * headline OAVS, competitor comparison, per-domain heatmap matrix, and the
 * OAVS time series across runs. Server-only (uses the privileged Supabase
 * client) — never import from a client component.
 */

import { createSupabaseClient } from "./supabase.js";
import {
  computeOAVS,
  computeOAVSByDomain,
  DEFAULT_OAVS_WEIGHTS,
  SUBJECT_INSTITUTION,
  INSTITUTIONS,
  type OAVSResult,
} from "./metric";
import { fetchAnalyzedResponses, compareInstitutions } from "./scores";
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

export async function getOverviewData(): Promise<OverviewData> {
  const supabase = createSupabaseClient();

  const { data: runs, error } = await supabase
    .from("runs")
    .select("id, created_at, model, question_count")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getOverviewData/runs: ${error.message}`);

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

  // Time series: OAVS of the subject institution for every run. One query per
  // run — fine at snapshot cadence (weekly/monthly), revisit if runs grow large.
  const series: SeriesPoint[] = [];
  for (const run of runs) {
    const responses = await fetchAnalyzedResponses(supabase, run.id);
    series.push({
      runId: run.id,
      date: run.created_at,
      oavs: computeOAVS(responses, DEFAULT_OAVS_WEIGHTS, SUBJECT_INSTITUTION)
        .oavs,
    });
  }

  // Everything else comes from the latest run.
  const latest = runs[runs.length - 1];
  const responses = await fetchAnalyzedResponses(supabase, latest.id);
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
