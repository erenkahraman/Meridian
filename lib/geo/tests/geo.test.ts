/**
 * geo.test.ts — unit tests for the GEO audit.
 * Run with:  npm run test:geo   (tsx + node:test)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeHtml, GEO_WEIGHTS, AI_CRAWLERS, FetchHttpError } from "../index";
import { parseRobots, isAllowed, evaluateCrawlers, analyzeLlmsTxt } from "../crawlers";
import { countFacts, extractLatestDate } from "../content";
import * as cheerio from "cheerio";
import {
  WELL_OPTIMIZED_HTML,
  BARE_HTML,
  MALFORMED_SCHEMA_HTML,
  CLIENT_ONLY_HTML,
  ROBOTS_ALLOW_ALL,
  ROBOTS_BLOCK_AI,
  ROBOTS_BLOCK_ALL,
  ROBOTS_WILDCARD,
  LLMS_GOOD,
  LLMS_THIN,
  CTX_OPEN,
  CTX_BLOCKING,
  TEST_NOW,
} from "./fixtures";

const URL_ = "https://example.org/tax/minimum-tax";

/* ── Methodology invariants ─────────────────────────────────────────────── */

test("category weights sum to exactly 1", () => {
  const sum = Object.values(GEO_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 1000) / 1000, 1);
});

test("every category's check maxPoints total 100", () => {
  const result = analyzeHtml(WELL_OPTIMIZED_HTML, URL_, CTX_OPEN, TEST_NOW);
  for (const cat of result.categories) {
    const total = cat.checks.reduce((s, c) => s + c.maxPoints, 0);
    assert.equal(total, 100, `${cat.id} maxPoints must total 100`);
  }
});

test("every non-passing check carries a recommendation (all fixtures)", () => {
  for (const html of [WELL_OPTIMIZED_HTML, BARE_HTML, MALFORMED_SCHEMA_HTML, CLIENT_ONLY_HTML]) {
    for (const ctx of [CTX_OPEN, CTX_BLOCKING]) {
      const result = analyzeHtml(html, URL_, ctx, TEST_NOW);
      for (const cat of result.categories) {
        for (const check of cat.checks) {
          if (check.status !== "pass") {
            assert.ok(
              check.recommendation,
              `${cat.id}/${check.id} (${check.status}) is missing a recommendation`,
            );
          }
          assert.ok(check.points >= 0 && check.points <= check.maxPoints);
        }
      }
    }
  }
});

test("analysis is deterministic for fixed inputs", () => {
  const a = analyzeHtml(WELL_OPTIMIZED_HTML, URL_, CTX_OPEN, TEST_NOW);
  const b = analyzeHtml(WELL_OPTIMIZED_HTML, URL_, CTX_OPEN, TEST_NOW);
  assert.deepEqual(a, b);
});

/* ── Page archetypes ────────────────────────────────────────────────────── */

test("well-optimized page scores high with no failing checks", () => {
  const r = analyzeHtml(WELL_OPTIMIZED_HTML, URL_, CTX_OPEN, TEST_NOW);
  assert.ok(r.overallScore >= 85, `expected ≥85, got ${r.overallScore}`);
  const fails = r.categories.flatMap((c) => c.checks.filter((k) => k.status === "fail"));
  assert.deepEqual(fails.map((f) => f.id), [], "no check should fail");
  for (const cat of r.categories) {
    assert.ok(cat.score >= 70, `${cat.id} expected ≥70, got ${cat.score}`);
  }
});

test("bare page scores low and recommends the biggest gaps first", () => {
  const r = analyzeHtml(BARE_HTML, "http://example.org/x", CTX_BLOCKING, TEST_NOW);
  assert.ok(r.overallScore <= 35, `expected ≤35, got ${r.overallScore}`);
  assert.ok(r.recommendations.length >= 8);
  const text = r.recommendations.join(" ");
  assert.match(text, /llms\.txt/i);
  assert.match(text, /JSON-LD/);
  assert.match(text, /HTTPS/i);
});

test("malformed JSON-LD is flagged as invalid, not ignored", () => {
  const r = analyzeHtml(MALFORMED_SCHEMA_HTML, URL_, CTX_OPEN, TEST_NOW);
  const check = r.categories
    .find((c) => c.id === "structuredData")!
    .checks.find((k) => k.id === "jsonld-valid")!;
  assert.equal(check.status, "fail");
  assert.match(check.recommendation!, /malformed/i);
});

test("client-only page fails the SSR check with a rendering recommendation", () => {
  const r = analyzeHtml(CLIENT_ONLY_HTML, URL_, CTX_OPEN, TEST_NOW);
  const ssr = r.categories
    .find((c) => c.id === "technical")!
    .checks.find((k) => k.id === "ssr")!;
  assert.equal(ssr.status, "fail");
  assert.equal(ssr.points, 0);
  assert.match(ssr.recommendation!, /server-side|JavaScript/i);
});

/* ── robots.txt parser ──────────────────────────────────────────────────── */

test("allow-all robots permits every AI crawler", () => {
  const verdicts = evaluateCrawlers(ROBOTS_ALLOW_ALL);
  assert.ok(verdicts.every((v) => v.allowed));
  assert.equal(verdicts.length, AI_CRAWLERS.length);
});

test("targeted AI blocks hit only the named crawlers", () => {
  const verdicts = evaluateCrawlers(ROBOTS_BLOCK_AI);
  const blocked = verdicts.filter((v) => !v.allowed).map((v) => v.token).sort();
  assert.deepEqual(blocked, ["ClaudeBot", "GPTBot", "PerplexityBot"]);
  assert.ok(verdicts.find((v) => v.token === "Googlebot")!.allowed);
});

test("blanket disallow blocks everything", () => {
  const verdicts = evaluateCrawlers(ROBOTS_BLOCK_ALL);
  assert.ok(verdicts.every((v) => !v.allowed));
});

test("longest-path precedence: Allow overrides broader Disallow", () => {
  const groups = parseRobots(ROBOTS_WILDCARD);
  assert.equal(isAllowed(groups, "GPTBot", "/private/secret.html"), false);
  assert.equal(isAllowed(groups, "GPTBot", "/private/reports/annual.html"), true);
  assert.equal(isAllowed(groups, "GPTBot", "/docs/file.pdf"), false); // /*.pdf$
  assert.equal(isAllowed(groups, "GPTBot", "/docs/file.pdf?x=1"), true); // $ anchor
  assert.equal(isAllowed(groups, "GPTBot", "/public/page.html"), true);
});

test("specific user-agent group beats the * group", () => {
  const groups = parseRobots(`
User-agent: *
Disallow: /

User-agent: GPTBot
Allow: /
`);
  assert.equal(isAllowed(groups, "GPTBot", "/anything"), true);
  assert.equal(isAllowed(groups, "ClaudeBot", "/anything"), false);
});

test("missing robots.txt (no groups) means allowed", () => {
  assert.equal(isAllowed([], "GPTBot", "/"), true);
});

/* ── llms.txt quality ───────────────────────────────────────────────────── */

test("structured llms.txt is recognized as rich", () => {
  const q = analyzeLlmsTxt(LLMS_GOOD);
  assert.ok(q.hasTitle && q.hasSummary);
  assert.ok(q.linkCount >= 3 && q.sectionCount >= 2);
});

test("unstructured llms.txt is recognized as thin", () => {
  const q = analyzeLlmsTxt(LLMS_THIN);
  assert.ok(!q.hasTitle && q.linkCount === 0);
});

/* ── Content heuristics ─────────────────────────────────────────────────── */

test("fact counter finds percentages, currency, years, magnitudes", () => {
  const text =
    "In 2024 revenue rose 6.5% to $155 billion, up from €90 million in 2019.";
  assert.ok(countFacts(text) >= 5, `got ${countFacts(text)}`);
});

test("freshness picks the most recent date and respects the future ceiling", () => {
  const $ = cheerio.load(`<body>
    <time datetime="2024-01-15">old</time>
    <p>Updated 20 June 2026</p>
    <p>Scheduled for 15 March 2099</p>
  </body>`);
  const latest = extractLatestDate($, TEST_NOW)!;
  assert.equal(latest.toISOString().slice(0, 10), "2026-06-20");
});

/* ── Access context / platforms ─────────────────────────────────────────── */

test("blocking robots collapses the ChatGPT/Perplexity gates", () => {
  const open = analyzeHtml(WELL_OPTIMIZED_HTML, URL_, CTX_OPEN, TEST_NOW);
  const blocked = analyzeHtml(WELL_OPTIMIZED_HTML, URL_, CTX_BLOCKING, TEST_NOW);
  const gpt = (r: typeof open) => r.platforms.find((p) => p.id === "chatgpt")!;
  assert.ok(gpt(open).score - gpt(blocked).score >= 40 - 1);
  assert.ok(gpt(blocked).blockers.some((b) => /blocked/i.test(b)));
});

test("platform scores stay within 0–100 across all fixtures", () => {
  for (const html of [WELL_OPTIMIZED_HTML, BARE_HTML, CLIENT_ONLY_HTML]) {
    for (const ctx of [CTX_OPEN, CTX_BLOCKING]) {
      const r = analyzeHtml(html, URL_, ctx, TEST_NOW);
      for (const p of r.platforms) {
        assert.ok(p.score >= 0 && p.score <= 100, `${p.id}: ${p.score}`);
      }
    }
  }
});

/* ── Blocked-page error type ────────────────────────────────────────────── */

test("FetchHttpError carries the HTTP status for the blocked-page finding", () => {
  const err = new FetchHttpError(403, "Forbidden");
  assert.equal(err.status, 403);
  assert.ok(err instanceof Error);
  assert.match(err.message, /403/);
});
