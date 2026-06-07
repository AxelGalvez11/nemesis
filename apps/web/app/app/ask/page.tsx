"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type {
  AskResponse,
  Citation,
  ConversationMessage,
  EvidenceBriefResponse,
  UsageSnapshot,
} from "@pharmabro/shared";
import {
  askQuestion,
  fetchConversationMessages,
  fetchUsage,
  generateEvidenceBrief,
  saveConversationTurn,
  type AskQuotaError,
} from "@/lib/api";
import { Badge, ErrorText, SourceAnchor } from "@/components/ui";

function isQuotaError(e: unknown): e is AskQuotaError {
  return e instanceof Error && "quota" in e;
}

function isAskResponse(value: unknown): value is AskResponse {
  return !!value
    && typeof value === "object"
    && "answer_id" in value
    && "answer_sections" in value
    && "plain_english_summary" in value;
}

export default function AskPage() {
  return (
    <Suspense fallback={<AskPageFallback />}>
      <AskExperience />
    </Suspense>
  );
}

function AskPageFallback() {
  return (
    <div className="chat-layout">
      <section className="chat-column">
        <div className="chat-thread">
          <ThreadStatus label="Loading chat" />
        </div>
      </section>
      <SourceRail citations={[]} />
    </div>
  );
}

function AskExperience() {
  const router = useRouter();
  const search = useSearchParams();
  const conversationIdFromUrl = search.get("c");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(conversationIdFromUrl);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, EvidenceBriefResponse>>({});
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  async function refreshUsage() {
    try {
      setUsage(await fetchUsage());
      setUsageError(null);
    } catch (err) {
      setUsageError(err instanceof Error ? err.message : "Usage failed");
    }
  }

  useEffect(() => {
    void refreshUsage();
  }, []);

  useEffect(() => {
    setConversationId(conversationIdFromUrl);
    setError(null);
    setReportError(null);
    if (!conversationIdFromUrl) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    let alive = true;
    setLoadingMessages(true);
    void fetchConversationMessages(conversationIdFromUrl)
      .then((loaded) => {
        if (alive) setMessages(loaded);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Conversation failed");
      })
      .finally(() => {
        if (alive) setLoadingMessages(false);
      });

    return () => {
      alive = false;
    };
  }, [conversationIdFromUrl]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const askCounter = usage?.counters.ask_daily;
  const askUsed = askCounter?.used ?? 0;
  const askLimit = askCounter?.limit ?? 10;
  const plan = usage?.plan ?? "free";
  const limitReached = askUsed >= askLimit;
  const briefCounter = usage?.counters.evidence_brief_daily;
  const briefsEnabled = !!briefCounter;
  const activeAnswer = useMemo(() => {
    const assistantMessages = messages.filter((message) => message.role === "assistant");
    const latest = assistantMessages.at(-1);
    return isAskResponse(latest?.payload) ? latest.payload : null;
  }, [messages]);

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || busy || limitReached) return;

    const localOrdinal = (messages.at(-1)?.ordinal ?? 0) + 1;
    const pendingUser: ConversationMessage = {
      id: `pending-user-${Date.now().toString(36)}`,
      conversation_id: conversationId ?? "pending",
      role: "user",
      ordinal: localOrdinal,
      content: trimmed,
      answer_id: null,
      payload: {},
      citations: [],
      created_at: new Date().toISOString(),
    };

    setBusy(true);
    setError(null);
    setReportError(null);
    setQuestion("");
    setMessages((current) => [...current, pendingUser]);

    try {
      const answer = await askQuestion(trimmed);
      try {
        const saved = await saveConversationTurn(conversationId, trimmed, answer);
        setConversationId(saved.conversation.id);
        setMessages((current) => [
          ...current.filter((message) => !message.id.startsWith("pending-")),
          ...saved.messages,
        ]);
        if (!conversationId) router.replace(`/app/ask?c=${saved.conversation.id}`);
      } catch (saveError) {
        const now = new Date().toISOString();
        setMessages((current) => [
          ...current.filter((message) => !message.id.startsWith("pending-")),
          {
            ...pendingUser,
            id: `local-user-${Date.now().toString(36)}`,
            created_at: now,
          },
          {
            id: `local-assistant-${Date.now().toString(36)}`,
            conversation_id: conversationId ?? "local",
            role: "assistant",
            ordinal: localOrdinal + 1,
            content: answer.plain_english_summary,
            answer_id: answer.answer_id,
            payload: answer,
            citations: answer.citations,
            created_at: now,
          },
        ]);
        setError(saveError instanceof Error
          ? `Answer generated, but this chat was not saved: ${saveError.message}`
          : "Answer generated, but this chat was not saved.");
      }
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== pendingUser.id));
      if (isQuotaError(err)) {
        setError(`Daily Ask limit reached (${err.quota.used}/${err.quota.limit}) on ${err.quota.plan}.`);
      } else {
        setError(err instanceof Error ? err.message : "Ask failed");
      }
    } finally {
      setBusy(false);
      void refreshUsage();
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void onSubmit();
  }

  async function onGenerateBrief(answerId: string) {
    setReportBusy(answerId);
    setReportError(null);
    try {
      const report = await generateEvidenceBrief(answerId);
      setReports((current) => ({ ...current, [answerId]: report }));
      void refreshUsage();
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Evidence brief failed");
    } finally {
      setReportBusy(null);
    }
  }

  return (
    <div className="chat-layout">
      <section className="chat-column">
        <div className="chat-thread">
          {loadingMessages ? <ThreadStatus label="Loading chat" /> : null}
          {!loadingMessages && messages.length === 0 ? <EmptyThread /> : null}
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              reports={reports}
              reportBusy={reportBusy}
              briefsEnabled={briefsEnabled}
              onGenerateBrief={onGenerateBrief}
            />
          ))}
          {busy ? <ThinkingBubble /> : null}
          <div ref={bottomRef} />
        </div>

        <form className="chat-input-bar" onSubmit={onSubmit}>
          <div className="composer">
            <textarea
              aria-label="Ask PharmaOrb"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onComposerKeyDown}
              maxLength={1000}
              placeholder="Ask about a drug, label, trial, safety signal, or evidence question..."
              rows={1}
            />
            <button disabled={busy || !question.trim() || limitReached} type="submit">
              {busy ? "..." : "Ask"}
            </button>
          </div>
          <div className="composer-meta">
            <span>{plan} plan · {askUsed}/{askLimit} Ask today</span>
            <Link href="/app/billing">{plan === "plus" ? "Manage plan" : "Upgrade"}</Link>
          </div>
          {limitReached ? <ErrorText>Daily Ask limit reached. Upgrade or wait for the next daily reset.</ErrorText> : null}
          {usageError ? <ErrorText>{usageError}</ErrorText> : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          {reportError ? <ErrorText>{reportError}</ErrorText> : null}
        </form>
      </section>

      <SourceRail citations={activeAnswer?.citations ?? []} />
    </div>
  );
}

function EmptyThread() {
  return (
    <div className="empty-thread">
      <span className="ai-avatar large">P</span>
      <h1>Ask PharmaOrb</h1>
      <p className="muted">Cited biomedical answers from the evidence corpus. Educational use only, not medical advice.</p>
    </div>
  );
}

function ThreadStatus({ label }: { label: string }) {
  return (
    <div className="thread-status">
      <span>{label}</span>
      <span className="thinking-dots"><i /><i /><i /></span>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="message-row assistant">
      <span className="ai-avatar">P</span>
      <div className="message-bubble assistant-bubble thinking-bubble">
        <span>Thinking</span>
        <span className="thinking-dots"><i /><i /><i /></span>
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  reports,
  reportBusy,
  briefsEnabled,
  onGenerateBrief,
}: {
  message: ConversationMessage;
  reports: Record<string, EvidenceBriefResponse>;
  reportBusy: string | null;
  briefsEnabled: boolean;
  onGenerateBrief: (answerId: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="message-row user">
        <div className="message-bubble user-bubble">{message.content}</div>
      </div>
    );
  }

  const answer = isAskResponse(message.payload) ? message.payload : null;
  return (
    <div className="message-row assistant">
      <span className="ai-avatar">P</span>
      <div className="message-bubble assistant-bubble">
        {answer ? (
          <AnswerCard
            answer={answer}
            report={reports[answer.answer_id] ?? null}
            reportBusy={reportBusy === answer.answer_id}
            briefsEnabled={briefsEnabled}
            onGenerateBrief={() => onGenerateBrief(answer.answer_id)}
          />
        ) : (
          <p>{message.content}</p>
        )}
      </div>
    </div>
  );
}

function AnswerCard({
  answer,
  report,
  reportBusy,
  briefsEnabled,
  onGenerateBrief,
}: {
  answer: AskResponse;
  report: EvidenceBriefResponse | null;
  reportBusy: boolean;
  briefsEnabled: boolean;
  onGenerateBrief: () => void;
}) {
  const sections = answer.answer_sections;
  return (
    <article className="answer-card compact-answer">
      <div className="answer-heading">
        <Badge>{answer.evidence_grade}</Badge>
      </div>
      <p>{answer.plain_english_summary}</p>
      {answer.template ? <p className="warning">Template: {answer.template}</p> : null}
      <AnswerList title="What we know" points={sections.what_we_know} citations={answer.citations} />
      <AnswerList title="Safety notes" points={sections.safety_notes} citations={answer.citations} />
      <AnswerList title="What we do not know" points={sections.what_we_do_not_know} citations={answer.citations} />
      {briefsEnabled ? (
        <div className="answer-section report-actions">
          <div>
            <h3>Evidence brief</h3>
            <p className="muted">Save this answer as a reusable brief.</p>
          </div>
          <button type="button" onClick={onGenerateBrief} disabled={reportBusy}>
            {reportBusy ? "Generating..." : report ? "Regenerate" : "Generate"}
          </button>
        </div>
      ) : null}
      {report ? <EvidenceBriefCard report={report} /> : null}
    </article>
  );
}

function EvidenceBriefCard({ report }: { report: EvidenceBriefResponse }) {
  return (
    <section className="brief-card">
      <div className="row">
        <h3>{report.title}</h3>
        <Badge>{report.evidence_grade}</Badge>
      </div>
      <p>{report.summary}</p>
      {report.sections.map((section) => (
        <div className="answer-section" key={section.title}>
          <h4>{section.title}</h4>
          <ul>
            {section.bullets.map((bullet, index) => <li key={`${section.title}-${index}`}>{bullet}</li>)}
          </ul>
        </div>
      ))}
      <p className="muted">Saved brief · {report.source_count} cited source{report.source_count === 1 ? "" : "s"} · Export: {report.export_formats.join(", ")}</p>
    </section>
  );
}

function AnswerList({
  title,
  points,
  citations,
}: {
  title: string;
  points: Array<{ text: string; citation_ids?: string[] }>;
  citations: Citation[];
}) {
  if (!points.length) return null;
  return (
    <div className="answer-section">
      <h3>{title}</h3>
      <ul className="answer-points">
        {points.map((point, index) => (
          <li key={`${title}-${index}`}>
            <span>{point.text}</span>
            <CitationBubbles ids={point.citation_ids ?? []} citations={citations} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CitationBubbles({ ids, citations }: { ids: string[]; citations: Citation[] }) {
  const resolved = ids
    .map((id) => citations.find((citation) => citation.chunk_tag === id))
    .filter((citation): citation is Citation => !!citation);
  if (!resolved.length) return null;
  return (
    <span className="citation-bubbles">
      {resolved.map((citation) => (
        <Link
          className="citation-bubble"
          href={`/app/source/${citation.source_id}`}
          key={`${citation.source_id}-${citation.chunk_tag}`}
          title={citation.title ?? citation.source_type}
        >
          {citation.chunk_tag.replace(/\D/g, "") || citation.chunk_tag}
        </Link>
      ))}
    </span>
  );
}

function SourceRail({ citations }: { citations: Citation[] }) {
  return (
    <aside className="source-rail">
      <div className="eyebrow">Citations ({citations.length})</div>
      {citations.length ? (
        citations.map((source) => (
          <section className="source-card cited" key={`${source.source_id}-${source.chunk_tag}`}>
            <div className="source-card-heading">
              <span className="citation-bubble static">{source.chunk_tag.replace(/\D/g, "") || source.chunk_tag}</span>
              <div>
                <Badge>{source.source_type}</Badge>
                <p className="muted">{source.published_date ?? "current"}</p>
              </div>
            </div>
            <h3>{source.title || "Untitled source"}</h3>
            <div className="supporting-section">
              <span>Supporting section</span>
              <p>{source.section || "Section not specified"}</p>
            </div>
            <div className="source-actions">
              <SourceAnchor sourceId={source.source_id} label="Source details" />
              {source.url ? <a className="source-link" href={source.url} target="_blank" rel="noreferrer">Source URL</a> : null}
            </div>
          </section>
        ))
      ) : (
        <p className="muted">Citations appear here after a cited answer.</p>
      )}
      <p className="muted">Educational use only. Not medical advice.</p>
    </aside>
  );
}
