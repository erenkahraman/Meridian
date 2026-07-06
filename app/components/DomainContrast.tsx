/**
 * DomainContrast — the core pattern in one picture: directorates where OECD
 * visibility is anchored by a branded product vs. directorates where it is
 * zero (or lowest). Bars share the 0–100 scale with the rest of the app.
 */

import { domainLabel } from "../../lib/domains";

export interface DomainScore {
  domain: string;
  oavs: number;
}

export function DomainContrast({
  high,
  zero,
}: {
  high: DomainScore[];
  zero: DomainScore[];
}) {
  const row = (d: DomainScore, emphasis: boolean) => (
    <div
      key={d.domain}
      className="barrow"
      data-emphasis={emphasis ? "true" : undefined}
    >
      <span className="barlabel">{domainLabel(d.domain)}</span>
      <span className="bartrack">
        <span className="barfill" style={{ width: `${Math.max(d.oavs, 0.5)}%` }} />
      </span>
      <span className="barvalue num">{d.oavs.toFixed(1)}</span>
    </div>
  );

  return (
    <div className="contrast-grid">
      <div>
        <h4 className="contrast-title">Anchored by a branded product</h4>
        <div className="barchart contrast-bars">{high.map((d) => row(d, true))}</div>
      </div>
      <div>
        <h4 className="contrast-title">Invisible in the answers</h4>
        <div className="barchart contrast-bars">{zero.map((d) => row(d, false))}</div>
      </div>
    </div>
  );
}
