# Meridian

Meridian measures how visible the OECD is inside AI-generated answers, compared to peer
institutions (IMF, World Bank, UN), across real policy questions. It queries an LLM with
policy questions, analyzes each response for institutional mentions, scores OECD visibility
using a custom metric (the OAVS), and presents the findings in a dashboard plus an
exportable brief. It also includes a GEO (Generative Engine Optimisation) audit module that
scores how AI-readable a given OECD.org page is.

See [CLAUDE.md](./CLAUDE.md) for the full project brief, phase plan, and design direction.

## Structure

```
app/         Next.js App Router — dashboard UI and server-side API routes
lib/         Shared logic (metric, Supabase client, LLM client, types)
scripts/     Standalone Node.js CLI jobs (data collection, batch scoring)
supabase/    Database schema (SQL)
```

## Tech stack

- Next.js (App Router) + TypeScript, deployed to Vercel
- Supabase (Postgres) for time-series snapshots
- Google Gemini API for LLM queries (Phase 1 is single-model by design)

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Gemini credentials
npm run dev
```

API keys are only ever read server-side (Next.js server routes and /scripts) and are never
bundled into client-side code.

## Status

Currently in Phase 0 (scaffolding). See CLAUDE.md for the full phase gate plan — each phase
requires human review and approval before the next one starts.
