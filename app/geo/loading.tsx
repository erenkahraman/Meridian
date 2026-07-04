/** GEO Audit loading skeleton — instant shell while the audit page resolves. */

export default function GeoLoading() {
  return (
    <main className="shell" aria-busy="true" aria-label="Loading GEO audit">
      <section className="section">
        <h1 className="page-title">GEO Audit</h1>
        <div className="skeleton skeleton-line" style={{ width: "55%", marginTop: 14 }} />
        <div className="skeleton skeleton-block" style={{ height: 44, maxWidth: 640, marginTop: 28 }} />
      </section>
    </main>
  );
}
