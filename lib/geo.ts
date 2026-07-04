/**
 * geo.ts — GEO (Generative Engine Optimisation) audit.
 *
 * Scores how AI-readable a web page is across four categories drawn from the
 * project brief: structured data (JSON-LD), heading hierarchy, metadata, and
 * E-E-A-T signals. Each category is scored 0–100 from transparent point-based
 * checks; the overall score is their weighted sum. Every check that isn't a
 * clean pass contributes a specific, actionable recommendation.
 *
 * `analyzeHtml` is pure (HTML in, result out) so it is unit-testable; `auditUrl`
 * fetches then analyzes. The category weights below are a sensible default and
 * are easy to tune.
 */

import * as cheerio from "cheerio";

export type CheckStatus = "pass" | "warn" | "fail";

export interface GeoCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  recommendation?: string;
}

export interface GeoCategory {
  id: string;
  label: string;
  weight: number; // fraction of the overall score
  score: number; // 0–100
  checks: GeoCheck[];
}

export interface GeoAuditResult {
  url: string;
  fetchedAt: string;
  overallScore: number; // 0–100, weighted
  categories: GeoCategory[];
  recommendations: string[];
}

/** Category weights (sum to 1). Tune here if the emphasis should change. */
export const GEO_WEIGHTS = {
  structuredData: 0.3,
  headings: 0.25,
  metadata: 0.25,
  eeat: 0.2,
} as const;

/* ------------------------------------------------------------------ */
/* JSON-LD extraction                                                  */
/* ------------------------------------------------------------------ */

interface JsonLdInfo {
  blocks: number; // number of ld+json script tags
  parsed: unknown[]; // successfully parsed objects (flattened over @graph)
  invalid: number; // blocks that failed to parse
  types: string[]; // @type values found
}

function extractJsonLd($: cheerio.CheerioAPI): JsonLdInfo {
  const scripts = $('script[type="application/ld+json"]');
  const parsed: unknown[] = [];
  const types: string[] = [];
  let invalid = 0;

  scripts.each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const json = JSON.parse(raw);
      const nodes = Array.isArray(json) ? json : [json];
      for (const node of nodes) {
        // @graph wraps multiple entities in one block.
        const graph =
          node && typeof node === "object" && Array.isArray((node as any)["@graph"])
            ? (node as any)["@graph"]
            : [node];
        for (const entity of graph) {
          parsed.push(entity);
          const t = entity && (entity as any)["@type"];
          if (typeof t === "string") types.push(t);
          else if (Array.isArray(t)) types.push(...t.filter((x) => typeof x === "string"));
        }
      }
    } catch {
      invalid += 1;
    }
  });

  return { blocks: scripts.length, parsed, invalid, types };
}

/** Search parsed JSON-LD entities for the first non-empty value of a key. */
function findInJsonLd(parsed: unknown[], keys: string[]): unknown {
  for (const entity of parsed) {
    if (!entity || typeof entity !== "object") continue;
    for (const key of keys) {
      const val = (entity as Record<string, unknown>)[key];
      if (val !== undefined && val !== null && val !== "") return val;
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Category scorers                                                    */
/* ------------------------------------------------------------------ */

const RECOGNIZED_TYPES = new Set([
  "Organization",
  "GovernmentOrganization",
  "NGO",
  "WebSite",
  "WebPage",
  "Article",
  "NewsArticle",
  "Report",
  "ScholarlyArticle",
  "BreadcrumbList",
  "Dataset",
  "FAQPage",
]);

function scoreStructuredData(jsonld: JsonLdInfo): GeoCategory {
  const checks: GeoCheck[] = [];
  let points = 0;

  if (jsonld.blocks > 0) {
    points += 40;
    checks.push({
      id: "jsonld-present",
      label: "JSON-LD structured data present",
      status: "pass",
      detail: `${jsonld.blocks} ld+json block(s) found.`,
    });
  } else {
    checks.push({
      id: "jsonld-present",
      label: "JSON-LD structured data present",
      status: "fail",
      detail: "No application/ld+json scripts found.",
      recommendation:
        "Add JSON-LD structured data (e.g. Organization + WebPage/Article) so AI engines can reliably parse the page's entities.",
    });
  }

  if (jsonld.blocks > 0) {
    if (jsonld.invalid === 0) {
      points += 30;
      checks.push({
        id: "jsonld-valid",
        label: "JSON-LD parses without errors",
        status: "pass",
        detail: "All JSON-LD blocks are valid JSON.",
      });
    } else {
      checks.push({
        id: "jsonld-valid",
        label: "JSON-LD parses without errors",
        status: "fail",
        detail: `${jsonld.invalid} JSON-LD block(s) failed to parse.`,
        recommendation: "Fix the malformed JSON-LD so machines can read it.",
      });
    }

    const recognized = jsonld.types.filter((t) => RECOGNIZED_TYPES.has(t));
    if (recognized.length > 0) {
      points += 30;
      checks.push({
        id: "jsonld-types",
        label: "Recognized schema types",
        status: "pass",
        detail: `Types: ${[...new Set(jsonld.types)].join(", ")}.`,
      });
    } else {
      checks.push({
        id: "jsonld-types",
        label: "Recognized schema types",
        status: "warn",
        detail: jsonld.types.length
          ? `Only unrecognized types: ${[...new Set(jsonld.types)].join(", ")}.`
          : "No @type declared in JSON-LD.",
        recommendation:
          "Declare high-value schema types such as Organization, Article/Report, and BreadcrumbList.",
      });
    }
  }

  return {
    id: "structuredData",
    label: "Structured Data (JSON-LD)",
    weight: GEO_WEIGHTS.structuredData,
    score: points,
    checks,
  };
}

function scoreHeadings($: cheerio.CheerioAPI): GeoCategory {
  const checks: GeoCheck[] = [];
  let points = 0;

  const h1Count = $("h1").length;
  const levels: number[] = [];
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    levels.push(Number((el as any).tagName.slice(1)));
  });

  // Exactly one H1.
  if (h1Count === 1) {
    points += 40;
    checks.push({
      id: "single-h1",
      label: "Exactly one H1",
      status: "pass",
      detail: "Page has a single H1.",
    });
  } else {
    checks.push({
      id: "single-h1",
      label: "Exactly one H1",
      status: h1Count === 0 ? "fail" : "warn",
      detail: `${h1Count} H1 elements found.`,
      recommendation:
        h1Count === 0
          ? "Add a single, descriptive H1 stating the page's main topic."
          : "Reduce to exactly one H1 so the primary topic is unambiguous.",
    });
  }

  // Subheadings present.
  if ($("h2").length > 0) {
    points += 20;
    checks.push({
      id: "subheadings",
      label: "Section subheadings present",
      status: "pass",
      detail: `${$("h2").length} H2 subheading(s).`,
    });
  } else {
    checks.push({
      id: "subheadings",
      label: "Section subheadings present",
      status: "warn",
      detail: "No H2 subheadings found.",
      recommendation:
        "Break content into sections with H2 subheadings so AI can extract structure.",
    });
  }

  // No skipped heading levels (a level should not jump by >1).
  let skipped = false;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      skipped = true;
      break;
    }
  }
  if (levels.length === 0) {
    checks.push({
      id: "heading-order",
      label: "Logical heading order",
      status: "fail",
      detail: "No headings found at all.",
      recommendation: "Add a heading hierarchy (H1 → H2 → H3) to structure the page.",
    });
  } else if (!skipped) {
    points += 40;
    checks.push({
      id: "heading-order",
      label: "Logical heading order",
      status: "pass",
      detail: "Heading levels never jump by more than one.",
    });
  } else {
    checks.push({
      id: "heading-order",
      label: "Logical heading order",
      status: "warn",
      detail: "Heading levels skip (e.g. H2 → H4).",
      recommendation: "Avoid skipping heading levels; increase depth one step at a time.",
    });
  }

  return {
    id: "headings",
    label: "Heading Hierarchy",
    weight: GEO_WEIGHTS.headings,
    score: points,
    checks,
  };
}

function scoreMetadata($: cheerio.CheerioAPI): GeoCategory {
  const checks: GeoCheck[] = [];
  let points = 0;

  const title = $("title").first().text().trim();
  if (title.length >= 10 && title.length <= 70) {
    points += 25;
    checks.push({ id: "title", label: "Title tag", status: "pass", detail: `"${title}" (${title.length} chars).` });
  } else {
    checks.push({
      id: "title",
      label: "Title tag",
      status: title ? "warn" : "fail",
      detail: title ? `Title is ${title.length} chars (ideal 10–70).` : "No <title> tag.",
      recommendation: title
        ? "Adjust the title length to roughly 10–70 characters."
        : "Add a descriptive <title> tag.",
    });
  }

  const desc = $('meta[name="description"]').attr("content")?.trim() ?? "";
  if (desc.length >= 50 && desc.length <= 160) {
    points += 25;
    checks.push({ id: "description", label: "Meta description", status: "pass", detail: `${desc.length} chars.` });
  } else {
    checks.push({
      id: "description",
      label: "Meta description",
      status: desc ? "warn" : "fail",
      detail: desc ? `Description is ${desc.length} chars (ideal 50–160).` : "No meta description.",
      recommendation: desc
        ? "Tune the meta description to ~50–160 characters."
        : "Add a meta description summarizing the page.",
    });
  }

  if ($('link[rel="canonical"]').attr("href")) {
    points += 15;
    checks.push({ id: "canonical", label: "Canonical URL", status: "pass", detail: "Canonical link present." });
  } else {
    checks.push({
      id: "canonical",
      label: "Canonical URL",
      status: "warn",
      detail: "No canonical link.",
      recommendation: "Add a <link rel=\"canonical\"> to consolidate ranking/citation signals.",
    });
  }

  const hasOg =
    !!$('meta[property="og:title"]').attr("content") &&
    !!$('meta[property="og:description"]').attr("content");
  if (hasOg) {
    points += 20;
    checks.push({ id: "opengraph", label: "Open Graph tags", status: "pass", detail: "og:title and og:description present." });
  } else {
    checks.push({
      id: "opengraph",
      label: "Open Graph tags",
      status: "warn",
      detail: "Missing og:title and/or og:description.",
      recommendation: "Add Open Graph tags to control how the page is summarized when shared/cited.",
    });
  }

  const lang = $("html").attr("lang");
  if (lang) {
    points += 15;
    checks.push({ id: "lang", label: "HTML lang attribute", status: "pass", detail: `lang="${lang}".` });
  } else {
    checks.push({
      id: "lang",
      label: "HTML lang attribute",
      status: "warn",
      detail: "No lang attribute on <html>.",
      recommendation: "Set the <html lang> attribute so the content language is explicit.",
    });
  }

  return { id: "metadata", label: "Metadata", weight: GEO_WEIGHTS.metadata, score: points, checks };
}

function scoreEEAT($: cheerio.CheerioAPI, jsonld: JsonLdInfo, url: string): GeoCategory {
  const checks: GeoCheck[] = [];
  let points = 0;

  // Author / byline.
  const metaAuthor = $('meta[name="author"]').attr("content");
  const jsonAuthor = findInJsonLd(jsonld.parsed, ["author"]);
  if (metaAuthor || jsonAuthor) {
    points += 30;
    checks.push({ id: "author", label: "Author / attribution", status: "pass", detail: "Author metadata present." });
  } else {
    checks.push({
      id: "author",
      label: "Author / attribution",
      status: "warn",
      detail: "No author metadata (meta author or JSON-LD author).",
      recommendation: "Attribute content to a named author or the organization to strengthen Expertise/Authoritativeness.",
    });
  }

  // Dates.
  const metaDate =
    $('meta[property="article:published_time"]').attr("content") ||
    $('meta[property="article:modified_time"]').attr("content") ||
    $("time[datetime]").attr("datetime");
  const jsonDate = findInJsonLd(jsonld.parsed, ["datePublished", "dateModified"]);
  if (metaDate || jsonDate) {
    points += 30;
    checks.push({ id: "dates", label: "Publish / update dates", status: "pass", detail: "Date signal present." });
  } else {
    checks.push({
      id: "dates",
      label: "Publish / update dates",
      status: "warn",
      detail: "No published/modified date signal.",
      recommendation: "Expose published and modified dates (meta tags or JSON-LD) so freshness is machine-readable.",
    });
  }

  // Publisher / organization.
  const jsonPublisher = findInJsonLd(jsonld.parsed, ["publisher"]);
  const orgType = jsonld.types.some((t) =>
    ["Organization", "GovernmentOrganization", "NGO"].includes(t),
  );
  const siteName = $('meta[property="og:site_name"]').attr("content");
  if (jsonPublisher || orgType || siteName) {
    points += 20;
    checks.push({ id: "publisher", label: "Publisher / organization", status: "pass", detail: "Organization/publisher identified." });
  } else {
    checks.push({
      id: "publisher",
      label: "Publisher / organization",
      status: "warn",
      detail: "No publisher/organization signal.",
      recommendation: "Add Organization JSON-LD (with logo and sameAs) to establish Trust.",
    });
  }

  // Outbound references (weak citation signal).
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }
  let external = 0;
  $('a[href^="http"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    try {
      const h = new URL(href).hostname.replace(/^www\./, "");
      if (h && h !== host) external += 1;
    } catch {
      /* ignore */
    }
  });
  if (external > 0) {
    points += 20;
    checks.push({ id: "references", label: "Outbound references", status: "pass", detail: `${external} external link(s).` });
  } else {
    checks.push({
      id: "references",
      label: "Outbound references",
      status: "warn",
      detail: "No outbound links to external sources.",
      recommendation: "Cite authoritative external sources where relevant to reinforce Trustworthiness.",
    });
  }

  return { id: "eeat", label: "E-E-A-T Signals", weight: GEO_WEIGHTS.eeat, score: points, checks };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Analyze raw HTML and produce a GEO audit result. Pure / testable. */
export function analyzeHtml(html: string, url: string): GeoAuditResult {
  const $ = cheerio.load(html);
  const jsonld = extractJsonLd($);

  const categories: GeoCategory[] = [
    scoreStructuredData(jsonld),
    scoreHeadings($),
    scoreMetadata($),
    scoreEEAT($, jsonld, url),
  ];

  const overallScore = Math.round(
    categories.reduce((sum, c) => sum + c.score * c.weight, 0),
  );

  const recommendations = categories
    .flatMap((c) => c.checks)
    .filter((c) => c.status !== "pass" && c.recommendation)
    .map((c) => c.recommendation as string);

  return {
    url,
    fetchedAt: new Date().toISOString(),
    overallScore,
    categories,
    recommendations,
  };
}

/**
 * Thrown when the target returns an HTTP error. A 403 is surfaced to the UI as
 * a finding in its own right (bot protection ≈ AI crawlers may be blocked too),
 * not as a generic failure.
 */
export class FetchHttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(`Fetch failed: ${status} ${statusText}`);
    this.name = "FetchHttpError";
    this.status = status;
  }
}

/** Fetch a URL and audit it. */
export async function auditUrl(url: string): Promise<GeoAuditResult> {
  const res = await fetch(url, {
    headers: {
      // Identify politely; some sites vary output by UA.
      "User-Agent": "MeridianGEOAudit/1.0 (+https://oecd.org)",
      Accept: "text/html",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new FetchHttpError(res.status, res.statusText);
  }
  const html = await res.text();
  return analyzeHtml(html, url);
}

/* ------------------------------------------------------------------ */
/* Cached wrapper for the dashboard                                    */
/* ------------------------------------------------------------------ */

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
