/**
 * OAVS time series across collection runs. Minimal SVG line chart rendered
 * server-side. Honest about sparse data: with a single run it shows the one
 * snapshot and says the trend appears after the next run.
 */

import type { SeriesPoint } from "../../lib/dashboard";

const W = 920;
const H = 240;
const PAD = { top: 16, right: 24, bottom: 36, left: 44 };

function x(i: number, n: number): number {
  if (n === 1) return PAD.left + (W - PAD.left - PAD.right) / 2;
  return PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
}

function y(value: number): number {
  return PAD.top + (1 - value / 100) * (H - PAD.top - PAD.bottom);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function TimeSeries({ points }: { points: SeriesPoint[] }) {
  const n = points.length;
  const gridValues = [0, 25, 50, 75, 100];

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i, n)} ${y(p.oavs)}`)
    .join(" ");

  return (
    <div className="timeseries-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`OAVS across ${n} collection run${n === 1 ? "" : "s"}`}
      >
        {/* horizontal grid */}
        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="#ece9e3"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={y(v) + 4}
              textAnchor="end"
              fontSize={11}
              fill="#8b959f"
            >
              {v}
            </text>
          </g>
        ))}

        {/* line (only meaningful with 2+ points) */}
        {n > 1 && (
          <path d={path} fill="none" stroke="#1f6fb2" strokeWidth={2} />
        )}

        {/* points + x labels */}
        {points.map((p, i) => (
          <g key={p.runId}>
            <circle cx={x(i, n)} cy={y(p.oavs)} r={4} fill="#1f6fb2" />
            <text
              x={x(i, n)}
              y={y(p.oavs) - 12}
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              fill="#0e2238"
            >
              {p.oavs.toFixed(1)}
            </text>
            <text
              x={x(i, n)}
              y={H - PAD.bottom + 22}
              textAnchor="middle"
              fontSize={11}
              fill="#8b959f"
            >
              {formatDate(p.date)}
            </text>
          </g>
        ))}
      </svg>
      {n === 1 && (
        <p className="section-note">
          First snapshot. The trend line appears once a second collection run is
          stored.
        </p>
      )}
    </div>
  );
}
