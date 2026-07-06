# Meridian

Meridian measures how visible the OECD is inside AI-generated answers, compared to peer
institutions (IMF, World Bank, UN), across real policy questions — and how ready OECD web
pages are to be discovered and cited by AI systems. Built by Eren Kahraman as a
demonstration project for the OECD Junior AI & Communications Intelligence Officer role
(COM/CISC).

Two complementary analyses:

- **OAVS (OECD AI Visibility Score)** — how often and how prominently the OECD surfaces
  in LLM answers, relative to peers. *Looks at the answers.*
- **GEO Audit** — how well a given page is structured for AI discovery (crawler access,
  citability, structured data, E-E-A-T, technical rendering). *Looks at the source.*

## How the measurement works

The sampling frame is **168 policy questions — twelve for each of the OECD's fourteen
substantive directorates** (economics, taxation, education, employment & social, health,
environment & climate, science/tech/innovation, AI governance, trade & agriculture,
financial & enterprise affairs, public governance, development co-operation,
entrepreneurship/SMEs/regions, statistics & measurement) — so the measurement reflects the
OECD's actual portfolio rather than an arbitrary topic list.

Each question is put to the model with no institution named. The answer then goes through
a second structured-extraction pass (temperature 0 for consistency) that records which
tracked institutions appear, in what order, and whether each mention cites a specific named
output (e.g. "PISA", "the BEPS framework"). Results are stored in Supabase as append-only,
time-stamped runs.

**QA cross-check:** an independent regex search over every raw answer (institution names +
known aliases, word-boundary safe) flags any mention the LLM extraction missed. Flags are
reported (`npm run qa-check`), never auto-corrected.

## The OAVS metric

A weighted composite (0–100) per institution ([lib/metric.ts](lib/metric.ts)):

| Component | Weight | Measures |
|---|---|---|
| Presence Rate | 0.30 | share of questions where the institution appears at all |
| Position Weight | 0.25 | how early it is named (1st → 100, 2nd → 70, 3rd → 40, 4th+ → 20) |
| Citation Depth | 0.25 | specific cited output → 100, generic mention → 50, absent → 0 |
| Share of Voice | 0.20 | its mentions as a share of all tracked institutions' mentions |

## The GEO audit

Five weighted categories combine into a 0–100 score ([lib/geo/](lib/geo/)): AI Access &
Crawlability 0.20 (robots.txt vs. 18 AI crawlers, llms.txt, meta directives) · Content
Citability 0.25 (quotable passage structure, fact density, answer-directness, freshness) ·
Structured Data 0.20 (JSON-LD completeness, Open Graph, Twitter Cards) · E-E-A-T 0.15 ·
Technical 0.20 (server-side rendering, HTTPS, metadata hygiene, page weight). Per-platform
readiness (ChatGPT, Perplexity, Google AI Overviews) is derived from the same checks and
reported separately from the composite. Weight rationale is documented in
[lib/geo/types.ts](lib/geo/types.ts); the analyzer is unit-tested (`npm run test:geo`).

## Structure

```
app/         Next.js App Router — dashboard UI and server-side API routes
lib/         Shared logic (metric, GEO analyzer, QA layer, Supabase/LLM clients)
scripts/     Standalone Node.js CLI jobs (collection, scoring, QA report, GEO audit)
supabase/    Database schema (SQL)
.github/     Scheduled collection workflow (GitHub Actions)
```

## Commands

```bash
npm run dev                  # dashboard at localhost:3000
npm run collect -- --all     # collect all 168 questions → Supabase (or --ids, --dry-run)
npm run score                # OAVS report for the latest run, with hand-verifiable math
npm run qa-check             # regex-vs-LLM discrepancy report for the latest run
npm run geo -- <url>         # GEO audit a page from the CLI
npm run test:geo             # GEO analyzer unit tests
```

## Tech stack

- Next.js (App Router) + TypeScript, deployable to Vercel
- Supabase (Postgres) for append-only time-series snapshots
- Google Gemini API for LLM queries (single-model by design; the provider is swappable)
- GitHub Actions for scheduled collection runs

## Setup

```bash
npm install
cp .env.example .env   # fill in Supabase + Gemini credentials
npm run dev
```

API keys are only ever read server-side (Next.js server routes and /scripts) and are never
bundled into client-side code. Live queries are rate-limited; custom free-text queries are
gated by design.

See [CLAUDE.md](./CLAUDE.md) for the original project brief and design direction.
