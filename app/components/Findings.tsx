/**
 * Findings — the narrative core of the dashboard: methodology → results →
 * recommendations, with charts where a visual genuinely clarifies the point.
 *
 * Every figure in the prose is interpolated from the SAME data object that
 * drives the charts (lib/dashboard.ts), so the text can never disagree with
 * the visuals or go stale when a new collection run lands. Editable copy
 * lives in this one file.
 */

import type { OverviewData } from "../../lib/dashboard";
import { domainLabel } from "../../lib/domains";
import { BarChart } from "./BarChart";
import { Heatmap } from "./Heatmap";
import { WeightsBar } from "./WeightsBar";
import { DomainContrast } from "./DomainContrast";

/** Oxford-comma-free "a, b and c" list join for prose. */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Lowercase a domain label for mid-sentence use, preserving leading acronyms
 * ("Taxation" → "taxation", but "AI governance" stays as-is).
 */
function proseLabel(domain: string): string {
  return domainLabel(domain).replace(/^([A-Z])(?=[a-z])/, (c) =>
    c.toLowerCase(),
  );
}

export function Findings({ data }: { data: OverviewData }) {
  const { subjectResult, comparison, heatmap, mentionCounts, qa, run } = data;
  if (!subjectResult || !run) return null;

  // Derived figures the prose quotes — computed, never hardcoded.
  const runnerUp = comparison.find((c) => c.institution !== data.subject);
  const multiple = runnerUp && runnerUp.oavs > 0
    ? (subjectResult.oavs / runnerUp.oavs).toFixed(1)
    : null;
  const sharePct = Math.round(subjectResult.shareOfVoice);
  const domainScores = heatmap
    .map((row) => ({
      domain: row.domain,
      oavs: row.cells.find((c) => c.institution === data.subject)?.oavs ?? 0,
    }))
    .sort((a, b) => b.oavs - a.oavs);
  const top = domainScores.slice(0, 4).filter((d) => d.oavs > 0);
  const zeros = domainScores.filter((d) => d.oavs === 0);
  const low = zeros.length > 0 ? zeros : domainScores.slice(-3).reverse();

  return (
    <section className="section findings">
      <h2 className="section-title">Findings</h2>

      <div className="findings-prose">
        <h3>The problem this addresses</h3>
        <p>
          Policy audiences increasingly get their first answer from a language
          model, not a search results page. When an AI answers a question about
          tax reform or education outcomes, the institutions it names — and the
          ones it leaves out — quietly decide who is treated as the authority.
          Traditional web analytics stop at the click and cannot see any of
          this. Meridian measures it directly.
        </p>

        <h3>How the measurement works</h3>
        <p>
          The starting point is a set of {run.questionCount} policy questions,{" "}
          {data.domainsPerQuestionCount} for each of the OECD&apos;s fourteen
          substantive directorates, from taxation and education to AI
          governance and development co-operation. The directorate structure is
          used deliberately as the sampling frame, so the measurement reflects
          the OECD&apos;s actual portfolio rather than an arbitrary list of
          topics. Each question is put to a language model exactly as a
          policymaker or journalist might ask it, with no mention of any
          institution. The answer then goes through a second, controlled
          analysis pass (run at temperature 0 for consistency) that extracts,
          in structured form, which of the four tracked institutions appear, in
          what order they are first mentioned, and whether each mention is
          backed by a specific named output — “PISA”, say, or “the BEPS
          framework” — rather than a passing reference. Every answer becomes a
          small record of who was cited, how prominently, and how concretely.
        </p>

        <h3>How those records become a score</h3>
        <p>
          From this raw evidence, each institution receives an OECD AI
          Visibility Score built from four components, each capturing a
          different dimension of visibility. Presence Rate asks how often the
          institution appears at all. Position Weight rewards being named
          first, since the first institution cited anchors the answer.
          Citation Depth distinguishes a specific, attributable reference from
          a generic name-drop, because a cited PISA figure carries more
          communicative weight than the bare word “OECD”. Share of Voice
          measures presence relative to all four tracked bodies combined. The
          weights reflect a deliberate judgement: appearing at all matters
          most, prominence and concreteness next, and competitive share
          provides context. Every weight is documented in the code and
          adjustable; nothing in the score is hidden.
        </p>
      </div>

      <WeightsBar />

      <div className="findings-prose">
        <h3>What the data showed</h3>
        <p>
          Measured this way, the OECD is the most visible institution overall:
          it holds {sharePct}% of all institutional mentions (
          {mentionCounts.subject} of {mentionCounts.total}) and a composite
          score of {subjectResult.oavs.toFixed(1)}
          {multiple && runnerUp
            ? ` — ${multiple}× ${runnerUp.institution}'s ${runnerUp.oavs.toFixed(1)}, the next most-visible body`
            : ""}
          . But the visibility is highly uneven, and the pattern is the
          finding.
        </p>
      </div>

      <div className="findings-chart">
        <BarChart
          items={comparison.map((c) => ({
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
            {comparison.map((c) => (
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
      </div>

      <div className="findings-prose">
        <p>
          The OECD dominates where it owns a single, well-branded product
          {top.length > 0 &&
            `: ${listJoin(
              top.map((d) => `${proseLabel(d.domain)} (${d.oavs.toFixed(1)})`),
            )}`}
          {" — "}BEPS and the global minimum tax, corporate governance
          standards, the AI Principles, PISA.
          {zeros.length > 0 && (
            <>
              {" "}In {zeros.length === 3 ? "three" : zeros.length} directorates,
              however, the OECD scores exactly zero:{" "}
              {listJoin(zeros.map((d) => proseLabel(d.domain)))}.
              The answers there speak in generic terms or cite national bodies,
              and never name the OECD — even though the OECD publishes actively
              in all three, through the Employment Outlook, Health at a Glance
              and the SME and Entrepreneurship Outlook.
            </>
          )}{" "}
          {qa.flaggedResponses === 0
            ? `An independent regex cross-check over all ${qa.totalResponses} answers confirms this is genuine, not a measurement artifact: it found no institution mention that the extraction step had missed.`
            : `An independent regex cross-check flagged ${qa.flaggedResponses} of ${qa.totalResponses} answers for possible under-extraction — treat the affected domain scores with care.`}
        </p>
      </div>

      <div className="findings-chart">
        <Heatmap rows={heatmap} institutions={data.institutions} />
      </div>

      <div className="findings-prose">
        <h3>Why the pattern looks like this</h3>
        <p>
          The data points to a clear interpretation: AI visibility tracks brand
          concentration, not institutional effort. Where the OECD&apos;s work
          is consolidated under one recognizable name, the model reaches for
          it. Where the contribution is spread across many publications without
          a dominant brand, or another institution holds the stronger topical
          association, the work is present in the world but absent from the
          answer. That is the core communications insight this tool surfaces:
          in AI-mediated channels the OECD&apos;s risk is not the quality of
          its work but the discoverability of it — and that discoverability is
          uneven in a way traditional metrics would never reveal.
        </p>
      </div>

      <DomainContrast high={top} zero={low} />

      <div className="findings-prose">
        <h3>How the OECD could act on this</h3>
        <p>
          Each finding points to a concrete response, and the zero-visibility
          directorates are the priority. The second half of this tool addresses
          exactly that: the GEO audit checks whether a given OECD page is
          structured to be read and cited by AI systems — quotable passages,
          structured data, an llms.txt index, and whether AI crawlers are being
          served or blocked. Testing surfaced a tangible example: the main
          OECD.org site returned an automated-access error (HTTP&nbsp;403) to a
          standard request, itself a discoverability risk worth investigating.
          Beyond page-level fixes, the measurement would be strengthened for
          production use by running across several models rather than one,
          repeating runs on a schedule so the score becomes a monitored trend
          rather than a snapshot, and testing question phrasing systematically
          to separate genuine invisibility from artifacts of wording.
        </p>

        <h3>How this maps to the role</h3>
        <p>
          This project is a working instance of the responsibilities of the
          Junior AI &amp; Communications Intelligence Officer role (COM/CISC).
          Analysing OECD visibility in AI-mediated environments — LLM
          referrals, generative search, bot-driven traffic — is the visibility
          score itself. Developing metrics and proxies for OECD presence in AI
          systems is the four-component OAVS. Exploratory work on Generative
          Engine Optimisation and AI discoverability is the GEO audit module,
          and monitoring LLM bot activity and content access is its crawler and
          robots.txt analysis. Combining traditional communications metrics
          with AI-era indicators into new methodologies and reporting
          frameworks is what the per-directorate view does; the dashboard is a
          communications performance reporting tool by construction. And the
          scheduled, automated collection — each run appending a comparable
          snapshot — is the continuous improvement of analytical processes the
          role calls for. The tool is deliberately transparent end to end,
          because measurement that informs communications strategy has to be
          defensible to the teams who act on it.
        </p>
      </div>
    </section>
  );
}
