/**
 * index.ts — GEO audit orchestrator.
 *
 * Public API (unchanged from the original single-file module):
 *   analyzeHtml(html, url, ctx?, now?)  pure analysis — unit-testable
 *   auditUrl(url)                       fetch page + robots.txt + llms.txt, analyze
 *   auditUrlCached(url)                 5-minute in-memory cache wrapper
 *   FetchHttpError                      typed HTTP failure (403 → "blocked" finding)
 *
 * The composite score is the weighted sum of five category scores; weights
 * and their rationale live in types.ts. Recommendations are ordered by
 * impact: points lost × category weight, so the list reads as a priority
 * queue, not a checklist.
 */

import * as cheerio from "cheerio";
import {
  GEO_WEIGHTS,
  UNKNOWN_ACCESS,
  type AccessContext,
  type FetchStatus,
  type GeoAuditResult,
  type GeoCategory,
} from "./types";
import { scoreAiAccess, evaluateCrawlers, type CrawlerVerdict } from "./crawlers";
import { scoreCitability } from "./content";
import { scoreStructuredData } from "./schema";
import { scoreEEAT } from "./eeat";
import { scoreTechnical } from "./technical";
import { derivePlatforms } from "./platforms";

export type {
  GeoAuditResult,
  GeoCategory,
  GeoCheck,
  CheckStatus,
  PlatformReadiness,
  AccessContext,
} from "./types";
export { GEO_WEIGHTS } from "./types";
export { AI_CRAWLERS } from "./crawlers";

/* ── Pure analysis ──────────────────────────────────────────────────────── */

export function analyzeHtml(
  html: string,
  url: string,
  ctx: AccessContext = UNKNOWN_ACCESS,
  now: Date = new Date(),
): GeoAuditResult {
  const $ = cheerio.load(html);

  let pagePath = "/";
  try {
    pagePath = new URL(url).pathname || "/";
  } catch {
    /* keep default */
  }

  const categories: GeoCategory[] = [
    scoreAiAccess($, ctx, pagePath),
    scoreCitability($, now),
    scoreStructuredData($),
    scoreEEAT($, url),
    scoreTechnical($, url, Buffer.byteLength(html, "utf8")),
  ];

  const overallScore = Math.round(
    categories.reduce((sum, c) => sum + c.score * c.weight, 0),
  );

  // Impact-ordered recommendations: (points lost × category weight) desc.
  const weighted = categories.flatMap((cat) =>
    cat.checks
      .filter((c) => c.status !== "pass" && c.recommendation)
      .map((c) => ({
        recommendation: c.recommendation as string,
        impact: (c.maxPoints - c.points) * cat.weight,
      })),
  );
  const recommendations = weighted
    .sort((a, b) => b.impact - a.impact)
    .map((w) => w.recommendation);

  const verdicts: CrawlerVerdict[] | null =
    ctx.robots.status === "ok"
      ? evaluateCrawlers(ctx.robots.body ?? "", pagePath)
      : null;

  return {
    url,
    fetchedAt: now.toISOString(),
    overallScore,
    categories,
    recommendations,
    platforms: derivePlatforms(categories, verdicts),
  };
}

/* ── Fetch layer ────────────────────────────────────────────────────────── */

/**
 * Thrown when the target returns an HTTP error. A 403 is surfaced to the UI
 * as a finding in its own right (bot protection ≈ AI crawlers likely blocked
 * too), not as a generic failure.
 */
export class FetchHttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(`Fetch failed: ${status} ${statusText}`);
    this.name = "FetchHttpError";
    this.status = status;
  }
}

const FETCH_HEADERS = {
  // Identify politely; some sites vary output by UA.
  "User-Agent": "MeridianGEOAudit/2.0 (+https://oecd.org)",
  Accept: "text/html, text/plain",
};

/** Fetch an auxiliary text file; distinguishes missing (404) from errors. */
async function fetchAux(
  url: string,
  timeoutMs: number,
): Promise<{ status: FetchStatus; body?: string }> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { status: "ok", body: await res.text() };
    if (res.status === 404) return { status: "missing" };
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

/** Fetch a URL plus its origin's robots.txt and llms.txt, then audit it. */
export async function auditUrl(url: string): Promise<GeoAuditResult> {
  const origin = new URL(url).origin;

  const [pageRes, robots, llms] = await Promise.all([
    fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    }),
    fetchAux(`${origin}/robots.txt`, 8_000),
    fetchAux(`${origin}/llms.txt`, 8_000),
  ]);

  if (!pageRes.ok) {
    throw new FetchHttpError(pageRes.status, pageRes.statusText);
  }
  const html = await pageRes.text();
  return analyzeHtml(html, url, { robots, llms });
}

/* ── Cached wrapper for the dashboard ───────────────────────────────────── */

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 50;

// Module-level cache: avoids re-fetching the same page on repeated audits.
// Per-instance only (resets on redeploy/cold start), which is fine here —
// it exists to be polite to the target site, not to be a datastore.
const auditCache = new Map<string, { at: number; result: GeoAuditResult }>();

/** Audit with a 5-minute in-memory cache per URL. */
export async function auditUrlCached(url: string): Promise<GeoAuditResult> {
  const hit = auditCache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  const result = await auditUrl(url);

  if (auditCache.size >= CACHE_MAX) {
    // Drop the oldest entry (Map preserves insertion order).
    const oldest = auditCache.keys().next().value;
    if (oldest !== undefined) auditCache.delete(oldest);
  }
  auditCache.set(url, { at: Date.now(), result });
  return result;
}
