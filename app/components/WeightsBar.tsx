/**
 * WeightsBar — the four OAVS components and their weights as a single
 * stacked bar plus a compact legend. Pure server component; weights come
 * from lib/metric.ts so this can never drift from the implementation.
 */

import { DEFAULT_OAVS_WEIGHTS } from "../../lib/metric";

const COMPONENTS = [
  {
    key: "presenceRate",
    name: "Presence Rate",
    blurb: "how often the institution appears at all",
    tint: "#1f6fb2",
  },
  {
    key: "positionWeight",
    name: "Position Weight",
    blurb: "how early it is named among institutions",
    tint: "#4c8bc2",
  },
  {
    key: "citationDepth",
    name: "Citation Depth",
    blurb: "specific cited output vs. a passing name-drop",
    tint: "#79a8d1",
  },
  {
    key: "shareOfVoice",
    name: "Share of Voice",
    blurb: "share of all tracked institutions' mentions",
    tint: "#a6c5e1",
  },
] as const;

export function WeightsBar() {
  return (
    <figure className="weights-figure">
      <div
        className="weights-bar"
        role="img"
        aria-label="OAVS component weights"
      >
        {COMPONENTS.map((c) => {
          const pct = DEFAULT_OAVS_WEIGHTS[c.key] * 100;
          return (
            <span
              key={c.key}
              className="weights-seg num"
              style={{ width: `${pct}%`, background: c.tint }}
            >
              {pct}%
            </span>
          );
        })}
      </div>
      <ul className="weights-legend">
        {COMPONENTS.map((c) => (
          <li key={c.key}>
            <span className="weights-dot" style={{ background: c.tint }} />
            <span>
              <strong>{c.name}</strong> — {c.blurb}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
