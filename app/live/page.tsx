/**
 * Live Query — Screen 3.
 *
 * Server component: passes the fixed question set to a small client island that
 * calls the server-side /api/live route. The live LLM call happens only on the
 * server; the browser only ever sees the resulting answer + analysis.
 */

import { SUBJECT_INSTITUTION } from "../../lib/metric";
import questionSet from "../../scripts/questions.json";
import { LiveQueryClient } from "./LiveQueryClient";

export default function LivePage() {
  const questions = questionSet.questions.map((q) => ({
    id: q.id,
    domain: q.domain,
    text: q.text,
  }));

  return (
    <main className="shell">
      <section className="section">
        <h1 className="page-title">Live Query</h1>
        <p className="page-intro">
          Ask one of the {questions.length} policy questions live and watch,
          in real time, whether the {SUBJECT_INSTITUTION}
          {" "}surfaces in the model&apos;s answer — the same two-step pipeline
          (answer, then structured analysis) used to build the stored snapshots.
        </p>
        <LiveQueryClient questions={questions} subject={SUBJECT_INSTITUTION} />
      </section>
    </main>
  );
}
