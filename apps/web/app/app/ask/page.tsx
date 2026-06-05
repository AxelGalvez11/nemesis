"use client";

import { FormEvent, useState } from "react";
import type { AskResponse } from "@pharmabro/shared";
import { askQuestion, type AskQuotaError } from "@/lib/api";
import { Badge, Card, ErrorText, PageHeader, SourceAnchor } from "@/components/ui";

function isQuotaError(e: unknown): e is AskQuotaError {
  return e instanceof Error && "quota" in e;
}

export default function AskPage() {
  const [question, setQuestion] = useState("What are the major warnings for semaglutide?");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      setAnswer(await askQuestion(question));
    } catch (err) {
      if (isQuotaError(err)) {
        setError(`Daily Ask limit reached (${err.quota.used}/${err.quota.limit}) on ${err.quota.plan}.`);
      } else {
        setError(err instanceof Error ? err.message : "Ask failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Ask PharmaOrb" eyebrow="Cited answers">
        Every medical claim must be source-backed, and safety questions stay conservative.
      </PageHeader>
      <Card>
        <form className="stack" onSubmit={onSubmit}>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} />
          <button disabled={busy || !question.trim()} type="submit">{busy ? "Building cited answer…" : "Ask"}</button>
        </form>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Card>
      {answer ? <AnswerCard answer={answer} /> : null}
    </>
  );
}

function AnswerCard({ answer }: { answer: AskResponse }) {
  const sections = answer.answer_sections;
  return (
    <Card>
      <div className="row">
        <h2>Answer</h2>
        <Badge>{answer.evidence_grade}</Badge>
      </div>
      <p>{answer.plain_english_summary}</p>
      {answer.template ? <p className="warning">Template: {answer.template}</p> : null}
      <AnswerList title="What we know" points={sections.what_we_know} />
      <AnswerList title="Safety notes" points={sections.safety_notes} />
      <AnswerList title="What we do not know" points={sections.what_we_do_not_know} />
      {answer.citations.length ? (
        <div className="answer-section">
          <h3>Sources</h3>
          <ul className="list">
            {answer.citations.map((c) => (
              <li key={`${c.source_id}-${c.chunk_tag}`}>
                <SourceAnchor sourceId={c.source_id} label={c.title || c.source_type} /> <span className="muted">{c.section}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function AnswerList({ title, points }: { title: string; points: Array<{ text: string; citation_ids?: string[] }> }) {
  if (!points.length) return null;
  return (
    <div className="answer-section">
      <h3>{title}</h3>
      <ul>
        {points.map((p, i) => <li key={`${title}-${i}`}>{p.text}</li>)}
      </ul>
    </div>
  );
}
