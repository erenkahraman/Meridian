/**
 * GEO Audit — Screen 2.
 *
 * Plain GET form: the URL lands in searchParams, the server component fetches
 * and scores the page (lib/geo.ts), and the report renders statically. No
 * client JS; audits are cached in-memory for 5 minutes per URL.
 *
 * A 403 from the target is presented as a finding, not an error: sites that
 * block simple crawlers may be blocking AI crawlers too.
 */

import { auditUrlCached, FetchHttpError, type GeoAuditResult, type CheckStatus } from "../../lib/geo";

const STATUS_ICON: Record<CheckStatus, { glyph: string; className: string }> = {
  pass: { glyph: "✓", className: "check-pass" },
  warn: { glyph: "!", className: "check-warn" },
  fail: { glyph: "✕", className: "check-fail" },
};

/** Validate and normalize the submitted URL. Returns null if unusable. */
function normalizeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const candidate = raw.trim();
  if (!candidate) return null;
  try {
    const url = new URL(
      candidate.includes("://") ? candidate : `https://${candidate}`,
    );
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

type AuditOutcome =
  | { kind: "none" }
  | { kind: "report"; report: GeoAuditResult }
  | { kind: "blocked"; url: string; status: number }
  | { kind: "error"; url: string; message: string };

async function runAudit(url: string | null): Promise<AuditOutcome> {
  if (!url) return { kind: "none" };
  try {
    return { kind: "report", report: await auditUrlCached(url) };
  } catch (err) {
    if (err instanceof FetchHttpError && err.status === 403) {
      return { kind: "blocked", url, status: err.status };
    }
    return {
      kind: "error",
      url,
      message: err instanceof Error ? err.message : "Unknown error.",
    };
  }
}

export default async function GeoPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url: rawUrl } = await searchParams;
  const url = normalizeUrl(rawUrl);
  const outcome = await runAudit(url);
  const invalidInput = Boolean(rawUrl && !url);

  return (
    <main className="shell">
      <section className="section">
        <h1 className="page-title">GEO Audit</h1>
        <p className="page-intro">
          Scores how AI-readable a page is — structured data, heading
          hierarchy, metadata, and E-E-A-T signals — and lists concrete
          improvements. Built for OECD.org pages; works on any URL.
        </p>

        <form className="geo-form" method="get" action="/geo">
          <input
            className="text-input"
            type="text"
            name="url"
            placeholder="https://www.oecd.org/…"
            defaultValue={rawUrl ?? ""}
            aria-label="Page URL to audit"
          />
          <button className="btn" type="submit">
            Run audit
          </button>
        </form>
        {invalidInput && (
          <p className="form-error">
            That doesn&apos;t look like a valid http(s) URL.
          </p>
        )}
      </section>

      {outcome.kind === "blocked" && (
        <section className="section">
          <div className="finding-panel">
            <div className="finding-label">Finding</div>
            <p>
              This page blocks automated access (HTTP {outcome.status}) — a
              GEO-relevant signal in itself: if simple crawlers are blocked, AI
              crawlers may be blocked too.
            </p>
            <p className="section-note">
              Audited URL: <span className="num">{outcome.url}</span>. Consider
              verifying how the site treats known AI crawler user-agents
              (GPTBot, ClaudeBot, Google-Extended) in robots.txt and at the
              network edge.
            </p>
          </div>
        </section>
      )}

      {outcome.kind === "error" && (
        <section className="section">
          <div className="empty-state">
            Could not audit {outcome.url}: {outcome.message}
          </div>
        </section>
      )}

      {outcome.kind === "report" && <AuditReport report={outcome.report} />}
    </main>
  );
}

function AuditReport({ report }: { report: GeoAuditResult }) {
  return (
    <>
      <section className="section geo-result-head">
        <div className="headline-score">
          <div className="label">AI-readability score</div>
          <div className="value num">
            {report.overallScore}
            <small>/ 100</small>
          </div>
          <p className="meta">{report.url}</p>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Categories</h2>
        <div className="geo-cats">
          {report.categories.map((cat) => (
            <div className="geo-cat" key={cat.id}>
              <div className="geo-cat-head">
                <span className="geo-cat-name">{cat.label}</span>
                <span className="geo-cat-score num">
                  {cat.score}
                  <small> / 100 · weight {cat.weight.toFixed(2)}</small>
                </span>
              </div>
              <ul className="geo-checks">
                {cat.checks.map((check) => {
                  const icon = STATUS_ICON[check.status];
                  return (
                    <li key={check.id}>
                      <span className={`check-icon ${icon.className}`} aria-hidden>
                        {icon.glyph}
                      </span>
                      <span>
                        <strong>{check.label}.</strong> {check.detail}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {report.recommendations.length > 0 ? (
        <section className="section">
          <h2 className="section-title">
            Recommendations ({report.recommendations.length})
          </h2>
          <ol className="geo-recs">
            {report.recommendations.map((rec) => (
              <li key={rec}>{rec}</li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="section">
          <p className="section-note">
            No recommendations — the page is well optimized for AI readability.
          </p>
        </section>
      )}
    </>
  );
}
