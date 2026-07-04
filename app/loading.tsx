/**
 * Overview loading skeleton — paints instantly on navigation while the
 * server component resolves, mirroring the page's layout so nothing jumps.
 */

export default function OverviewLoading() {
  return (
    <main className="shell" aria-busy="true" aria-label="Loading overview">
      <section className="headline">
        <div className="headline-score">
          <div className="label">OECD AI Visibility Score</div>
          <div className="skeleton skeleton-score" />
          <div className="skeleton skeleton-line" style={{ width: "60%" }} />
        </div>
        <div className="subscores">
          {[0, 1, 2, 3].map((i) => (
            <div className="subscore" key={i}>
              <div className="skeleton skeleton-line" style={{ width: "70%" }} />
              <div className="skeleton skeleton-num" />
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Institutional comparison</h2>
        <div className="skeleton skeleton-block" style={{ height: 130 }} />
      </section>

      <section className="section">
        <h2 className="section-title">Visibility by policy domain</h2>
        <div className="skeleton skeleton-block" style={{ height: 300 }} />
      </section>

      <section className="section">
        <h2 className="section-title">OECD score over time</h2>
        <div className="skeleton skeleton-block" style={{ height: 240 }} />
      </section>
    </main>
  );
}
