/**
 * Domain × institution heatmap. Rendered as a semantic table with color-scaled
 * cells — accessible (values are visible text, not color alone).
 */

import type { HeatmapRow } from "../../lib/dashboard";

/** Linear interpolation between the warm neutral and the deep data blue. */
function cellColor(value: number): { background: string; color: string } {
  const t = Math.min(Math.max(value / 100, 0), 1);
  // #f3f1ec (t=0) -> #17547e (t=1)
  const from = [243, 241, 236];
  const to = [23, 84, 126];
  const rgb = from.map((f, i) => Math.round(f + (to[i] - f) * t));
  return {
    background: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    color: t > 0.45 ? "#ffffff" : "var(--ink-strong)",
  };
}

/** "social_trade_development" -> "Social, trade & development" style labels. */
const DOMAIN_LABELS: Record<string, string> = {
  economic_growth: "Economic growth",
  taxation: "Taxation",
  education: "Education",
  employment: "Employment",
  ai_governance: "AI governance",
  climate: "Climate",
  health: "Health",
  social_trade_development: "Social, trade & development",
};

export function Heatmap({
  rows,
  institutions,
}: {
  rows: HeatmapRow[];
  institutions: string[];
}) {
  return (
    <table className="heatmap">
      <caption>
        OAVS per policy domain, computed over each domain&apos;s questions only.
        Darker means more visible.
      </caption>
      <thead>
        <tr>
          <th scope="col" aria-label="Domain" />
          {institutions.map((inst) => (
            <th key={inst} scope="col">
              {inst}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.domain}>
            <th scope="row">{DOMAIN_LABELS[row.domain] ?? row.domain}</th>
            {row.cells.map((cell) => {
              const style = cellColor(cell.oavs);
              return (
                <td key={cell.institution} className="num" style={style}>
                  {cell.oavs.toFixed(1)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
