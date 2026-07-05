"use client";

/**
 * AboutContent — the tabbed content of the "About Meridian" modal.
 *
 * ALL copy lives in the TABS array below, one entry per tab, so the text is
 * easy to find and edit. The component itself only handles tab switching;
 * the surrounding modal chrome lives in Modal.tsx, and styling in globals.css
 * (.modal-tabs / .prose / .spec-list).
 */

import { useState } from "react";
import { SocialLinks, GITHUB_URL, LINKEDIN_URL } from "./icons";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

const TABS: Tab[] = [
  /* ── Tab 1 ─────────────────────────────────────────────────────────── */
  {
    id: "overview",
    label: "Overview",
    content: (
      <div className="prose">
        <p>
          <strong>Meridian</strong>
          {" "}measures how visible the OECD is inside AI systems. As policy
          audiences increasingly discover information through
          large language models and generative search rather than by visiting
          source websites, an institution&apos;s influence depends on whether AI
          answers name it, cite it, and treat it as authoritative. Traditional
          web analytics cannot see any of this — they stop at the click.
          Meridian makes that AI-mediated visibility measurable and trackable
          over time.
        </p>
        <p className="prose-signoff">
          Built by <strong>Eren Kahraman</strong>
          {" as a demonstration project for the OECD Junior AI & Communications Intelligence Officer role (COM/CISC)."}
        </p>
      </div>
    ),
  },

  /* ── Tab 2 ─────────────────────────────────────────────────────────── */
  {
    id: "measures",
    label: "What it measures",
    content: (
      <div className="prose">
        <p>
          Meridian runs two complementary but distinct analyses. They answer
          different questions and should not be conflated.
        </p>

        <h3>OAVS — OECD AI Visibility Score</h3>
        <p>
          How often and how prominently the OECD surfaces inside LLM-generated
          answers to real policy questions, relative to its peers (IMF, World
          Bank, UN).
        </p>
        <p className="prose-source">
          Source: analysis of 50 policy questions run through an LLM.
        </p>

        <h3>GEO Audit — Generative Engine Optimisation</h3>
        <p>
          How well a given web page is structured to be discovered and cited by
          AI systems — its content, metadata, crawler access, and technical
          readiness.
        </p>
        <p className="prose-source">
          Source: analysis of the page&apos;s HTML, robots.txt, and llms.txt.
        </p>

        <p className="prose-callout">
          In short: <strong>OAVS</strong> measures how visible the OECD already
          is <em>in AI output</em>; the <strong>GEO Audit</strong> measures how
          ready a page is <em>for AI discovery</em>. One looks at the answers;
          the other looks at the source.
        </p>
      </div>
    ),
  },

  /* ── Tab 3 ─────────────────────────────────────────────────────────── */
  {
    id: "methodology",
    label: "Methodology",
    content: (
      <div className="prose">
        <h3>OAVS composition</h3>
        <p>
          A weighted composite (0–100) of four sub-components, each scored per
          question and averaged across the set:
        </p>
        <ul className="spec-list">
          <li>
            <span className="spec-w">30%</span>
            <span>
              <strong>Presence Rate</strong>{" "}— share of questions where the OECD
              appears at all.
            </span>
          </li>
          <li>
            <span className="spec-w">25%</span>
            <span>
              <strong>Position Weight</strong>{" "}— how early it appears among
              mentioned institutions (1st → 100, 2nd → 70, 3rd → 40, 4th+ → 20).
            </span>
          </li>
          <li>
            <span className="spec-w">25%</span>
            <span>
              <strong>Citation Depth</strong>{" "}— whether a mention cites a
              specific publication (specific → 100, generic mention → 50, absent
              → 0).
            </span>
          </li>
          <li>
            <span className="spec-w">20%</span>
            <span>
              <strong>Share of Voice</strong>{" "}— the OECD&apos;s mentions as a
              proportion of all tracked institutions&apos; mentions.
            </span>
          </li>
        </ul>

        <h3>GEO Audit composition</h3>
        <p>Five weighted categories combine into a 0–100 composite:</p>
        <ul className="spec-list">
          <li>
            <span className="spec-w">25%</span>
            <span>
              <strong>Content Citability</strong>{" "}— quotable, self-contained,
              fact-rich passages.
            </span>
          </li>
          <li>
            <span className="spec-w">20%</span>
            <span>
              <strong>AI Access</strong>{" "}— crawler permissions, robots.txt,
              llms.txt.
            </span>
          </li>
          <li>
            <span className="spec-w">20%</span>
            <span>
              <strong>Structured Data</strong>{" "}— JSON-LD schema, Open Graph,
              social cards.
            </span>
          </li>
          <li>
            <span className="spec-w">20%</span>
            <span>
              <strong>Technical</strong>{" "}— server-side rendering, HTTPS,
              metadata hygiene.
            </span>
          </li>
          <li>
            <span className="spec-w">15%</span>
            <span>
              <strong>E-E-A-T</strong>{" "}— author, publisher, sourcing, and
              authority signals.
            </span>
          </li>
        </ul>
        <p>
          Alongside the composite, Meridian reports{" "}
          <strong>platform-readiness</strong> signals for ChatGPT, Perplexity,
          and Google AI Overviews. These re-weight the same underlying checks
          for each engine and are shown <em>separately</em> — deliberately
          excluded from the composite to avoid double counting.
        </p>

        <p className="prose-callout">
          The weights are a deliberate, defensible methodological choice:
          citability and access carry the most weight because a page must first
          be reachable by AI crawlers and then be structured in quotable
          passages before any other signal matters. They are documented in the
          code and easy to adjust as the evidence base evolves.
        </p>
      </div>
    ),
  },

  /* ── Tab 4 ─────────────────────────────────────────────────────────── */
  {
    id: "how",
    label: "How it works",
    content: (
      <div className="prose">
        <h3>Visibility pipeline (OAVS)</h3>
        <p>
          Each policy question is sent to an LLM. A second structured-extraction
          pass — run at temperature 0 for consistency — reads the answer and
          detects which institutions are mentioned, in what order, and whether
          each is backed by a specific named publication. The extracted results
          are stored as time-stamped snapshots and scored with the OAVS metric.
        </p>

        <h3>Page audit (GEO)</h3>
        <p>
          A target page is fetched together with its robots.txt and llms.txt,
          then scored across the five categories above and translated into
          per-platform readiness and concrete, prioritised recommendations.
        </p>

        <h3>Stack</h3>
        <p>
          Next.js (App Router) for the dashboard and server routes, Supabase for
          time-series storage, and Google Gemini as the language model. The
          architecture keeps the model provider swappable. The full codebase is
          on{" "}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          .
        </p>
      </div>
    ),
  },

  /* ── Tab 5 ─────────────────────────────────────────────────────────── */
  {
    id: "author",
    label: "Author",
    content: (
      <div className="prose">
        <p>
          <strong>Eren Kahraman</strong>
          {" "}built Meridian to demonstrate the
          analytical remit of the OECD Junior AI &amp; Communications
          Intelligence Officer role in practice rather than in the abstract:
          taking a genuine communications-intelligence question, designing a
          sound way to measure it, and building the end-to-end tooling to answer
          it. Every design decision — the metric, the question set, the
          weights — is one he can explain and defend.
        </p>
        <p>
          Feedback and questions are welcome via the links below.
        </p>
        <div className="modal-social">
          <SocialLinks size={20} />
        </div>
        <p className="prose-source">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            {GITHUB_URL.replace("https://", "")}
          </a>
          {" · "}
          <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            {LINKEDIN_URL.replace("https://", "")}
          </a>
        </p>
      </div>
    ),
  },
];

export function AboutContent() {
  const [active, setActive] = useState(TABS[0].id);
  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div className="about">
      <div className="modal-tabs" role="tablist" aria-label="About Meridian sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === active}
            className="modal-tab"
            data-active={tab.id === active ? "true" : undefined}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="modal-tabpanel" role="tabpanel">
        {activeTab.content}
      </div>
    </div>
  );
}
