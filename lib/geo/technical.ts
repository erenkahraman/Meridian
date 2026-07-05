/**
 * technical.ts — Technical Foundations: can a non-JS crawler actually read
 * this page, and is its metadata hygienic?
 *
 * Point allocation (100 total) — rationale:
 *   Server-side rendering  30  The decisive technical factor: most AI
 *                              crawlers do not execute JavaScript, so a
 *                              client-rendered page is effectively blank to
 *                              them. Nothing else in this category matters
 *                              if this fails.
 *   HTTPS                  10  Table stakes; crawlers deprioritize http://.
 *   Canonical URL          10  Consolidates citation signals onto one URL.
 *   Title hygiene          10  The single line engines display and match on.
 *   Meta description       10  Fallback summary for previews and snippets.
 *   Viewport (mobile)      10  Mobile-friendliness proxy readable from HTML.
 *   Language declared       5  Removes language-detection guesswork.
 *   Page weight            15  Oversized HTML gets truncated by fetch-time
 *                              token/byte budgets in AI pipelines.
 */

import * as cheerio from "cheerio";
import type { GeoCategory, GeoCheck } from "./types";
import { GEO_WEIGHTS } from "./types";
import { extractMain, wordCount } from "./content";

export function scoreTechnical(
  $: cheerio.CheerioAPI,
  url: string,
  htmlBytes: number,
): GeoCategory {
  const checks: GeoCheck[] = [];

  /* Server-side rendering — 30 pts */
  {
    const mainWords = wordCount($(extractMain($)).text());
    const scriptCount = $("script[src]").length;
    const emptyAppRoot =
      $("#root:empty, #__next:empty, #app:empty").length > 0;

    let points: number;
    let detail: string;
    if (mainWords >= 150) {
      points = 30;
      detail = `${mainWords} words of main content present in the raw HTML.`;
    } else if (mainWords >= 40) {
      points = 18;
      detail = `Only ${mainWords} words of main content in the raw HTML — thin for extraction.`;
    } else if (emptyAppRoot || scriptCount >= 5) {
      points = 0;
      detail = `Main content is nearly empty in the raw HTML (${mainWords} words, ${scriptCount} external scripts${emptyAppRoot ? ", empty app root" : ""}) — the page appears client-side rendered.`;
    } else {
      points = 5;
      detail = `Very little textual content in the raw HTML (${mainWords} words).`;
    }
    checks.push({
      id: "ssr",
      label: "Server-rendered content",
      status: points === 30 ? "pass" : points >= 18 ? "warn" : "fail",
      detail,
      ...(points < 30 && {
        recommendation:
          points === 0
            ? "Render the content server-side (SSR/SSG or prerendering): most AI crawlers do not execute JavaScript, so a client-rendered page is effectively invisible to them."
            : "Ensure the substantive content ships in the initial HTML rather than being injected by JavaScript — AI crawlers read the raw response only.",
      }),
      points,
      maxPoints: 30,
    });
  }

  /* HTTPS — 10 pts */
  {
    const secure = url.startsWith("https://");
    checks.push({
      id: "https",
      label: "HTTPS",
      status: secure ? "pass" : "fail",
      detail: secure ? "Served over HTTPS." : "Page is not served over HTTPS.",
      ...(!secure && {
        recommendation:
          "Serve the page over HTTPS — plain-HTTP pages are deprioritized or skipped by crawlers.",
      }),
      points: secure ? 10 : 0,
      maxPoints: 10,
    });
  }

  /* Canonical — 10 pts */
  {
    const canonical = $('link[rel="canonical"]').attr("href");
    checks.push({
      id: "canonical",
      label: "Canonical URL",
      status: canonical ? "pass" : "warn",
      detail: canonical ? `Canonical set to ${canonical}.` : "No canonical link.",
      ...(!canonical && {
        recommendation:
          "Declare a canonical URL so citation and ranking signals consolidate on one address instead of splitting across URL variants.",
      }),
      points: canonical ? 10 : 0,
      maxPoints: 10,
    });
  }

  /* Title hygiene — 10 pts */
  {
    const title = $("title").first().text().trim();
    const ok = title.length >= 10 && title.length <= 70;
    checks.push({
      id: "title",
      label: "Title tag",
      status: ok ? "pass" : title ? "warn" : "fail",
      detail: title
        ? `"${title.slice(0, 80)}" (${title.length} chars${ok ? "" : "; ideal 10–70"}).`
        : "No <title> tag.",
      ...(!ok && {
        recommendation: title
          ? "Adjust the title to roughly 10–70 characters, leading with the page's core topic."
          : "Add a descriptive <title> tag — it is the primary string engines match queries against.",
      }),
      points: ok ? 10 : title ? 5 : 0,
      maxPoints: 10,
    });
  }

  /* Meta description — 10 pts */
  {
    const desc = $('meta[name="description"]').attr("content")?.trim() ?? "";
    const ok = desc.length >= 50 && desc.length <= 160;
    checks.push({
      id: "description",
      label: "Meta description",
      status: ok ? "pass" : desc ? "warn" : "fail",
      detail: desc
        ? `${desc.length} chars${ok ? "" : " (ideal 50–160)"}.`
        : "No meta description.",
      ...(!ok && {
        recommendation: desc
          ? "Tune the meta description to ~50–160 characters summarizing the page's answer."
          : "Add a meta description — engines fall back to it for previews and snippet selection.",
      }),
      points: ok ? 10 : desc ? 5 : 0,
      maxPoints: 10,
    });
  }

  /* Viewport — 10 pts */
  {
    const viewport = $('meta[name="viewport"]').attr("content");
    checks.push({
      id: "viewport",
      label: "Mobile viewport",
      status: viewport ? "pass" : "warn",
      detail: viewport
        ? `viewport="${viewport}".`
        : "No viewport meta tag (mobile-friendliness signal missing).",
      ...(!viewport && {
        recommendation:
          "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> — mobile-friendliness feeds the quality signals AI pipelines inherit from search.",
      }),
      points: viewport ? 10 : 0,
      maxPoints: 10,
    });
  }

  /* Language — 5 pts */
  {
    const lang = $("html").attr("lang");
    checks.push({
      id: "lang",
      label: "Language declared",
      status: lang ? "pass" : "warn",
      detail: lang ? `lang="${lang}".` : "No lang attribute on <html>.",
      ...(!lang && {
        recommendation:
          "Set the <html lang> attribute so the content language is explicit instead of guessed.",
      }),
      points: lang ? 5 : 0,
      maxPoints: 5,
    });
  }

  /* Page weight — 15 pts */
  {
    const kb = Math.round(htmlBytes / 1024);
    const points = htmlBytes <= 150_000 ? 15 : htmlBytes <= 400_000 ? 9 : 3;
    checks.push({
      id: "page-weight",
      label: "HTML weight",
      status: points === 15 ? "pass" : points === 9 ? "warn" : "fail",
      detail: `Raw HTML is ${kb} KB${points < 15 ? " (heavy)" : ""}.`,
      ...(points < 15 && {
        recommendation:
          "Reduce raw HTML size (defer non-critical scripts, trim inlined data): AI fetchers work under byte/token budgets and truncate oversized documents, dropping whatever renders last.",
      }),
      points,
      maxPoints: 15,
    });
  }

  return {
    id: "technical",
    label: "Technical Foundations",
    weight: GEO_WEIGHTS.technical,
    score: checks.reduce((s, c) => s + c.points, 0),
    checks,
  };
}
