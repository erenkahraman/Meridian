/**
 * fixtures.ts — controlled HTML / robots.txt / llms.txt inputs for the GEO
 * audit tests. Each fixture isolates one page archetype.
 */

import type { AccessContext } from "../types";

/* ── Page archetypes ────────────────────────────────────────────────────── */

/** ~140-word, fact-rich, self-contained paragraph (citability sweet spot). */
const RICH_PARA = (topic: string) => `
  <p>The ${topic} framework, agreed by 140 jurisdictions in 2021, sets a global
  minimum corporate tax rate of 15% for multinational groups with revenue above
  €750 million. According to the 2024 implementation review, 55 jurisdictions
  had enacted the rules by January 2025, covering roughly 60% of in-scope
  profits worldwide. Estimated additional revenue ranges from $155 billion to
  $192 billion per year, equivalent to about 6.5% of current corporate income
  tax receipts. The rules apply a jurisdictional blending approach: effective
  tax rates are computed per country, and any shortfall below 15% triggers a
  top-up tax. Early evidence from 2025 filings suggests average effective rates
  in low-tax hubs rose from 9.2% to 13.8% within the first year, while profit
  shifting to zero-tax jurisdictions declined by roughly 25%.</p>`;

export const WELL_OPTIMIZED_HTML = `<!doctype html>
<html lang="en">
<head>
  <title>Global Minimum Tax: How the Two-Pillar Solution Works</title>
  <meta name="description" content="A clear, sourced explainer of the global minimum corporate tax: how Pillar Two works, who it covers, and what the 2025 implementation data shows.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="author" content="Jane Analyst">
  <link rel="canonical" href="https://example.org/tax/minimum-tax">
  <meta property="og:title" content="Global Minimum Tax Explained">
  <meta property="og:description" content="How the two-pillar solution works.">
  <meta property="og:type" content="article">
  <meta property="og:image" content="https://example.org/img/tax.png">
  <meta property="og:site_name" content="Example Policy Institute">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Global Minimum Tax Explained">
  <meta property="article:published_time" content="2026-05-10T09:00:00Z">
  <meta property="article:modified_time" content="2026-06-20T09:00:00Z">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@graph":[
    {"@type":"Organization","name":"Example Policy Institute","url":"https://example.org","logo":"https://example.org/logo.png","sameAs":["https://www.linkedin.com/company/example","https://x.com/example"]},
    {"@type":"WebSite","name":"Example Policy Institute","url":"https://example.org"},
    {"@type":"Article","headline":"Global Minimum Tax: How the Two-Pillar Solution Works","datePublished":"2026-05-10","dateModified":"2026-06-20","author":{"@type":"Person","name":"Jane Analyst"},"publisher":{"@type":"Organization","name":"Example Policy Institute"}},
    {"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is the global minimum tax?","acceptedAnswer":{"@type":"Answer","text":"A 15% floor on effective corporate tax rates."}}]}
  ]}
  </script>
</head>
<body>
  <header><nav><a href="/">Home</a> <a href="/about">About</a> <a href="/contact">Contact</a></nav></header>
  <main>
    <article>
      <h1>Global Minimum Tax: How the Two-Pillar Solution Works</h1>
      <p>By Jane Analyst, Director of Tax Policy · Updated 20 June 2026</p>
      <p>The global minimum tax sets a 15% floor under the effective corporate
      tax rate of large multinationals, ending a decades-long race to the
      bottom that cost governments an estimated $240 billion in revenue every
      year since 2015.</p>
      <h2>What is the global minimum tax?</h2>
      ${RICH_PARA("Pillar Two")}
      <h2>How much revenue will it raise?</h2>
      ${RICH_PARA("top-up tax")}
      <h3>Which countries have implemented it?</h3>
      ${RICH_PARA("implementation")}
      <h2>Why does it matter for developing economies?</h2>
      ${RICH_PARA("revenue distribution")}
      <figure><img src="/chart.png" alt="Effective tax rates by jurisdiction, 2025"><figcaption>Effective rates, 2025</figcaption></figure>
      <table><tr><th>Year</th><th>Revenue</th></tr><tr><td>2025</td><td>$155bn</td></tr></table>
      <blockquote>“The reform marks the largest change to international tax rules in a century.” — 2024 review</blockquote>
      <p>Sources: see the <a href="https://www.imf.org/report">IMF analysis</a>,
      the <a href="https://www.worldbank.org/data">World Bank dataset</a>, and
      the <a href="https://www.un.org/tax">UN tax committee report</a>.</p>
      <time datetime="2026-06-20">20 June 2026</time>
    </article>
  </main>
  <footer>© 2026 Example Policy Institute · <a href="/about">About</a> · <a href="/contact">Contact</a></footer>
</body>
</html>`;

export const BARE_HTML = `<html><head></head><body>
  <div>Welcome.</div>
  <h3>Misc</h3>
  <h2>Later</h2>
  <p>Short text here about things and more things in general terms.</p>
</body></html>`;

export const MALFORMED_SCHEMA_HTML = `<!doctype html>
<html lang="en">
<head>
  <title>Testing page with malformed schema</title>
  <script type="application/ld+json">{ this is not valid json }</script>
</head>
<body><main><h1>Title</h1><p>${"word ".repeat(160)}</p></main></body>
</html>`;

export const CLIENT_ONLY_HTML = `<!doctype html>
<html lang="en">
<head>
  <title>A client-side rendered application page</title>
  <script src="/app1.js"></script><script src="/app2.js"></script>
  <script src="/app3.js"></script><script src="/app4.js"></script>
  <script src="/app5.js"></script>
</head>
<body><div id="root"></div></body>
</html>`;

/* ── robots.txt fixtures ────────────────────────────────────────────────── */

export const ROBOTS_ALLOW_ALL = `User-agent: *\nDisallow:\n`;

export const ROBOTS_BLOCK_AI = `
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: *
Disallow:
`;

export const ROBOTS_BLOCK_ALL = `User-agent: *\nDisallow: /\n`;

export const ROBOTS_WILDCARD = `
User-agent: *
Disallow: /private/
Allow: /private/reports/
Disallow: /*.pdf$
`;

/* ── llms.txt fixtures ──────────────────────────────────────────────────── */

export const LLMS_GOOD = `# Example Policy Institute

> Independent analysis of international tax, education, and AI policy.

## Key resources

- [Global minimum tax explainer](https://example.org/tax/minimum-tax)
- [Education outcomes data](https://example.org/education)
- [AI governance tracker](https://example.org/ai)

## About

- [Who we are](https://example.org/about)
`;

export const LLMS_THIN = `Some text that mentions our site but has no structure at all.`;

/* ── Access contexts ────────────────────────────────────────────────────── */

export const CTX_OPEN: AccessContext = {
  robots: { status: "ok", body: ROBOTS_ALLOW_ALL },
  llms: { status: "ok", body: LLMS_GOOD },
};

export const CTX_BLOCKING: AccessContext = {
  robots: { status: "ok", body: ROBOTS_BLOCK_ALL },
  llms: { status: "missing" },
};

/** A fixed "now" so freshness scoring is deterministic in tests. */
export const TEST_NOW = new Date("2026-07-01T00:00:00Z");
