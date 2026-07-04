/**
 * Horizontal bar chart for the competitor comparison. Pure HTML/CSS —
 * no client JS. The subject institution is emphasized; peers stay quiet.
 */

export interface BarItem {
  label: string;
  value: number; // 0–100
  emphasis?: boolean;
}

export function BarChart({ items }: { items: BarItem[] }) {
  return (
    <div className="barchart" role="img" aria-label="OAVS by institution">
      {items.map((item) => (
        <div
          key={item.label}
          className="barrow"
          data-emphasis={item.emphasis ? "true" : undefined}
        >
          <span className="barlabel">{item.label}</span>
          <span className="bartrack">
            <span
              className="barfill"
              style={{ width: `${Math.max(item.value, 0.5)}%` }}
            />
          </span>
          <span className="barvalue num">{item.value.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}
