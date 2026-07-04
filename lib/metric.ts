/**
 * metric.ts — OECD AI Visibility Score (OAVS) and its sub-components.
 *
 * Implements the approved OAVS specification. The score is a weighted composite
 * of four sub-components:
 *
 *   - Presence Rate  (weight 0.30) — % of questions where the institution appears.
 *   - Position Weight (weight 0.25) — how early it appears among mentioned bodies.
 *   - Citation Depth  (weight 0.25) — whether mentions cite a real publication.
 *   - Share of Voice  (weight 0.20) — its share of all tracked mentions.
 *
 * The tracked institution list is read from scripts/questions.json (the
 * `competitors` array) so the metric and the question set never drift apart.
 */

import questionSet from "../scripts/questions.json";

/* ------------------------------------------------------------------ */
/* Institutions                                                        */
/* ------------------------------------------------------------------ */

/**
 * The institutions Meridian tracks, sourced from questions.json so there is a
 * single source of truth shared with the collector.
 */
export const INSTITUTIONS: string[] = questionSet.competitors;
export type Institution = string;

/** The subject institution whose visibility the OAVS ultimately measures. */
export const SUBJECT_INSTITUTION: Institution = "OECD";

/* ------------------------------------------------------------------ */
/* Inputs — the analyzed data the metric consumes                     */
/* ------------------------------------------------------------------ */

/**
 * One institution mention extracted from a single LLM answer by the
 * Phase 2 structured-analysis call.
 */
export interface InstitutionMention {
  institution: Institution;
  /** 1-based order of first appearance in the answer (1 = mentioned first). */
  position: number;
  /**
   * Whether the mention is backed by a specific named publication, dataset,
   * or report (rather than a bare name-drop). Feeds Citation Depth.
   */
  citesPublication: boolean;
}

/**
 * The analyzed result for one question's LLM answer within a run. This is the
 * unit the metric aggregates over. `mentions` is empty when no tracked
 * institution appeared in the answer.
 */
export interface AnalyzedResponse {
  questionId: string;
  /** Policy domain of the question, used for per-domain breakdowns. */
  domain: string;
  mentions: InstitutionMention[];
}

/* ------------------------------------------------------------------ */
/* Metric configuration                                                */
/* ------------------------------------------------------------------ */

/**
 * Relative weights of the four sub-components in the composite OAVS.
 * Expected to sum to 1.
 */
export interface OAVSWeights {
  presenceRate: number;
  positionWeight: number;
  citationDepth: number;
  shareOfVoice: number;
}

/** The approved default weights (sum to 1). */
export const DEFAULT_OAVS_WEIGHTS: OAVSWeights = {
  presenceRate: 0.3,
  positionWeight: 0.25,
  citationDepth: 0.25,
  shareOfVoice: 0.2,
};

/* ------------------------------------------------------------------ */
/* Outputs — the computed scores                                      */
/* ------------------------------------------------------------------ */

/**
 * The four sub-components plus the composite score for a single institution
 * over a set of analyzed responses. Sub-components are on a 0–100 scale; the
 * composite is their weighted sum.
 */
export interface OAVSResult {
  institution: Institution;
  /** How often the institution appears at all across the questions. */
  presenceRate: number;
  /** How prominently it appears (earlier / higher position scores more). */
  positionWeight: number;
  /** How often mentions are backed by a specific publication or dataset. */
  citationDepth: number;
  /** Its share of all tracked-institution mentions (competitive visibility). */
  shareOfVoice: number;
  /** Weighted composite of the four sub-components. */
  oavs: number;
}

/** OAVS results broken down by policy domain (Phase 3 per-domain view). */
export interface OAVSByDomain {
  domain: string;
  result: OAVSResult;
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

/** Map a 1-based position to its Position Weight score. */
function positionScore(position: number): number {
  if (position === 1) return 100;
  if (position === 2) return 70;
  if (position === 3) return 40;
  if (position >= 4) return 20;
  return 0;
}

/** All mentions of a given institution within one response. */
function mentionsOf(
  response: AnalyzedResponse,
  institution: Institution,
): InstitutionMention[] {
  return response.mentions.filter((m) => m.institution === institution);
}

/* ------------------------------------------------------------------ */
/* Sub-component functions                                             */
/* ------------------------------------------------------------------ */

/**
 * Presence Rate — percentage of responses in which the institution appears at
 * least once. Range 0–100.
 */
export function computePresenceRate(
  responses: AnalyzedResponse[],
  institution: Institution,
): number {
  if (responses.length === 0) return 0;
  const appearances = responses.filter(
    (r) => mentionsOf(r, institution).length > 0,
  ).length;
  return (appearances / responses.length) * 100;
}

/**
 * Position Weight — per-response score based on the institution's earliest
 * position (1→100, 2→70, 3→40, 4+→20, absent→0), averaged across all responses.
 */
export function computePositionWeight(
  responses: AnalyzedResponse[],
  institution: Institution,
): number {
  if (responses.length === 0) return 0;
  const total = responses.reduce((sum, r) => {
    const ms = mentionsOf(r, institution);
    if (ms.length === 0) return sum;
    const earliest = Math.min(...ms.map((m) => m.position));
    return sum + positionScore(earliest);
  }, 0);
  return total / responses.length;
}

/**
 * Citation Depth — per-response score (cited publication→100, mentioned but
 * uncited→50, absent→0), averaged across all responses.
 */
export function computeCitationDepth(
  responses: AnalyzedResponse[],
  institution: Institution,
): number {
  if (responses.length === 0) return 0;
  const total = responses.reduce((sum, r) => {
    const ms = mentionsOf(r, institution);
    if (ms.length === 0) return sum;
    const cited = ms.some((m) => m.citesPublication);
    return sum + (cited ? 100 : 50);
  }, 0);
  return total / responses.length;
}

/**
 * Share of Voice — the institution's total mentions divided by the total
 * mentions of all tracked institutions across the full response set, times 100.
 * A single flat value, not averaged per question.
 */
export function computeShareOfVoice(
  responses: AnalyzedResponse[],
  institution: Institution,
): number {
  let institutionMentions = 0;
  let allMentions = 0;
  for (const r of responses) {
    for (const m of r.mentions) {
      if (!INSTITUTIONS.includes(m.institution)) continue;
      allMentions += 1;
      if (m.institution === institution) institutionMentions += 1;
    }
  }
  if (allMentions === 0) return 0;
  return (institutionMentions / allMentions) * 100;
}

/* ------------------------------------------------------------------ */
/* Composite OAVS                                                      */
/* ------------------------------------------------------------------ */

/**
 * Compute the full OAVS (composite + the four sub-components) for one
 * institution over a set of analyzed responses, using the supplied weights.
 */
export function computeOAVS(
  responses: AnalyzedResponse[],
  weights: OAVSWeights = DEFAULT_OAVS_WEIGHTS,
  institution: Institution = SUBJECT_INSTITUTION,
): OAVSResult {
  const presenceRate = computePresenceRate(responses, institution);
  const positionWeight = computePositionWeight(responses, institution);
  const citationDepth = computeCitationDepth(responses, institution);
  const shareOfVoice = computeShareOfVoice(responses, institution);

  const oavs =
    presenceRate * weights.presenceRate +
    positionWeight * weights.positionWeight +
    citationDepth * weights.citationDepth +
    shareOfVoice * weights.shareOfVoice;

  return {
    institution,
    presenceRate,
    positionWeight,
    citationDepth,
    shareOfVoice,
    oavs,
  };
}

/**
 * Compute the OAVS for one institution, grouped by policy domain, for the
 * per-domain breakdown in the dashboard. Responses are grouped by `domain`
 * first, then the same computation runs per group. Domain order follows first
 * appearance in the input.
 */
export function computeOAVSByDomain(
  responses: AnalyzedResponse[],
  weights: OAVSWeights = DEFAULT_OAVS_WEIGHTS,
  institution: Institution = SUBJECT_INSTITUTION,
): OAVSByDomain[] {
  const groups = new Map<string, AnalyzedResponse[]>();
  for (const r of responses) {
    const group = groups.get(r.domain);
    if (group) group.push(r);
    else groups.set(r.domain, [r]);
  }

  return Array.from(groups, ([domain, groupResponses]) => ({
    domain,
    result: computeOAVS(groupResponses, weights, institution),
  }));
}
