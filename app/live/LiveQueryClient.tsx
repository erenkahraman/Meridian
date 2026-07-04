"use client";

import { useState } from "react";

interface QuestionOption {
  id: string;
  domain: string;
  text: string;
}

interface Mention {
  institution: string;
  position: number;
  citesPublication: boolean;
  context: string;
}

interface LiveResult {
  question: { id: string; domain: string; text: string };
  model: string;
  answer: string;
  mentions: Mention[];
}

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

/** Drop markdown bold markers for clean plain-text rendering (no HTML injection). */
function cleanAnswer(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

export function LiveQueryClient({
  questions,
  subject,
}: {
  questions: QuestionOption[];
  subject: string;
}) {
  const [selected, setSelected] = useState(questions[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Group questions by domain for the <optgroup>s.
  const grouped = questions.reduce<Record<string, QuestionOption[]>>((acc, q) => {
    (acc[q.domain] ??= []).push(q);
    return acc;
  }, {});

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  const subjectMention = result?.mentions.find((m) => m.institution === subject);

  return (
    <div>
      <div className="live-controls">
        <select
          className="text-input"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="Choose a policy question"
          disabled={loading}
        >
          {Object.entries(grouped).map(([domain, qs]) => (
            <optgroup key={domain} label={DOMAIN_LABELS[domain] ?? domain}>
              {qs.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.text}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="btn" onClick={run} disabled={loading || !selected}>
          {loading ? "Querying…" : "Run live query"}
        </button>
      </div>

      {loading && (
        <p className="section-note">
          Querying {subject === "OECD" ? "Gemini" : "the model"} live, then
          analyzing the answer for institution mentions…
        </p>
      )}

      {error && <div className="empty-state">{error}</div>}

      {result && (
        <div className="live-result">
          {/* Verdict for the subject institution */}
          <div className="live-verdict" data-hit={subjectMention ? "true" : "false"}>
            {subjectMention ? (
              <>
                <strong>{subject} appears</strong> in this answer — position{" "}
                {subjectMention.position}
                {subjectMention.citesPublication
                  ? ", with a specific publication cited."
                  : ", but with no specific publication cited."}
              </>
            ) : (
              <>
                <strong>{subject} does not appear</strong> in this answer.
              </>
            )}
          </div>

          <h2 className="section-title">Answer</h2>
          <p className="section-note answer-meta">
            {result.model} · {result.question.text}
          </p>
          <div className="answer-body">{cleanAnswer(result.answer)}</div>

          <h2 className="section-title">Detected institutions</h2>
          {result.mentions.length === 0 ? (
            <p className="section-note">
              No tracked institutions were mentioned in this answer.
            </p>
          ) : (
            <ul className="mention-list">
              {result.mentions.map((m) => (
                <li
                  key={m.institution}
                  className="mention"
                  data-emphasis={m.institution === subject ? "true" : undefined}
                >
                  <div className="mention-head">
                    <span className="mention-name">{m.institution}</span>
                    <span className="mention-tags">
                      <span className="tag">position {m.position}</span>
                      <span className={`tag ${m.citesPublication ? "tag-cite" : ""}`}>
                        {m.citesPublication ? "publication cited" : "no citation"}
                      </span>
                    </span>
                  </div>
                  {m.context && <p className="mention-context">“{m.context}”</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
