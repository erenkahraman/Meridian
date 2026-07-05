/**
 * schema.ts — Structured Data: how machines disambiguate who says what.
 *
 * JSON-LD is the strongest machine-readable statement of a page's entities
 * (publisher, article, FAQ…). Answer engines use it for attribution and
 * entity resolution; social-preview metadata (Open Graph / Twitter Card)
 * controls how the page is summarized when shared or cited.
 *
 * Point allocation (100 total) — rationale:
 *   JSON-LD present        20  Binary gateway for everything below.
 *   JSON-LD valid          15  Malformed JSON is invisible to machines.
 *   Schema completeness    30  The largest slice: a bare @type without its
 *                              expected properties barely helps an engine;
 *                              completeness is what makes schema useful.
 *   High-value coverage    15  Are the schema types this page SHOULD have
 *                              actually present (Organization/WebSite always;
 *                              Article/FAQPage when the page shape calls for
 *                              them)?
 *   Open Graph             10  Baseline preview metadata, widely consumed.
 *   Twitter Card           10  Same role for the X/Twitter pipeline.
 */

import * as cheerio from "cheerio";
import type { GeoCategory, GeoCheck } from "./types";
import { GEO_WEIGHTS } from "./types";

/* ── JSON-LD extraction ─────────────────────────────────────────────────── */

export interface JsonLdInfo {
  blocks: number;
  invalid: number;
  /** Flattened entities (across arrays and @graph wrappers). */
  entities: Record<string, unknown>[];
  types: string[];
}

export function extractJsonLd($: cheerio.CheerioAPI): JsonLdInfo {
  const scripts = $('script[type="application/ld+json"]');
  const entities: Record<string, unknown>[] = [];
  const types: string[] = [];
  let invalid = 0;

  scripts.each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const json = JSON.parse(raw);
      const nodes = Array.isArray(json) ? json : [json];
      for (const node of nodes) {
        const graph =
          node && typeof node === "object" && Array.isArray(node["@graph"])
            ? node["@graph"]
            : [node];
        for (const entity of graph) {
          if (!entity || typeof entity !== "object") continue;
          entities.push(entity as Record<string, unknown>);
          const t = (entity as Record<string, unknown>)["@type"];
          if (typeof t === "string") types.push(t);
          else if (Array.isArray(t))
            types.push(...t.filter((x): x is string => typeof x === "string"));
        }
      }
    } catch {
      invalid += 1;
    }
  });

  return { blocks: scripts.length, invalid, entities, types };
}

/* ── Per-type completeness profiles ─────────────────────────────────────── */

/**
 * Expected properties per schema type: what an answer engine actually reads.
 * "required" drives the completeness score; a type not listed here is
 * counted as present but not scored for completeness.
 */
const TYPE_PROFILES: Record<string, { required: string[] }> = {
  Organization: { required: ["name", "url", "logo", "sameAs"] },
  GovernmentOrganization: { required: ["name", "url", "logo", "sameAs"] },
  NGO: { required: ["name", "url", "logo", "sameAs"] },
  WebSite: { required: ["name", "url"] },
  WebPage: { required: ["name"] },
  Article: { required: ["headline", "datePublished", "author", "publisher"] },
  NewsArticle: { required: ["headline", "datePublished", "author", "publisher"] },
  ScholarlyArticle: { required: ["headline", "datePublished", "author", "publisher"] },
  Report: { required: ["headline", "datePublished", "author", "publisher"] },
  BreadcrumbList: { required: ["itemListElement"] },
  FAQPage: { required: ["mainEntity"] },
  Dataset: { required: ["name", "description"] },
  Person: { required: ["name"] },
};

interface CompletenessResult {
  type: string;
  present: string[];
  missing: string[];
  fraction: number;
}

export function checkCompleteness(info: JsonLdInfo): CompletenessResult[] {
  const results: CompletenessResult[] = [];
  for (const entity of info.entities) {
    const rawType = entity["@type"];
    const typeList =
      typeof rawType === "string"
        ? [rawType]
        : Array.isArray(rawType)
          ? rawType.filter((t): t is string => typeof t === "string")
          : [];
    for (const type of typeList) {
      const profile = TYPE_PROFILES[type];
      if (!profile) continue;
      const present = profile.required.filter((p) => {
        const v = entity[p];
        return v !== undefined && v !== null && v !== "";
      });
      results.push({
        type,
        present,
        missing: profile.required.filter((p) => !present.includes(p)),
        fraction: present.length / profile.required.length,
      });
    }
  }
  return results;
}

/* ── Category scorer ────────────────────────────────────────────────────── */

const QUESTION_HEADING = /\?\s*$/;

export function scoreStructuredData($: cheerio.CheerioAPI): GeoCategory {
  const checks: GeoCheck[] = [];
  const info = extractJsonLd($);

  /* JSON-LD present — 20 pts */
  checks.push(
    info.blocks > 0
      ? {
          id: "jsonld-present",
          label: "JSON-LD present",
          status: "pass",
          detail: `${info.blocks} ld+json block(s), ${info.entities.length} entit(ies).`,
          points: 20,
          maxPoints: 20,
        }
      : {
          id: "jsonld-present",
          label: "JSON-LD present",
          status: "fail",
          detail: "No application/ld+json scripts found.",
          recommendation:
            "Add JSON-LD structured data (start with Organization + WebSite, plus Article for dated content) so AI engines can resolve the page's entities and attribute its claims.",
          points: 0,
          maxPoints: 20,
        },
  );

  /* JSON-LD valid — 15 pts */
  if (info.blocks > 0) {
    checks.push(
      info.invalid === 0
        ? {
            id: "jsonld-valid",
            label: "JSON-LD valid",
            status: "pass",
            detail: "All JSON-LD blocks parse as valid JSON.",
            points: 15,
            maxPoints: 15,
          }
        : {
            id: "jsonld-valid",
            label: "JSON-LD valid",
            status: "fail",
            detail: `${info.invalid} JSON-LD block(s) fail to parse.`,
            recommendation:
              "Fix the malformed JSON-LD (validate with the Schema.org validator) — a block that does not parse is invisible to every machine consumer.",
            points: 0,
            maxPoints: 15,
          },
    );
  } else {
    checks.push({
      id: "jsonld-valid",
      label: "JSON-LD valid",
      status: "fail",
      detail: "Nothing to validate — no JSON-LD present.",
      recommendation:
        "Once JSON-LD is added, validate it so every block parses cleanly.",
      points: 0,
      maxPoints: 15,
    });
  }

  /* Schema completeness — 30 pts (average fraction across recognized types) */
  {
    const results = checkCompleteness(info);
    if (results.length === 0) {
      checks.push({
        id: "schema-completeness",
        label: "Schema completeness",
        status: info.blocks > 0 ? "warn" : "fail",
        detail:
          info.blocks > 0
            ? `No recognized high-value types among: ${[...new Set(info.types)].join(", ") || "(none declared)"}.`
            : "No schema to assess.",
        recommendation:
          "Declare recognized schema types (Organization, WebSite, Article, FAQPage, BreadcrumbList) with their core properties filled in.",
        points: info.blocks > 0 ? 8 : 0,
        maxPoints: 30,
      });
    } else {
      const avg =
        results.reduce((s, r) => s + r.fraction, 0) / results.length;
      const points = Math.round(avg * 30);
      const incomplete = results.filter((r) => r.missing.length > 0);
      checks.push({
        id: "schema-completeness",
        label: "Schema completeness",
        status: avg >= 0.99 ? "pass" : avg >= 0.6 ? "warn" : "fail",
        detail: `${results.length} recognized entit(ies), ${Math.round(avg * 100)}% of expected properties present${
          incomplete.length > 0
            ? ` — missing: ${incomplete
                .slice(0, 3)
                .map((r) => `${r.type}(${r.missing.join(", ")})`)
                .join("; ")}`
            : ""
        }.`,
        ...(avg < 0.99 && {
          recommendation: `Complete the schema entities: ${incomplete
            .slice(0, 3)
            .map((r) => `${r.type} is missing ${r.missing.join(", ")}`)
            .join("; ")} — engines only use properties that are actually present.`,
        }),
        points,
        maxPoints: 30,
      });
    }
  }

  /* High-value coverage — 15 pts */
  {
    const present = new Set(info.types);
    const needed: { type: string; why: string }[] = [
      { type: "Organization", why: "identifies the publisher entity" },
      { type: "WebSite", why: "identifies the site" },
    ];
    const looksLikeArticle =
      $("article").length > 0 ||
      ($('meta[property="og:type"]').attr("content") ?? "") === "article" ||
      info.types.some((t) =>
        ["Article", "NewsArticle", "ScholarlyArticle", "Report"].includes(t),
      );
    if (looksLikeArticle) {
      needed.push({ type: "Article", why: "the page is article-shaped" });
    }
    const questionHeadings = $("h2, h3")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((h) => QUESTION_HEADING.test(h));
    if (questionHeadings.length >= 2) {
      needed.push({
        type: "FAQPage",
        why: `${questionHeadings.length} question-form headings present`,
      });
    }

    const satisfies = (want: string) =>
      want === "Organization"
        ? ["Organization", "GovernmentOrganization", "NGO"].some((t) =>
            present.has(t),
          )
        : want === "Article"
          ? ["Article", "NewsArticle", "ScholarlyArticle", "Report"].some((t) =>
              present.has(t),
            )
          : present.has(want);
    const missing = needed.filter((n) => !satisfies(n.type));
    const points = Math.round(
      ((needed.length - missing.length) / needed.length) * 15,
    );
    checks.push({
      id: "schema-coverage",
      label: "High-value schema coverage",
      status: missing.length === 0 ? "pass" : points >= 8 ? "warn" : "fail",
      detail:
        missing.length === 0
          ? `All ${needed.length} expected type(s) for this page shape are present.`
          : `Missing: ${missing.map((m) => m.type).join(", ")}.`,
      ...(missing.length > 0 && {
        recommendation: `Add the missing high-value schema type(s): ${missing
          .map((m) => `${m.type} (${m.why})`)
          .join("; ")}.`,
      }),
      points,
      maxPoints: 15,
    });
  }

  /* Open Graph — 10 pts, scaled over 4 core tags */
  {
    const tags = ["og:title", "og:description", "og:type", "og:image"];
    const found = tags.filter(
      (t) => !!$(`meta[property="${t}"]`).attr("content"),
    );
    const points = Math.round((found.length / tags.length) * 10);
    checks.push({
      id: "open-graph",
      label: "Open Graph metadata",
      status: found.length === 4 ? "pass" : found.length >= 2 ? "warn" : "fail",
      detail: `${found.length}/4 core og: tags present${found.length < 4 ? ` (missing ${tags.filter((t) => !found.includes(t)).join(", ")})` : ""}.`,
      ...(found.length < 4 && {
        recommendation:
          "Complete the Open Graph tags (og:title, og:description, og:type, og:image) to control how the page is titled and summarized when engines and platforms preview it.",
      }),
      points,
      maxPoints: 10,
    });
  }

  /* Twitter Card — 10 pts */
  {
    const card = $('meta[name="twitter:card"]').attr("content");
    const title =
      $('meta[name="twitter:title"]').attr("content") ||
      $('meta[property="og:title"]').attr("content"); // OG fallback is honored
    const points = card && title ? 10 : card ? 6 : 0;
    checks.push({
      id: "twitter-card",
      label: "Twitter Card metadata",
      status: points === 10 ? "pass" : points > 0 ? "warn" : "warn",
      detail: card
        ? `twitter:card="${card}"${title ? ", title resolvable" : ", no title"}.`
        : "No twitter:card tag.",
      ...(points < 10 && {
        recommendation:
          "Add twitter:card (summary_large_image) with a resolvable title/description — the X pipeline feeds several AI surfaces' previews.",
      }),
      points,
      maxPoints: 10,
    });
  }

  return {
    id: "structuredData",
    label: "Structured Data",
    weight: GEO_WEIGHTS.structuredData,
    score: checks.reduce((s, c) => s + c.points, 0),
    checks,
  };
}
