/**
 * scores.ts — bridge between stored data and the pure metric.
 *
 * Reads collected runs out of Supabase and maps them into the AnalyzedResponse
 * shape that metric.ts consumes, plus a helper to score every tracked
 * institution for the competitor comparison. Kept in /lib so both the scoring
 * script and (later) the dashboard use the exact same logic.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AnalyzedResponse,
  InstitutionMention,
  Institution,
  INSTITUTIONS,
  OAVSResult,
  OAVSWeights,
  DEFAULT_OAVS_WEIGHTS,
  computeOAVS,
} from "./metric";

/** The most recent run's id, or null if there are no runs yet. */
export async function fetchLatestRunId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("runs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`fetchLatestRunId: ${error.message}`);
  return data?.id ?? null;
}

/**
 * Load one run's responses (with their mentions) as AnalyzedResponse[]. Mentions
 * were already normalized (positions 1..n) at collection time, so they feed the
 * metric directly.
 */
export async function fetchAnalyzedResponses(
  supabase: SupabaseClient,
  runId: string,
): Promise<AnalyzedResponse[]> {
  const { data: responses, error: rErr } = await supabase
    .from("responses")
    .select("id, question_id, domain")
    .eq("run_id", runId)
    .order("question_id");
  if (rErr) throw new Error(`fetchAnalyzedResponses/responses: ${rErr.message}`);
  if (!responses || responses.length === 0) return [];

  const { data: mentions, error: mErr } = await supabase
    .from("mentions")
    .select("response_id, institution, position, cites_publication")
    .in(
      "response_id",
      responses.map((r) => r.id),
    );
  if (mErr) throw new Error(`fetchAnalyzedResponses/mentions: ${mErr.message}`);

  const byResponse = new Map<string, InstitutionMention[]>();
  for (const m of mentions ?? []) {
    const list = byResponse.get(m.response_id) ?? [];
    list.push({
      institution: m.institution,
      position: m.position,
      citesPublication: m.cites_publication,
    });
    byResponse.set(m.response_id, list);
  }

  return responses.map((r) => ({
    questionId: r.question_id,
    domain: r.domain,
    mentions: byResponse.get(r.id) ?? [],
  }));
}

/**
 * Score every tracked institution over the same response set — the competitor
 * comparison. Returned in descending OAVS order.
 */
export function compareInstitutions(
  responses: AnalyzedResponse[],
  weights: OAVSWeights = DEFAULT_OAVS_WEIGHTS,
): OAVSResult[] {
  return INSTITUTIONS.map((institution: Institution) =>
    computeOAVS(responses, weights, institution),
  ).sort((a, b) => b.oavs - a.oavs);
}
