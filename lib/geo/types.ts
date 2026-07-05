/**
 * types.ts — shared contracts and the scoring methodology for the GEO audit.
 *
 * ── Methodology ─────────────────────────────────────────────────────────────
 * The composite GEO score answers one question: "how likely is this page to be
 * found, understood, and quoted by an AI answer engine?" Five weighted
 * categories cover the full pipeline from crawl to citation:
 *
 *   aiAccess       0.20  Gatekeeper. If AI crawlers cannot fetch the page,
 *                        nothing downstream matters. Capped below full weight
 *                        because major engines also ingest via search indexes
 *                        and user-triggered fetches that bypass robots rules.
 *   citability     0.25  The core of GEO. LLMs quote passages, not pages: the
 *                        highest weight goes to whether the content is chunked
 *                        into self-contained, fact-rich, answer-shaped blocks.
 *   structuredData 0.20  How machines disambiguate WHO says WHAT. JSON-LD and
 *                        social-preview metadata feed entity recognition and
 *                        answer attribution.
 *   eeat           0.15  Trust signals (author, publisher, sourcing). Real but
 *                        secondary: engines infer authority mostly off-page,
 *                        so on-page signals get a supporting weight.
 *   technical      0.20  Rendering and hygiene. Weighted at par with access
 *                        because a client-side-rendered page is effectively
 *                        empty to most AI crawlers (they do not execute JS).
 *
 * Weights sum to 1. Per-check point allocations live next to each check and
 * always total 100 within a category.
 *
 * Platform readiness (ChatGPT / Perplexity / Google AI Overviews) is a
 * DERIVED view computed from the same checks — deliberately not part of the
 * composite, so no signal is double-counted.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const GEO_WEIGHTS = {
  aiAccess: 0.2,
  citability: 0.25,
  structuredData: 0.2,
  eeat: 0.15,
  technical: 0.2,
} as const;

export type GeoCategoryId = keyof typeof GEO_WEIGHTS;

export type CheckStatus = "pass" | "warn" | "fail";

export interface GeoCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  recommendation?: string;
  /** Points earned / available — drives impact-ordering of recommendations. */
  points: number;
  maxPoints: number;
}

export interface GeoCategory {
  id: GeoCategoryId;
  label: string;
  weight: number;
  /** 0–100: sum of check points (each category's maxPoints total 100). */
  score: number;
  checks: GeoCheck[];
}

export interface PlatformReadiness {
  id: "chatgpt" | "perplexity" | "google-ai-overviews";
  label: string;
  /** 0–100, derived from category/check results (not in the composite). */
  score: number;
  /** Concrete obstacles for this specific platform, worst first. */
  blockers: string[];
  /** One-line formula summary so the derivation is inspectable. */
  basis: string;
}

export interface GeoAuditResult {
  url: string;
  fetchedAt: string;
  overallScore: number;
  categories: GeoCategory[];
  /** Impact-ordered: (points lost × category weight), largest first. */
  recommendations: string[];
  platforms: PlatformReadiness[];
}

/* ── Network context (fetched alongside the page, injectable in tests) ──── */

export type FetchStatus = "ok" | "missing" | "error";

export interface AccessContext {
  /** robots.txt body when status is "ok". */
  robots: { status: FetchStatus; body?: string };
  /** llms.txt body when status is "ok". */
  llms: { status: FetchStatus; body?: string };
}

/** Used when analyze runs without network context (unit tests on pure HTML). */
export const UNKNOWN_ACCESS: AccessContext = {
  robots: { status: "error" },
  llms: { status: "error" },
};
