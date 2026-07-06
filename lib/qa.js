/**
 * qa.js — regex cross-check QA layer for the collector.
 *
 * The LLM structured-analysis pass is the source of truth for scoring. This
 * layer is an independent, deterministic second opinion: a plain regex/string
 * search over the SAME raw answer for each tracked institution and its known
 * aliases. Where the regex finds an institution the LLM extraction missed, we
 * raise a QA flag — surfacing possible under-extraction WITHOUT auto-correcting
 * any score (the mentions, and therefore the OAVS, are left untouched).
 *
 * The regex is deliberately conservative and literal: acronyms are word-bounded
 * to avoid substring false positives (e.g. "UN" inside "UNESCO"), and the "UN"
 * acronym is case-sensitive because a lowercase "un" is almost never the body.
 */

/**
 * Alias patterns per canonical institution name. Keys must match the
 * `competitors` names in questions.json exactly.
 */
export const INSTITUTION_ALIASES = {
  OECD: [/\bOECD\b/i, /Organisation for Economic Co-operation and Development/i],
  IMF: [/\bIMF\b/i, /International Monetary Fund/i],
  "World Bank": [/World Bank/i],
  UN: [/United Nations/i, /\bUN\b/], // UN acronym intentionally case-sensitive
};

/** Set of institutions detected in `rawAnswer` by regex/alias search. */
export function regexDetectInstitutions(rawAnswer, institutions) {
  const found = new Set();
  const text = rawAnswer ?? "";
  for (const institution of institutions) {
    const patterns = INSTITUTION_ALIASES[institution];
    if (!patterns) continue;
    // Note: no /g flag on these patterns, so .test() is stateless here.
    if (patterns.some((re) => re.test(text))) found.add(institution);
  }
  return found;
}

/**
 * Institutions the regex detected in `rawAnswer` that are absent from the LLM's
 * extracted `llmInstitutions`. A non-empty result is a QA flag (LLM possibly
 * under-extracted). Returns canonical names, in the tracked-institution order.
 */
export function qaDiscrepancies(rawAnswer, llmInstitutions, institutions) {
  const regexFound = regexDetectInstitutions(rawAnswer, institutions);
  const llmSet = new Set(llmInstitutions);
  return institutions.filter((i) => regexFound.has(i) && !llmSet.has(i));
}
