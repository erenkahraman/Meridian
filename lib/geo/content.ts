/**
 * content.ts — Content Citability: is this page shaped like something an LLM
 * can lift a quote from?
 *
 * Answer engines cite PASSAGES, not pages. A passage gets cited when it is
 * self-contained (readable without surrounding context), fact-rich (contains
 * verifiable specifics), and answer-shaped (framed against a clear question
 * or topic). Every check here operationalizes one of those properties.
 *
 * Point allocation (100 total) — rationale:
 *   Passage structure    25  The dominant mechanical factor: blocks in the
 *                            quotable 40–170-word range (sweet spot ~130–170)
 *                            map directly onto extractable chunks.
 *   Fact density         20  Numbers, years, percentages give an engine
 *                            something concrete to attribute.
 *   Answer-directness    20  Question-framed headings + a direct lead let a
 *                            model match query → heading → quotable answer.
 *   Heading hierarchy    15  Clean H1→H2→H3 nesting is how chunkers segment
 *                            the document; broken nesting breaks chunking.
 *   Freshness            20  Engines strongly prefer dateable, recent
 *                            content; undated pages lose citations to dated
 *                            competitors.
 */

import * as cheerio from "cheerio";
import type { GeoCategory, GeoCheck } from "./types";
import { GEO_WEIGHTS } from "./types";

/* ── Main-content extraction ────────────────────────────────────────────── */

/**
 * Best-effort main content: prefer <main>/<article>, else <body> minus
 * chrome (nav/header/footer/aside) and non-content elements.
 */
export function extractMain($: cheerio.CheerioAPI): cheerio.Cheerio<never> {
  const main = $("main, article").first();
  if (main.length > 0) return main as cheerio.Cheerio<never>;
  const body = $("body").clone();
  body.find("nav, header, footer, aside, script, style, noscript").remove();
  return body as cheerio.Cheerio<never>;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Text blocks (paragraphs + list items) from the main content, ≥ 15 words. */
function contentBlocks($: cheerio.CheerioAPI): string[] {
  const main = extractMain($);
  const blocks: string[] = [];
  $(main)
    .find("p, li")
    .each((_, el) => {
      // Skip nested li→p double counting: only take <li> without <p> children.
      if (el.tagName === "li" && $(el).find("p").length > 0) return;
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (wordCount(text) >= 15) blocks.push(text);
    });
  return blocks;
}

/* ── Fact density ───────────────────────────────────────────────────────── */

/**
 * Conservative "fact token" counter: numbers, percentages, currency amounts,
 * years, and magnitude words. Deliberately excludes proper-noun heuristics —
 * too noisy to defend.
 */
export function countFacts(text: string): number {
  const patterns = [
    /\d[\d,.]*\s*(?:%|percent|per cent)/gi, // percentages
    /(?:€|\$|£)\s?\d[\d,.]*/g, // currency
    /\b(?:19|20)\d{2}\b/g, // years
    /\d[\d,.]*\s*(?:million|billion|trillion)/gi, // magnitudes
    /(?<![\d,.%€$£])\b\d[\d,.]*\b(?!\s*(?:%|percent|million|billion|trillion))/g, // bare numbers
  ];
  return patterns.reduce((n, re) => n + (text.match(re) ?? []).length, 0);
}

/* ── Freshness ──────────────────────────────────────────────────────────── */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS = MONTH_NAMES.join("|");

/**
 * Parse "20 June 2026" / "June 2026" into a UTC date explicitly — the
 * platform Date parser treats these as LOCAL time, which shifts the ISO date
 * across timezones and makes results environment-dependent.
 */
function parseTextualDate(text: string): Date | null {
  const m = text.match(
    new RegExp(`^(?:(\\d{1,2})\\s+)?(${MONTHS})\\s+((?:19|20)\\d{2})$`),
  );
  if (!m) return null;
  const day = m[1] ? Number(m[1]) : 1;
  const month = MONTH_NAMES.indexOf(m[2]);
  return new Date(Date.UTC(Number(m[3]), month, day));
}

/** Collect every parseable date signal on the page; returns the most recent. */
export function extractLatestDate(
  $: cheerio.CheerioAPI,
  now: Date,
): Date | null {
  const candidates: string[] = [];

  $("time[datetime]").each((_, el) => {
    candidates.push($(el).attr("datetime") ?? "");
  });
  for (const sel of [
    'meta[property="article:published_time"]',
    'meta[property="article:modified_time"]',
    'meta[name="date"]',
    'meta[name="last-modified"]',
  ]) {
    const v = $(sel).attr("content");
    if (v) candidates.push(v);
  }
  // JSON-LD datePublished / dateModified
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    for (const m of raw.matchAll(
      /"date(?:Published|Modified)"\s*:\s*"([^"]+)"/g,
    )) {
      candidates.push(m[1]);
    }
  });
  // Visible textual dates: "Updated 12 March 2026", "March 2026", "2026-03-12"
  const bodyText = $("body").text();
  for (const m of bodyText.matchAll(
    new RegExp(`\\b(?:\\d{1,2}\\s+)?(?:${MONTHS})\\s+(?:19|20)\\d{2}\\b`, "g"),
  )) {
    candidates.push(m[0]);
  }
  for (const m of bodyText.matchAll(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g)) {
    candidates.push(m[0]);
  }

  let latest: Date | null = null;
  const ceiling = now.getTime() + 24 * 3600 * 1000; // ignore future dates
  for (const c of candidates) {
    const d = parseTextualDate(c.trim()) ?? new Date(c);
    if (Number.isNaN(d.getTime()) || d.getTime() > ceiling) continue;
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

/* ── Category scorer ────────────────────────────────────────────────────── */

const QUESTION_WORDS =
  /^(how|what|why|when|where|which|who|whose|should|can|could|does|do|did|is|are|will)\b/i;

export function scoreCitability(
  $: cheerio.CheerioAPI,
  now: Date = new Date(),
): GeoCategory {
  const checks: GeoCheck[] = [];
  const blocks = contentBlocks($);

  /* Passage structure — 25 pts */
  {
    const citable = blocks.filter((b) => {
      const w = wordCount(b);
      return w >= 40 && w <= 170;
    });
    const oversized = blocks.filter((b) => wordCount(b) > 250);
    const ratio = blocks.length > 0 ? citable.length / blocks.length : 0;
    const points =
      blocks.length === 0 ? 0 : ratio >= 0.5 ? 25 : ratio >= 0.25 ? 15 : 6;
    checks.push({
      id: "passage-structure",
      label: "Quotable passage structure",
      status: points === 25 ? "pass" : points >= 15 ? "warn" : "fail",
      detail:
        blocks.length === 0
          ? "No substantive text blocks (≥15 words) found in the main content."
          : `${citable.length}/${blocks.length} block(s) in the quotable 40–170-word range${oversized.length > 0 ? `; ${oversized.length} oversized (>250 words)` : ""}.`,
      ...(points < 25 && {
        recommendation:
          blocks.length === 0
            ? "Add substantive body text: AI engines can only cite pages that contain self-contained prose passages."
            : "Restructure body text into self-contained passages of roughly 40–170 words (sweet spot 130–170): one idea per block, understandable without surrounding context, so an engine can lift it verbatim.",
      }),
      points,
      maxPoints: 25,
    });
  }

  /* Fact density — 20 pts */
  {
    const text = blocks.join(" ");
    const words = wordCount(text);
    const facts = countFacts(text);
    const per100 = words > 0 ? (facts / words) * 100 : 0;
    const points = words === 0 ? 0 : per100 >= 2.5 ? 20 : per100 >= 1.2 ? 12 : 5;
    checks.push({
      id: "fact-density",
      label: "Fact density",
      status: points === 20 ? "pass" : points >= 12 ? "warn" : "fail",
      detail:
        words === 0
          ? "No main-content text to evaluate."
          : `${facts} fact token(s) (numbers, %, years, amounts) in ${words} words — ${per100.toFixed(1)}/100 words.`,
      ...(points < 20 && {
        recommendation:
          "Anchor claims with concrete figures (statistics, years, quantities): passages containing verifiable specifics are far likelier to be selected and attributed by answer engines.",
      }),
      points,
      maxPoints: 20,
    });
  }

  /* Answer-directness — 20 pts (12 question-framed headings + 8 direct lead) */
  {
    const subheads = $("h2, h3")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    const questions = subheads.filter(
      (h) => /\?\s*$/.test(h) || QUESTION_WORDS.test(h),
    );
    const qFrac = subheads.length > 0 ? questions.length / subheads.length : 0;
    const headPoints =
      subheads.length === 0 ? 0 : qFrac >= 0.3 ? 12 : qFrac > 0 ? 8 : 4;

    const lead = blocks[0] ?? "";
    const leadWords = wordCount(lead);
    const leadDirect = leadWords >= 20 && leadWords <= 90;
    const leadPoints = leadDirect ? 8 : leadWords > 0 ? 4 : 0;

    const points = headPoints + leadPoints;
    checks.push({
      id: "answer-directness",
      label: "Answer-directness",
      status: points >= 16 ? "pass" : points >= 10 ? "warn" : "fail",
      detail: `${questions.length}/${subheads.length} subheading(s) question-framed; lead paragraph ${
        leadWords === 0 ? "missing" : `${leadWords} words${leadDirect ? " (direct)" : ""}`
      }.`,
      ...(points < 16 && {
        recommendation:
          "Frame key subheadings as the questions users actually ask (e.g. “How does the global minimum tax work?”) and open with a 20–90-word paragraph that answers the page's core question directly — engines match query to heading, then quote the answer beneath it.",
      }),
      points,
      maxPoints: 20,
    });
  }

  /* Heading hierarchy — 15 pts (7 single H1, 4 no skips, 4 has H2s) */
  {
    const h1Count = $("h1").length;
    const levels = $("h1,h2,h3,h4,h5,h6")
      .map((_, el) => Number(el.tagName.slice(1)))
      .get();
    let skipped = false;
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] > levels[i - 1] + 1) {
        skipped = true;
        break;
      }
    }
    const h1Points = h1Count === 1 ? 7 : 0;
    const orderPoints = levels.length > 0 && !skipped ? 4 : 0;
    const h2Points = $("h2").length >= 2 ? 4 : 0;
    const points = h1Points + orderPoints + h2Points;
    checks.push({
      id: "heading-hierarchy",
      label: "Heading hierarchy",
      status: points === 15 ? "pass" : points >= 7 ? "warn" : "fail",
      detail: `${h1Count} H1; ${$("h2").length} H2; ${skipped ? "levels skip" : "no skipped levels"}.`,
      ...(points < 15 && {
        recommendation:
          "Use exactly one H1, at least two H2 sections, and never skip heading levels — chunkers segment the page along the heading tree, and a broken tree produces broken chunks.",
      }),
      points,
      maxPoints: 15,
    });
  }

  /* Freshness — 20 pts */
  {
    const latest = extractLatestDate($, now);
    const days = latest
      ? (now.getTime() - latest.getTime()) / (24 * 3600 * 1000)
      : Infinity;
    const points = latest ? (days <= 365 ? 20 : days <= 730 ? 12 : 5) : 0;
    checks.push({
      id: "freshness",
      label: "Content freshness",
      status: points === 20 ? "pass" : points >= 5 ? "warn" : "fail",
      detail: latest
        ? `Most recent date signal: ${latest.toISOString().slice(0, 10)} (${Math.round(days)} days ago).`
        : "No machine-readable or textual date signal found.",
      ...(points < 20 && {
        recommendation: latest
          ? "Refresh the content and update the visible + machine-readable dates (dateModified, article:modified_time): answer engines systematically prefer recently-dated sources."
          : "Add visible and machine-readable dates (a dated byline, <time datetime>, JSON-LD datePublished/dateModified) — undated pages lose citations to dateable competitors.",
      }),
      points,
      maxPoints: 20,
    });
  }

  return {
    id: "citability",
    label: "Content Citability",
    weight: GEO_WEIGHTS.citability,
    score: checks.reduce((s, c) => s + c.points, 0),
    checks,
  };
}
