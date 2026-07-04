/**
 * AboutContent — the prose shown in the "About" modal.
 *
 * Kept deliberately separate from any logic so the text is easy to edit. Change
 * the copy freely; the surrounding modal chrome lives in HeaderActions/Modal.
 */

import { SocialLinks } from "./icons";

export function AboutContent() {
  return (
    <div className="prose">
      <p>
        <strong>Meridian</strong> measures how visible the OECD is inside
        AI-generated answers. As people increasingly ask AI assistants their
        policy questions instead of reading source websites, the institutions an
        AI names — and the ones it omits — quietly shape which organisations are
        seen as authoritative. Meridian turns that invisible dynamic into
        something measured and monitored over time.
      </p>

      <h3>The problem it addresses</h3>
      <p>
        Traditional web analytics stop at the click. They cannot see whether an
        AI answer about global tax, education, or AI governance mentions the
        OECD, cites one of its publications, or reaches instead for the IMF, the
        World Bank, or the UN. Meridian queries a model across a fixed set of
        real policy questions, analyses each answer for institutional mentions,
        and scores OECD visibility with a transparent, defensible metric — the
        OECD AI Visibility Score (OAVS) — alongside a per-page GEO
        (Generative-Engine-Optimisation) audit of AI readability.
      </p>

      <h3>How it maps to the role</h3>
      <p>
        It is a working prototype of the analytical remit of the OECD{" "}
        <em>Junior AI &amp; Communications Intelligence Officer</em> (COM/CISC):
      </p>
      <ul>
        <li>
          <strong>Visibility in AI-mediated environments</strong> — quantifying
          how the OECD surfaces in generative-AI answers, not just search
          results.
        </li>
        <li>
          <strong>GEO / AI discoverability</strong> — auditing how readable and
          citable OECD web content is to AI crawlers and models.
        </li>
        <li>
          <strong>Competitor share of voice</strong> — benchmarking OECD
          prominence against peer institutions across policy domains.
        </li>
        <li>
          <strong>Performance reporting</strong> — a dashboard and exportable
          brief that track these signals as repeatable, time-series snapshots.
        </li>
      </ul>

      <h3>Why I built it</h3>
      <p>
        I wanted to demonstrate the role in practice rather than describe it —
        to take a genuine communications-intelligence question, design a sound
        way to measure it, and build the end-to-end tooling to answer it. Every
        design decision here, from the metric to the question set, is one I can
        explain and defend.
      </p>

      <p className="prose-signoff">
        Built by <strong>Eren Kahraman</strong>
        {" as a demonstration project for the OECD Junior AI & Communications Intelligence Officer role (COM/CISC)."}
      </p>

      <div className="modal-social">
        <SocialLinks size={20} />
      </div>
    </div>
  );
}
