/**
 * eeat.ts — E-E-A-T: on-page trust signals (Experience, Expertise,
 * Authoritativeness, Trustworthiness).
 *
 * Engines mostly establish authority OFF-page (link graphs, entity
 * knowledge), which is why this category carries a supporting 0.15 weight.
 * What IS on-page and controllable: who wrote it, who published it, when,
 * what it cites, and whether it shows original evidence.
 *
 * Point allocation (100 total) — rationale:
 *   Author attribution     20  Named authorship is the single clearest
 *                              expertise signal a page can carry.
 *   Publisher identity     15  Ties content to a resolvable organization.
 *   Attribution dates      15  Machine-readable published/modified metadata
 *                              (presence here; RECENCY is scored separately
 *                              under Citability→freshness — no double count).
 *   Outbound citations     20  Sourcing: pages that cite are pages that can
 *                              be trusted (and get cited back).
 *   Authority indicators   15  Credentials, about/contact, sameAs profiles.
 *   Evidence artifacts     15  Tables, figures, quotes — marks of first-hand
 *                              material rather than paraphrase.
 */

import * as cheerio from "cheerio";
import type { GeoCategory, GeoCheck } from "./types";
import { GEO_WEIGHTS } from "./types";
import { extractJsonLd } from "./schema";
import { extractMain } from "./content";

function findInEntities(
  entities: Record<string, unknown>[],
  keys: string[],
): boolean {
  return entities.some((e) =>
    keys.some((k) => {
      const v = e[k];
      return v !== undefined && v !== null && v !== "";
    }),
  );
}

export function scoreEEAT($: cheerio.CheerioAPI, url: string): GeoCategory {
  const checks: GeoCheck[] = [];
  const jsonld = extractJsonLd($);
  const main = extractMain($);

  /* Author attribution — 20 pts */
  {
    const metaAuthor = !!$('meta[name="author"]').attr("content");
    const relAuthor = $('[rel="author"]').length > 0;
    const jsonAuthor = findInEntities(jsonld.entities, ["author"]);
    const bylinePattern = /\bby\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/;
    const byline = bylinePattern.test($(main).text().slice(0, 2000));
    const signals = [metaAuthor, relAuthor, jsonAuthor, byline].filter(Boolean).length;
    const points = signals >= 2 ? 20 : signals === 1 ? 12 : 0;
    checks.push({
      id: "author",
      label: "Author attribution",
      status: points === 20 ? "pass" : points > 0 ? "warn" : "fail",
      detail:
        signals > 0
          ? `${signals} authorship signal(s): ${[metaAuthor && "meta author", relAuthor && "rel=author", jsonAuthor && "JSON-LD author", byline && "visible byline"].filter(Boolean).join(", ")}.`
          : "No authorship signal (meta author, rel=author, JSON-LD author, or visible byline).",
      ...(points < 20 && {
        recommendation:
          "Attribute the content: a visible byline plus a machine-readable author (JSON-LD author or meta author). Named authorship is the clearest on-page expertise signal an engine can read.",
      }),
      points,
      maxPoints: 20,
    });
  }

  /* Publisher identity — 15 pts */
  {
    const jsonPublisher = findInEntities(jsonld.entities, ["publisher"]);
    const orgType = jsonld.types.some((t) =>
      ["Organization", "GovernmentOrganization", "NGO"].includes(t),
    );
    const siteName = !!$('meta[property="og:site_name"]').attr("content");
    const copyright = /©|copyright/i.test($("footer").text());
    const signals = [jsonPublisher || orgType, siteName, copyright].filter(Boolean).length;
    const points = signals >= 2 ? 15 : signals === 1 ? 9 : 0;
    checks.push({
      id: "publisher",
      label: "Publisher identity",
      status: points === 15 ? "pass" : points > 0 ? "warn" : "fail",
      detail:
        signals > 0
          ? `${signals} publisher signal(s) (JSON-LD/og:site_name/footer copyright).`
          : "No publisher/organization identification found.",
      ...(points < 15 && {
        recommendation:
          "Identify the publishing organization machine-readably: Organization JSON-LD (with logo and sameAs) plus og:site_name, so engines can attribute the page to a known entity.",
      }),
      points,
      maxPoints: 15,
    });
  }

  /* Attribution dates — 15 pts (presence of machine-readable date metadata) */
  {
    const metaDate =
      !!$('meta[property="article:published_time"]').attr("content") ||
      !!$('meta[property="article:modified_time"]').attr("content") ||
      $("time[datetime]").length > 0;
    const jsonDate = findInEntities(jsonld.entities, [
      "datePublished",
      "dateModified",
    ]);
    const points = metaDate && jsonDate ? 15 : metaDate || jsonDate ? 10 : 0;
    checks.push({
      id: "dates",
      label: "Machine-readable dates",
      status: points === 15 ? "pass" : points > 0 ? "warn" : "fail",
      detail:
        points > 0
          ? `Date metadata present (${[metaDate && "meta/time tags", jsonDate && "JSON-LD"].filter(Boolean).join(" + ")}).`
          : "No machine-readable publication or modification date.",
      ...(points < 15 && {
        recommendation:
          "Expose published/modified dates in both HTML metadata (<time datetime>, article:published_time) and JSON-LD (datePublished, dateModified) so provenance is verifiable.",
      }),
      points,
      maxPoints: 15,
    });
  }

  /* Outbound citations — 20 pts */
  {
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* keep empty */
    }
    const domains = new Set<string>();
    $(main)
      .find('a[href^="http"]')
      .each((_, el) => {
        try {
          const h = new URL($(el).attr("href") ?? "").hostname.replace(/^www\./, "");
          if (h && h !== host) domains.add(h);
        } catch {
          /* ignore malformed hrefs */
        }
      });
    const n = domains.size;
    const points = n >= 3 ? 20 : n >= 1 ? 12 : 0;
    checks.push({
      id: "citations",
      label: "Outbound citations",
      status: points === 20 ? "pass" : points > 0 ? "warn" : "fail",
      detail:
        n > 0
          ? `Links to ${n} distinct external domain(s) from the main content.`
          : "Main content links to no external sources.",
      ...(points < 20 && {
        recommendation:
          "Cite sources: link claims in the body to at least a few distinct authoritative external domains — sourcing is a trust signal engines read directly, and well-sourced pages are preferred for citation.",
      }),
      points,
      maxPoints: 20,
    });
  }

  /* Authority indicators — 15 pts */
  {
    const aboutContact =
      $('a[href*="about" i], a[href*="contact" i]').length > 0;
    const credentials =
      /\b(?:PhD|Ph\.D\.|Professor|Prof\.|Dr\.|Director|Chief\s+\w+\s+Officer|Head of)\b/.test(
        $("body").text(),
      );
    const sameAs = findInEntities(jsonld.entities, ["sameAs"]);
    const signals = [aboutContact, credentials, sameAs].filter(Boolean).length;
    const points = signals >= 2 ? 15 : signals === 1 ? 9 : 0;
    checks.push({
      id: "authority",
      label: "Authority indicators",
      status: points === 15 ? "pass" : points > 0 ? "warn" : "fail",
      detail:
        signals > 0
          ? `${signals} indicator(s): ${[aboutContact && "about/contact links", credentials && "credential mentions", sameAs && "sameAs profiles"].filter(Boolean).join(", ")}.`
          : "No authority indicators (about/contact links, credentials, sameAs profiles).",
      ...(points < 15 && {
        recommendation:
          "Strengthen entity authority: link to about/contact pages, surface author credentials, and declare official profiles via sameAs in the Organization JSON-LD.",
      }),
      points,
      maxPoints: 15,
    });
  }

  /* Evidence artifacts — 15 pts */
  {
    const tables = $(main).find("table").length;
    const figures = $(main).find("figure, img[alt]").length;
    const quotes = $(main).find("blockquote").length;
    const kinds = [tables > 0, figures > 0, quotes > 0].filter(Boolean).length;
    const points = kinds >= 2 ? 15 : kinds === 1 ? 9 : 0;
    checks.push({
      id: "evidence",
      label: "Evidence artifacts",
      status: points === 15 ? "pass" : points > 0 ? "warn" : "fail",
      detail:
        kinds > 0
          ? `${tables} table(s), ${figures} figure(s)/captioned image(s), ${quotes} blockquote(s) in the main content.`
          : "No tables, figures, or quoted material in the main content.",
      ...(points < 15 && {
        recommendation:
          "Show first-hand evidence: data tables, captioned figures, or quoted primary material distinguish original analysis from paraphrase — engines favor pages that look like the source, not the summary.",
      }),
      points,
      maxPoints: 15,
    });
  }

  return {
    id: "eeat",
    label: "E-E-A-T Signals",
    weight: GEO_WEIGHTS.eeat,
    score: checks.reduce((s, c) => s + c.points, 0),
    checks,
  };
}
