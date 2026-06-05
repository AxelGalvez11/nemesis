"use client";

import { FormEvent, useState } from "react";
import type { AskResponse, Citation } from "@pharmabro/shared";
import { askQuestion, type AskQuotaError } from "@/lib/api";
import { Badge, ErrorText, SourceAnchor } from "@/components/ui";

function isQuotaError(e: unknown): e is AskQuotaError {
  return e instanceof Error && "quota" in e;
}

const quickChips = ["Ask follow-up", "Compare to aspirin", "What are alternatives?", "Is occasional use safe?"];

export default function AskPage() {
  const [question, setQuestion] = useState("What are the major warnings for semaglutide?");
  const [lastQuestion, setLastQuestion] = useState(question);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setAnswer(null);
    setLastQuestion(question);
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
    <div className="chat-layout">
      <section className="chat-column">
        <div className="chat-thread">
          <div className="user-message">{lastQuestion}</div>
          <div className="ai-message">
            <span className="ai-avatar">P</span>
            {answer ? <AnswerCard answer={answer} /> : <EmptyAnswer busy={busy} />}
          </div>
        </div>

        <form className="chat-input-bar" onSubmit={onSubmit}>
          <div className="quick-chips">
            {quickChips.map((chip) => <span className="chip" key={chip}>{chip}</span>)}
          </div>
          <div className="row">
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} />
            <button disabled={busy || !question.trim()} type="submit">{busy ? "Building..." : "Ask"}</button>
          </div>
          {error ? <ErrorText>{error}</ErrorText> : null}
        </form>
      </section>

      <SourceRail citations={answer?.citations ?? []} />
    </div>
  );
}

function EmptyAnswer({ busy }: { busy: boolean }) {
  return (
    <div className="answer-card">
      <div className="row">
        <h2>{busy ? "Checking sources" : "Ask PharmaOrb"}</h2>
        <Badge>{busy ? "working" : "cited answers"}</Badge>
      </div>
      <p className="muted">
        Every medical claim should be source-backed. Ask a medication, interaction, trial, or safety question to generate a cited response.
      </p>
      <div className="quick-chips">
        <span className="chip">DailyMed</span>
        <span className="chip">PubMed</span>
        <span className="chip">ClinicalTrials.gov</span>
      </div>
    </div>
  );
}

function AnswerCard({ answer }: { answer: AskResponse }) {
  const sections = answer.answer_sections;
  return (
    <div className="answer-card">
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
    </div>
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

function SourceRail({ citations }: { citations: Citation[] }) {
  const shown = citations.length ? citations : [
    {
      chunk_tag: "[1]",
      source_id: "source-preview-label",
      source_type: "openfda",
      title: "Semaglutide prescribing information",
      section: "Warnings",
      url: null,
      license: "public-domain",
      published_date: "2025-01-01",
      retrieved_at: "2026-06-05T12:00:00Z",
    },
    {
      chunk_tag: "[2]",
      source_id: "source-preview-trial",
      source_type: "clinicaltrials",
      title: "Semaglutide outcomes trial",
      section: "Study design",
      url: null,
      license: "public",
      published_date: "2025-09-15",
      retrieved_at: "2026-06-05T12:00:00Z",
    },
  ] satisfies Citation[];

  return (
    <aside className="source-rail">
      <div className="eyebrow">Sources used ({shown.length})</div>
      {shown.map((source) => (
        <section className="source-card" key={`${source.source_id}-${source.chunk_tag}`}>
          <div className="row">
            <Badge>{source.source_type}</Badge>
            <span className="muted">{source.published_date ?? "current"}</span>
          </div>
          <h3>{source.title}</h3>
          <p className="muted">{source.section}</p>
          <SourceAnchor sourceId={source.source_id} label="Open source" />
        </section>
      ))}
      <p className="muted">Educational use only. Not medical advice.</p>
    </aside>
  );
}
