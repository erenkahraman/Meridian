# CLAUDE.md — Meridian Project

## What this project is

Meridian measures how visible the OECD is inside AI-generated answers, compared to peer institutions (IMF, World Bank, UN), across real policy questions. It queries an LLM with policy questions, analyzes each response for institutional mentions, scores OECD visibility using a custom metric, and presents the findings in a dashboard plus an exportable brief. It also includes a GEO (Generative Engine Optimisation) audit module that scores how AI-readable a given OECD.org page is.

This project is part of a real job application to the OECD (Junior AI & Communications Intelligence Officer, COM/CISC). Every design decision should be defensible in an interview. The intellectual core (the metric, the question set, what counts as a citation) belongs to the human, not to you.

## Golden rule: phase gates with mandatory human approval

Work in the phases defined below. At the END of every phase you MUST STOP and produce a short END-OF-PHASE REPORT in exactly this format:

---
**Phase N complete.**

**What I built:** (max 8 lines)

**Key output:** (file tree, sample data, or description of the result)

**Assumptions I made:** (bullet list, or "none")

**MANUAL ACTIONS YOU NEED TO DO before the next phase:**
(Numbered list of concrete things ONLY the human can do: e.g. "Create a Supabase project and paste the URL + anon key into .env", "Get a Gemini API key from Google AI Studio", "Run `npm install`". If there is nothing, write exactly: "No manual actions needed.")

**Next step:** Either "Nothing needed from you technically — reply 'go' and I'll start Phase N+1." OR "Once you've done the manual actions above, reply 'go' and I'll start Phase N+1."
---

Do NOT start the next phase until the human replies "go" (or equivalent approval). Never chain multiple phases in one go. If you finish a phase early, stop and wait. Within a phase you may work autonomously, but between phases the human decides.

If at any point you are about to invent domain content (policy questions, the scoring formula, what counts as a valid citation, competitor list), STOP and ask first. These are human decisions.

## Tech stack (fixed, do not substitute)

- Frontend/dashboard: Next.js (App Router) + TypeScript, deployed to Vercel
- Data storage: Supabase (Postgres), designed to store time-series snapshots
- LLM: Google Gemini API only (single-model, "Phase 1" by design). Architecture must make it easy to add Anthropic/OpenAI later without a rewrite.
- Data collection: standalone Node.js scripts in /scripts (batch jobs, runnable from CLI)
- API keys live ONLY in server-side code or scripts, never in client bundles

## Phases and checkpoints

### Phase 0 — Scaffolding
Set up the repo structure: /scripts (collector), /app (Next.js), /lib (shared logic), Supabase schema file, .env.example, README. No business logic yet.
Checkpoint: show the file tree and confirm the structure.

### Phase 1 — Question set and metric (HUMAN-LED, do not autofill)
Create /scripts/questions.json and /lib/metric.ts as STUBS only. Do not write the 50 questions or the scoring weights yourself. Instead, present a proposed structure and wait for the human to provide/approve the actual questions and the metric formula.
Checkpoint: human must supply and approve the question set and the OECD AI Visibility Score (OAVS) definition before Phase 2.

### Phase 2 — Data collection engine
Build /scripts/collect.js: for each question, query Gemini, then run a second structured-analysis call that extracts, as strict JSON: which institutions (OECD/IMF/World Bank/UN) are mentioned, their order, whether a specific publication/dataset is cited, and the surrounding context. Write results to Supabase with a run timestamp.
Checkpoint: run on ONLY 5 questions first, show the raw + parsed output, and wait for the human to verify quality before scaling to the full set.

### Phase 3 — Analysis and scoring
Compute the OAVS and its sub-components (Presence Rate, Position Weight, Citation Depth, Share of Voice) from stored data. Produce per-domain breakdowns and competitor comparison.
Checkpoint: show the computed scores for a few questions so the human can hand-verify the math.

### Phase 4 — GEO audit module
Build a module that takes an OECD.org URL, fetches it, and scores AI-readability: presence of JSON-LD structured data, heading hierarchy, metadata, and E-E-A-T signals. Output a score plus specific recommendations.
Checkpoint: test on one real OECD.org page and show the report.

### Phase 5 — Dashboard and UI
Build the Next.js dashboard: OAVS headline score, time-series charts, competitor comparison, per-domain heatmap, a GEO audit input, and a "Run live query" button that runs a single question live via a server-side API route.
Checkpoint: show each main screen as it is built; the human reviews aesthetics and layout.

### Phase 6 — Brief export and deploy
Add PDF/print export of a findings brief. Prepare for Vercel deploy. The human writes or heavily edits the brief's narrative text; you only build the export mechanism and layout.
Checkpoint: confirm deploy works and the brief exports cleanly.

## Design direction (UI)

The aesthetic is institutional trust meets quiet modernity: think OECD/UN corporate seriousness blended with clean, restrained, modern data design (closer to Anthropic's calm minimalism than to a flashy dashboard).

- Generous whitespace, clear visual hierarchy, nothing cluttered
- Narrow palette: one neutral background (off-white), one deep institutional accent (dark navy/petrol close to OECD blue), one restrained highlight color for data emphasis
- Typography: a clean, readable sans-serif (Inter or similar), serious but not cold
- Charts: minimal line/bar charts, soft transitions, precise alignment, no gratuitous decoration
- This is a corporate analysis tool, not a trading terminal. Calm, formal, credible.
- Fully responsive, accessible (proper contrast, semantic HTML)

## Working principles

- Prefer clarity over cleverness. Readable code the human can explain in an interview.
- Comment the non-obvious parts, especially the metric logic and the LLM analysis prompts.
- When a step touches the real world (API responses, scraping), validate on a small sample and surface anomalies rather than assuming success.
- Keep secrets out of the client. Rate-limit and cache live calls.
- Never fabricate results or fill data gaps silently. If something fails, report it.