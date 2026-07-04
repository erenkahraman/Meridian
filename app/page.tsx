/**
 * Overview — the main dashboard screen.
 *
 * Server component: reads stored runs from Supabase, computes scores with the
 * shared metric, renders everything statically. Revalidates every 5 minutes —
 * data only changes when a collection run is executed.
 */

import { getOverviewData } from "../lib/dashboard";
import { DEFAULT_OAVS_WEIGHTS } from "../lib/metric";
import { BarChart } from "./components/BarChart";
import { Heatmap } from "./components/Heatmap";
import { TimeSeries } from "./components/TimeSeries";

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
          No collection runs stored yet. Run <code>npm run collect</code> to
          gather the first snapshot.
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

      {/* ---- Competitor comparison ---- */}
      <section className="section">
        <h2 className="section-title">Institutional comparison</h2>
        <BarChart
          items={data.comparison.map((c) => ({
            label: c.institution,
            value: c.oavs,
            emphasis: c.institution === data.subject,
          }))}
        />
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">Institution</th>
              <th scope="col">Presence</th>
              <th scope="col">Position</th>
              <th scope="col">Citation</th>
              <th scope="col">Share of Voice</th>
              <th scope="col">OAVS</th>
            </tr>
          </thead>
          <tbody>
            {data.comparison.map((c) => (
              <tr
                key={c.institution}
                data-emphasis={c.institution === data.subject ? "true" : undefined}
              >
                <td>{c.institution}</td>
                <td className="num">{c.presenceRate.toFixed(1)}</td>
                <td className="num">{c.positionWeight.toFixed(1)}</td>
                <td className="num">{c.citationDepth.toFixed(1)}</td>
                <td className="num">{c.shareOfVoice.toFixed(1)}</td>
                <td className="num">{c.oavs.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="section-note">
          All sub-scores range 0–100. OAVS is the weighted composite:
          presence × 0.30, position × 0.25, citation × 0.25, share of voice × 0.20.
        </p>
      </section>

      {/* ---- Domain heatmap ---- */}
      <section className="section">
        <h2 className="section-title">Visibility by policy domain</h2>
        <Heatmap rows={data.heatmap} institutions={data.institutions} />
      </section>

      {/* ---- Time series ---- */}
      <section className="section">
        <h2 className="section-title">OECD score over time</h2>
        <TimeSeries points={data.series} />
      </section>
    </main>
  );
}
