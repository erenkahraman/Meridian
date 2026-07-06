/**
 * Overview — the main dashboard screen.
 *
 * Server component: reads the latest stored run (for the current question
 * set) from Supabase, computes scores with the shared metric, and renders
 * the headline plus the Findings narrative. Revalidates every 5 minutes —
 * data only changes when a collection run executes.
 */

import { getOverviewData } from "../lib/dashboard";
import { DEFAULT_OAVS_WEIGHTS } from "../lib/metric";
import { Findings } from "./components/Findings";

export const revalidate = 300;

function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const SUBSCORES = [
  { key: "presenceRate", name: "Presence Rate", weight: DEFAULT_OAVS_WEIGHTS.presenceRate },
  { key: "positionWeight", name: "Position Weight", weight: DEFAULT_OAVS_WEIGHTS.positionWeight },
  { key: "citationDepth", name: "Citation Depth", weight: DEFAULT_OAVS_WEIGHTS.citationDepth },
  { key: "shareOfVoice", name: "Share of Voice", weight: DEFAULT_OAVS_WEIGHTS.shareOfVoice },
] as const;

export default async function OverviewPage() {
  const data = await getOverviewData();

  if (!data.run || !data.subjectResult) {
    return (
      <main className="shell">
        <div className="empty-state">
          No collection runs stored yet for the current question set. Run{" "}
          <code>npm run collect -- --all</code> to gather the first snapshot.
        </div>
      </main>
    );
  }

  const { run, subjectResult } = data;

  return (
    <main className="shell">
      {/* ---- Headline ---- */}
      <section className="headline">
        <div className="headline-score">
          <div className="label">OECD AI Visibility Score</div>
          <div className="value num">
            {subjectResult.oavs.toFixed(1)}
            <small>/ 100</small>
          </div>
          <p className="meta">
            {formatRunDate(run.createdAt)} · {run.model} ·{" "}
            {run.questionCount} policy questions
          </p>
        </div>
        <div className="subscores">
          {SUBSCORES.map((s) => (
            <div className="subscore" key={s.key}>
              <div className="name">{s.name}</div>
              <div className="val num">{subjectResult[s.key].toFixed(1)}</div>
              <div className="weight num">weight {s.weight.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Findings: methodology → results → recommendations ---- */}
      <Findings data={data} />
    </main>
  );
}
