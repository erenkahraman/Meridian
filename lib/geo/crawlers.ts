/**
 * crawlers.ts — the AI access layer: which AI crawlers may fetch this page.
 *
 * Contains the AI-crawler registry, a robots.txt evaluator (RFC 9309
 * semantics: group selection by most-specific user-agent token, rule
 * precedence by longest matching path, allow wins ties), an llms.txt quality
 * analyzer, and the category scorer.
 *
 * Point allocation (100 total) — rationale:
 *   robots.txt readable      10  Hygiene: a missing file is implicit
 *                                allow-all, so absence is only a warn.
 *   AI crawlers allowed      50  The heart of the category. Weighted by
 *                                crawler tier (see registry) so blocking
 *                                GPTBot costs more than blocking a minor bot.
 *   llms.txt                 25  Emerging standard; presence + structure is a
 *                                cheap, high-leverage discoverability signal.
 *   meta robots directives   15  noindex/noai on the page overrides
 *                                everything and silently removes the page
 *                                from answer engines.
 */

import * as cheerio from "cheerio";
import type { AccessContext, GeoCategory, GeoCheck } from "./types";
import { GEO_WEIGHTS } from "./types";

/* ── AI crawler registry ────────────────────────────────────────────────── */

export interface AiCrawler {
  /** The user-agent token matched against robots.txt groups. */
  token: string;
  vendor: string;
  purpose: "training" | "search" | "user-fetch";
  /**
   * Tier 1 (weight 2): crawlers behind the major consumer answer engines —
   * being blocked here directly removes the page from visible AI answers.
   * Tier 2 (weight 1): training/aggregation crawlers — influence future model
   * knowledge but not today's answers.
   */
  tier: 1 | 2;
}

export const AI_CRAWLERS: AiCrawler[] = [
  { token: "GPTBot", vendor: "OpenAI", purpose: "training", tier: 1 },
  { token: "OAI-SearchBot", vendor: "OpenAI", purpose: "search", tier: 1 },
  { token: "ChatGPT-User", vendor: "OpenAI", purpose: "user-fetch", tier: 1 },
  { token: "ClaudeBot", vendor: "Anthropic", purpose: "training", tier: 1 },
  { token: "Claude-SearchBot", vendor: "Anthropic", purpose: "search", tier: 1 },
  { token: "Claude-User", vendor: "Anthropic", purpose: "user-fetch", tier: 1 },
  { token: "PerplexityBot", vendor: "Perplexity", purpose: "search", tier: 1 },
  { token: "Perplexity-User", vendor: "Perplexity", purpose: "user-fetch", tier: 1 },
  { token: "Google-Extended", vendor: "Google", purpose: "training", tier: 1 },
  { token: "Googlebot", vendor: "Google", purpose: "search", tier: 1 },
  { token: "Bingbot", vendor: "Microsoft", purpose: "search", tier: 1 },
  { token: "CCBot", vendor: "Common Crawl", purpose: "training", tier: 2 },
  { token: "Applebot-Extended", vendor: "Apple", purpose: "training", tier: 2 },
  { token: "Amazonbot", vendor: "Amazon", purpose: "search", tier: 2 },
  { token: "Meta-ExternalAgent", vendor: "Meta", purpose: "training", tier: 2 },
  { token: "FacebookBot", vendor: "Meta", purpose: "training", tier: 2 },
  { token: "Bytespider", vendor: "ByteDance", purpose: "training", tier: 2 },
  { token: "cohere-ai", vendor: "Cohere", purpose: "training", tier: 2 },
];

/* ── robots.txt evaluation ──────────────────────────────────────────────── */

interface RobotsGroup {
  agents: string[]; // lowercased user-agent tokens
  rules: { allow: boolean; path: string }[];
}

/** Parse robots.txt into user-agent groups (comments stripped). */
export function parseRobots(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();

    if (field === "user-agent") {
      // Consecutive user-agent lines share one group; otherwise start fresh.
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      if (!current) continue; // rules before any user-agent are ignored
      current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    }
  }
  return groups;
}

/** Convert a robots.txt path pattern (with * and $) into a RegExp. */
function pathPattern(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\\\$$/, "$");
  return new RegExp(`^${escaped}`);
}

/**
 * RFC 9309 evaluation for one crawler token and path:
 * pick the group with the most specific matching agent token ("*" as
 * fallback), then apply the longest-path-match rule; allow wins ties.
 */
export function isAllowed(
  groups: RobotsGroup[],
  crawlerToken: string,
  path = "/",
): boolean {
  const token = crawlerToken.toLowerCase();

  let best: { specificity: number; group: RobotsGroup } | null = null;
  for (const group of groups) {
    for (const agent of group.agents) {
      let specificity = -1;
      if (agent === "*") specificity = 0;
      else if (token === agent || token.startsWith(agent) || agent.startsWith(token))
        specificity = agent.length;
      if (specificity >= 0 && (!best || specificity > best.specificity)) {
        best = { specificity, group };
      }
    }
  }
  if (!best) return true; // no applicable group → allowed

  let verdict = true;
  let bestLen = -1;
  for (const rule of best.group.rules) {
    if (rule.path === "") {
      // "Disallow:" (empty) means allow-all; only meaningful at len 0.
      if (bestLen < 0 && !rule.allow) verdict = true;
      continue;
    }
    if (pathPattern(rule.path).test(path)) {
      const len = rule.path.length;
      if (len > bestLen || (len === bestLen && rule.allow)) {
        bestLen = len;
        verdict = rule.allow;
      }
    }
  }
  return verdict;
}

export interface CrawlerVerdict extends AiCrawler {
  allowed: boolean;
}

/** Evaluate every registered AI crawler against a robots.txt body. */
export function evaluateCrawlers(
  robotsBody: string,
  path = "/",
): CrawlerVerdict[] {
  const groups = parseRobots(robotsBody);
  return AI_CRAWLERS.map((c) => ({
    ...c,
    allowed: isAllowed(groups, c.token, path),
  }));
}

/* ── llms.txt quality ───────────────────────────────────────────────────── */

export interface LlmsTxtQuality {
  hasTitle: boolean; // "# Site Name" heading (required by the spec)
  hasSummary: boolean; // "> one-line description" blockquote
  linkCount: number; // markdown links to key resources
  sectionCount: number; // "## Section" groupings
}

export function analyzeLlmsTxt(body: string): LlmsTxtQuality {
  return {
    hasTitle: /^#\s+\S/m.test(body),
    hasSummary: /^>\s+\S/m.test(body),
    linkCount: (body.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length,
    sectionCount: (body.match(/^##\s+\S/gm) ?? []).length,
  };
}

/* ── Category scorer ────────────────────────────────────────────────────── */

export function scoreAiAccess(
  $: cheerio.CheerioAPI,
  ctx: AccessContext,
  pagePath = "/",
): GeoCategory {
  const checks: GeoCheck[] = [];

  /* robots.txt readable — 10 pts */
  if (ctx.robots.status === "ok") {
    checks.push({
      id: "robots-present",
      label: "robots.txt readable",
      status: "pass",
      detail: "robots.txt fetched and parsed.",
      points: 10,
      maxPoints: 10,
    });
  } else if (ctx.robots.status === "missing") {
    checks.push({
      id: "robots-present",
      label: "robots.txt readable",
      status: "warn",
      detail: "No robots.txt found — crawlers treat this as allow-all.",
      recommendation:
        "Publish a robots.txt to make crawler policy explicit and to host AI-crawler directives deliberately rather than by default.",
      points: 6,
      maxPoints: 10,
    });
  } else {
    checks.push({
      id: "robots-present",
      label: "robots.txt readable",
      status: "warn",
      detail: "robots.txt could not be fetched — crawler policy unknown.",
      recommendation:
        "Ensure robots.txt is reachable over HTTPS; an unreachable file leaves AI-crawler policy ambiguous.",
      points: 5,
      maxPoints: 10,
    });
  }

  /* AI crawlers allowed — 50 pts, tier-weighted */
  if (ctx.robots.status === "ok") {
    const verdicts = evaluateCrawlers(ctx.robots.body ?? "", pagePath);
    const weight = (c: AiCrawler) => (c.tier === 1 ? 2 : 1);
    const total = verdicts.reduce((s, v) => s + weight(v), 0);
    const allowed = verdicts.filter((v) => v.allowed);
    const allowedWeight = allowed.reduce((s, v) => s + weight(v), 0);
    const blocked = verdicts.filter((v) => !v.allowed);
    const points = Math.round((allowedWeight / total) * 50);

    const status = blocked.length === 0 ? "pass" : points >= 30 ? "warn" : "fail";
    checks.push({
      id: "ai-crawlers",
      label: "AI crawlers allowed",
      status,
      detail:
        blocked.length === 0
          ? `All ${verdicts.length} tracked AI crawlers may fetch this page.`
          : `${blocked.length}/${verdicts.length} AI crawlers blocked: ${blocked
              .map((b) => b.token)
              .join(", ")}.`,
      ...(blocked.length > 0 && {
        recommendation: `Allow the blocked AI crawlers in robots.txt (${blocked
          .slice(0, 5)
          .map((b) => b.token)
          .join(", ")}${blocked.length > 5 ? ", …" : ""}) unless exclusion is a deliberate policy — each block removes the page from that engine's answers or training corpus.`,
      }),
      points,
      maxPoints: 50,
    });
  } else {
    // Unknown policy: middle score, flagged — we refuse to fabricate a verdict.
    checks.push({
      id: "ai-crawlers",
      label: "AI crawlers allowed",
      status: "warn",
      detail: "Cannot verify AI-crawler policy without a readable robots.txt.",
      recommendation:
        "Make robots.txt reachable so AI-crawler access can be verified and controlled.",
      points: 25,
      maxPoints: 50,
    });
  }

  /* llms.txt — 25 pts */
  if (ctx.llms.status === "ok") {
    const q = analyzeLlmsTxt(ctx.llms.body ?? "");
    const structured = q.hasTitle && q.linkCount >= 1;
    if (structured) {
      const rich = q.hasSummary && q.sectionCount >= 1 && q.linkCount >= 3;
      checks.push({
        id: "llms-txt",
        label: "llms.txt",
        status: rich ? "pass" : "warn",
        detail: `llms.txt present (${q.linkCount} link(s), ${q.sectionCount} section(s)${q.hasSummary ? ", summary" : ", no summary"}).`,
        ...(!rich && {
          recommendation:
            "Enrich llms.txt: add a one-line “>” summary and group key resources under “##” sections with at least a few links.",
        }),
        points: rich ? 25 : 18,
        maxPoints: 25,
      });
    } else {
      checks.push({
        id: "llms-txt",
        label: "llms.txt",
        status: "warn",
        detail: "llms.txt exists but lacks the expected structure (# title + links).",
        recommendation:
          "Restructure llms.txt to the spec: “# Site name”, “> summary”, then “##” sections of markdown links to the most important pages.",
        points: 10,
        maxPoints: 25,
      });
    }
  } else {
    checks.push({
      id: "llms-txt",
      label: "llms.txt",
      status: "fail",
      detail: "No llms.txt found.",
      recommendation:
        "Generate an llms.txt at the site root — a markdown index (# title, > summary, ## sections of links) that tells AI systems what the site contains and which pages matter most.",
      points: 0,
      maxPoints: 25,
    });
  }

  /* meta robots directives — 15 pts */
  const metaRobots = (
    $('meta[name="robots"]').attr("content") ?? ""
  ).toLowerCase();
  const blockedDirectives = ["noindex", "noai", "noimageai", "nosnippet"].filter(
    (d) => metaRobots.includes(d),
  );
  if (blockedDirectives.length === 0) {
    checks.push({
      id: "meta-robots",
      label: "Meta robots directives",
      status: "pass",
      detail: metaRobots
        ? `meta robots present ("${metaRobots}") with no blocking directives.`
        : "No blocking meta robots directives.",
      points: 15,
      maxPoints: 15,
    });
  } else {
    checks.push({
      id: "meta-robots",
      label: "Meta robots directives",
      status: "fail",
      detail: `Blocking directive(s) in meta robots: ${blockedDirectives.join(", ")}.`,
      recommendation: `Remove ${blockedDirectives.join(", ")} from the meta robots tag unless exclusion from search/AI results is intentional — these directives silently remove the page from answer engines.`,
      points: 0,
      maxPoints: 15,
    });
  }

  return {
    id: "aiAccess",
    label: "AI Access & Crawlability",
    weight: GEO_WEIGHTS.aiAccess,
    score: checks.reduce((s, c) => s + c.points, 0),
    checks,
  };
}
