-- Meridian — Supabase schema
--
-- Time-series design: every execution of the collector creates one `runs` row.
-- Each question answered in that run creates a `responses` row (holding the raw
-- LLM answer), and each institution the analysis call detects in that answer
-- creates a `mentions` row. Scores (Phase 3) are computed from these tables, so
-- nothing derived is stored here — only observed data.
--
-- Apply with:  supabase db execute --file supabase/schema.sql
-- (or paste into the Supabase SQL editor).

-- One collector execution.
create table if not exists runs (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  model          text not null,            -- e.g. "gemini-2.5-flash"
  provider       text not null,            -- e.g. "gemini"
  question_count integer not null,         -- how many questions this run covered
  notes          text                      -- free-form (e.g. "5-question sample")
);

-- One question's answer within a run.
create table if not exists responses (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references runs (id) on delete cascade,
  question_id   text not null,             -- matches scripts/questions.json id
  domain        text not null,
  question_text text not null,
  raw_answer    text not null,             -- verbatim first-call LLM answer
  created_at    timestamptz not null default now(),
  unique (run_id, question_id)
);

-- One tracked-institution mention detected in a response by the analysis call.
create table if not exists mentions (
  id                uuid primary key default gen_random_uuid(),
  response_id       uuid not null references responses (id) on delete cascade,
  institution       text not null,         -- OECD / IMF / World Bank / UN
  position          integer not null,      -- 1-based order of first appearance
  cites_publication boolean not null,      -- backed by a named publication/dataset
  context           text                   -- short surrounding snippet
);

-- Helpful lookup indexes for the scoring queries.
create index if not exists responses_run_id_idx on responses (run_id);
create index if not exists mentions_response_id_idx on mentions (response_id);
create index if not exists mentions_institution_idx on mentions (institution);
