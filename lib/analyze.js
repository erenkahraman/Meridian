/**
 * analyze.js — the shared answer + structured-analysis pipeline.
 *
 * Used by both the batch collector (scripts/collect.js) and the live-query API
 * route (app/api/live/route.ts) so a single question run live is scored exactly
 * the same way as one collected in bulk. Kept as ESM JavaScript so the plain
 * `node` collector and the TypeScript route can both import it without a build
 * step. Institutions are passed in (not imported) to stay decoupled from the
 * metric module.
 */

// Neutral answer prompt — we want the model's organic take, not one nudged
// toward or away from any institution.
export const ANSWER_SYSTEM =
  "You are a knowledgeable policy analyst. Answer the user's question clearly " +
  "and substantively in a few short paragraphs.";

/** Build the analysis prompt for one answer, given the tracked institutions. */
export function buildAnalysisPrompt(answer, institutions) {
  return `You are a precise text-analysis engine. Analyze the ANSWER below and
identify which of these tracked institutions are mentioned in it:

${institutions.map((i) => `- ${i}`).join("\n")}

Match common aliases/abbreviations (e.g. "Organisation for Economic
Co-operation and Development" = OECD; "International Monetary Fund" = IMF;
"the World Bank"/"World Bank Group" = World Bank; "United Nations"/"UN" = UN).
Map each detected reference to exactly one of the canonical names above.

For every tracked institution that appears, produce an object with:
- "institution": the canonical name (exactly as listed above)
- "position": 1-based order of FIRST appearance among the tracked institutions
  in the text (the first tracked institution to appear is 1, the next new one 2, ...)
- "citesPublication": true ONLY if that institution is mentioned together with a
  specific named publication, report, dataset, database, index, or programme
  (e.g. "OECD Employment Outlook", "PISA", "IMF World Economic Outlook",
  "World Bank World Development Indicators"). false if only the institution's
  name appears generically.
- "context": a short verbatim snippet (<= 200 chars) from the answer around its
  first mention.

Return STRICT JSON only, no markdown fences, in exactly this shape:
{"mentions": [{"institution": "OECD", "position": 1, "citesPublication": false, "context": "..."}]}
If no tracked institution is mentioned, return {"mentions": []}.

ANSWER:
"""
${answer}
"""`;
}

/** Strip accidental ```json fences and parse. Throws on invalid JSON. */
export function parseJSON(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Validate and normalize the raw analysis into clean mentions:
 * keep only tracked institutions, dedupe by institution (earliest position,
 * citesPublication = OR), sort by position, and re-rank positions to a clean
 * 1..n so downstream scoring never sees gaps.
 */
export function normalizeMentions(parsed, institutions) {
  if (!parsed || !Array.isArray(parsed.mentions)) {
    throw new Error("Analysis JSON missing a 'mentions' array.");
  }
  const tracked = new Set(institutions);
  const byInstitution = new Map();

  for (const m of parsed.mentions) {
    if (!m || !tracked.has(m.institution)) continue;
    const position = Number(m.position);
    const entry = {
      institution: m.institution,
      position: Number.isFinite(position) ? position : Infinity,
      citesPublication: Boolean(m.citesPublication),
      context: typeof m.context === "string" ? m.context : "",
    };
    const existing = byInstitution.get(m.institution);
    if (!existing) {
      byInstitution.set(m.institution, entry);
    } else {
      // Prefer the earliest-position mention's position and context; a citation
      // anywhere counts as a citation.
      if (entry.position < existing.position) {
        existing.position = entry.position;
        existing.context = entry.context;
      } else if (!existing.context) {
        existing.context = entry.context;
      }
      existing.citesPublication =
        existing.citesPublication || entry.citesPublication;
    }
  }

  return [...byInstitution.values()]
    .sort((a, b) => a.position - b.position)
    .map((m, i) => ({ ...m, position: i + 1 }));
}

/**
 * Run the two-call pipeline for one question: a free-text answer, then a
 * deterministic (temperature 0) structured-analysis pass.
 *
 * @returns {Promise<{rawAnswer: string, rawAnalysis: string, mentions: Array}>}
 */
export async function answerAndAnalyze(
  llm,
  questionText,
  institutions,
  { analysisTemperature = 0 } = {},
) {
  const rawAnswer = await llm.generateText(questionText, {
    system: ANSWER_SYSTEM,
  });
  const rawAnalysis = await llm.generateJSON(
    buildAnalysisPrompt(rawAnswer, institutions),
    { temperature: analysisTemperature },
  );
  const mentions = normalizeMentions(parseJSON(rawAnalysis), institutions);
  return { rawAnswer, rawAnalysis, mentions };
}
