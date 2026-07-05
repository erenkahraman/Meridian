/**
 * platforms.ts — derived readiness for the three dominant AI answer surfaces.
 *
 * A page cited by one engine is often invisible to another because each has
 * its own crawler, freshness bias, and signal diet. These scores re-weight
 * the SAME checks measured elsewhere (never new measurements), so they are a
 * lens on the composite, not an addition to it — which is why they are
 * excluded from the overall score (no double counting).
 *
 * Each formula totals 100 and is stated in `basis` so it can be inspected
 * and defended check-by-check:
 *
 *   ChatGPT      40 crawler gate (GPTBot / OAI-SearchBot / ChatGPT-User)
 *                30 citability · 15 structured data · 15 technical
 *                — OpenAI's browsing quotes passage-shaped content; schema
 *                  and rendering decide whether the fetch yields anything.
 *   Perplexity   40 crawler gate (PerplexityBot / Perplexity-User)
 *                25 citability · 20 freshness · 15 E-E-A-T
 *                — Perplexity is a live-web citation engine with a strong
 *                  recency bias and visible source attribution.
 *   Google AIO   25 crawler gate (Googlebot — AI Overviews rides the search
 *                   index, not Google-Extended)
 *                25 structured data · 20 citability · 15 technical · 15 E-E-A-T
 *                — Google leans hardest on schema and site quality signals;
 *                  the crawler gate is lower because Googlebot is rarely
 *                  blocked by sites that want any search presence at all.
 */

import type { GeoCategory, PlatformReadiness } from "./types";
import type { CrawlerVerdict } from "./crawlers";

function categoryScore(categories: GeoCategory[], id: string): number {
  return categories.find((c) => c.id === id)?.score ?? 0;
}

function checkScore(categories: GeoCategory[], checkId: string): number {
  for (const cat of categories) {
    const check = cat.checks.find((c) => c.id === checkId);
    if (check) return (check.points / check.maxPoints) * 100;
  }
  return 0;
}

/** True if ANY of the tokens is allowed (or verdicts unknown → benefit of doubt = false gate but flagged). */
function gate(
  verdicts: CrawlerVerdict[] | null,
  tokens: string[],
): { open: boolean; unknown: boolean; blocked: string[] } {
  if (!verdicts) return { open: false, unknown: true, blocked: [] };
  const relevant = verdicts.filter((v) => tokens.includes(v.token));
  const blocked = relevant.filter((v) => !v.allowed).map((v) => v.token);
  return {
    open: relevant.some((v) => v.allowed),
    unknown: false,
    blocked,
  };
}

export function derivePlatforms(
  categories: GeoCategory[],
  verdicts: CrawlerVerdict[] | null,
): PlatformReadiness[] {
  const citability = categoryScore(categories, "citability");
  const structured = categoryScore(categories, "structuredData");
  const technical = categoryScore(categories, "technical");
  const eeat = categoryScore(categories, "eeat");
  const freshness = checkScore(categories, "freshness");
  const ssr = checkScore(categories, "ssr");

  const platforms: PlatformReadiness[] = [];

  /* ChatGPT */
  {
    const g = gate(verdicts, ["GPTBot", "OAI-SearchBot", "ChatGPT-User"]);
    const gatePts = g.unknown ? 20 : g.open ? 40 : 0;
    const score = Math.round(
      gatePts + citability * 0.3 + structured * 0.15 + technical * 0.15,
    );
    const blockers: string[] = [];
    if (g.unknown) blockers.push("Crawler policy unverifiable (robots.txt unreadable)");
    if (!g.unknown && !g.open)
      blockers.push(`All OpenAI crawlers blocked (${g.blocked.join(", ")})`);
    else if (g.blocked.length > 0)
      blockers.push(`Partially blocked: ${g.blocked.join(", ")}`);
    if (ssr < 60) blockers.push("Content not reliably server-rendered");
    if (citability < 50) blockers.push("Content not passage-structured for quoting");
    platforms.push({
      id: "chatgpt",
      label: "ChatGPT",
      score,
      blockers,
      basis: "40 crawler gate + 30% citability + 15% structured data + 15% technical",
    });
  }

  /* Perplexity */
  {
    const g = gate(verdicts, ["PerplexityBot", "Perplexity-User"]);
    const gatePts = g.unknown ? 20 : g.open ? 40 : 0;
    const score = Math.round(
      gatePts + citability * 0.25 + freshness * 0.2 + eeat * 0.15,
    );
    const blockers: string[] = [];
    if (g.unknown) blockers.push("Crawler policy unverifiable (robots.txt unreadable)");
    if (!g.unknown && !g.open)
      blockers.push(`Perplexity crawlers blocked (${g.blocked.join(", ")})`);
    if (freshness < 60) blockers.push("Weak freshness signals (Perplexity favors recent, dateable sources)");
    if (eeat < 50) blockers.push("Thin sourcing/attribution signals");
    platforms.push({
      id: "perplexity",
      label: "Perplexity",
      score,
      blockers,
      basis: "40 crawler gate + 25% citability + 20% freshness + 15% E-E-A-T",
    });
  }

  /* Google AI Overviews */
  {
    const g = gate(verdicts, ["Googlebot"]);
    const gatePts = g.unknown ? 12 : g.open ? 25 : 0;
    const score = Math.round(
      gatePts + structured * 0.25 + citability * 0.2 + technical * 0.15 + eeat * 0.15,
    );
    const blockers: string[] = [];
    if (g.unknown) blockers.push("Crawler policy unverifiable (robots.txt unreadable)");
    if (!g.unknown && !g.open) blockers.push("Googlebot blocked — page absent from the index AI Overviews draws on");
    if (structured < 50) blockers.push("Structured data too thin for Google's entity pipeline");
    if (technical < 50) blockers.push("Technical foundations below Google's quality bar");
    platforms.push({
      id: "google-ai-overviews",
      label: "Google AI Overviews",
      score,
      blockers,
      basis: "25 crawler gate + 25% structured data + 20% citability + 15% technical + 15% E-E-A-T",
    });
  }

  return platforms;
}
