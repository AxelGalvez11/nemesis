"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AskResponse } from "@pharmabro/shared";
import { askQuestion, fetchUsage, type AskQuotaError } from "@/lib/api";
import { useAppChrome } from "@/components/AppShell";
import { EvidencePanel } from "@/components/EvidencePanel";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";

function isQuotaError(e: unknown): e is AskQuotaError {
  return e instanceof Error && "quota" in e;
}

// Honest pipeline stages (classify → retrieve → rerank → generate), animated while the request runs.
const STAGES = ["Reading the question", "Searching the evidence library", "Ranking the strongest sources", "Composing a cited answer"];

const MODES = [
  { id: "evidence", label: "Evidence", live: true, hint: "Cited answer from the library + live sources" },
  { id: "deep", label: "Deep research", live: false, hint: "Multi-step research — coming soon" },
  { id: "review", label: "Literature review", live: false, hint: "Structured lit review — coming soon" },
  { id: "meta", label: "Meta-analysis", live: false, hint: "Computed pooled estimates — coming soon" },
] as const;

const SUGGESTIONS = [
  "What are the major warnings for semaglutide?",
  "Metformin dosing when eGFR is 40?",
  "Compare semaglutide and tirzepatide safety evidence",
  "Is lisinopril safe with spironolactone?",
];

const PROVIDER_ABBR: Record<string, string> = { openfda: "FDA", dailymed: "DM", pubmed: "PMID", pubmed_oa: "PMID", clinicaltrials: "NCT", faers: "FAERS" };
function abbr(t: string): string {
  const k = Object.keys(PROVIDER_ABBR).find((p) => t.toLowerCase().includes(p));
  return (k ? PROVIDER_ABBR[k] : undefined) ?? "REF";
}
const normTag = (t: string) => t.replace(/[[\]\s]/g, "");

export default function AskPage() {
  const chrome = useAppChrome();
  const [question, setQuestion] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("evidence");
  const [modeOpen, setModeOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Inject the topbar (thread meta) + evidence panel into the shell.
  useEffect(() => {
    chrome.setEvidence(<EvidencePanel citations={answer?.citations ?? []} />);
    chrome.setTopbar(
      <div>
        <div className="thread-title">{lastQuestion || "New question"}</div>
        <div className="thread-sub">{answer ? `${answer.citations.length} sources · ${answer.evidence_grade.replace(/_/g, " ")}` : "live evidence · cited"}</div>
      </div>,
    );
    return () => {
      chrome.setEvidence(null);
      chrome.setTopbar(null);
    };
  }, [answer, lastQuestion, chrome]);

  // Animate the thinking stages while busy.
  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length)), 800);
    return () => clearInterval(t);
  }, [busy]);

  function autoGrow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }

  async function submit(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setLastQuestion(text);
    setQuestion("");
    if (taRef.current) taRef.current.style.height = "auto";
    try {
      const res = await askQuestion(text);
      setAnswer(res);
      void fetchUsage().catch(() => {});
    } catch (err) {
      if (isQuotaError(err)) setError(`Daily Ask limit reached (${err.quota.used}/${err.quota.limit}) on ${err.quota.plan}.`);
      else setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setBusy(false);
    }
  }

  const activeMode = MODES.find((m) => m.id === mode)!;
  const hasThread = busy || answer != null || lastQuestion !== "";

  return (
    <>
      <div className="thread">
        {!hasThread ? (
          <Welcome onPick={submit} />
        ) : (
          <div className="turn">
            <div className="msg-user"><div className="bubble">{lastQuestion}</div></div>
            <div className="msg-ai">
              <Orb size={28} busy={busy} className="" />
              <div className="ai-body">
                {busy ? <Thinking stage={stage} /> : answer ? <Answer answer={answer} /> : null}
                {error ? <p className="tmpl-note">{error}</p> : null}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <div className="box">
            <textarea
              ref={taRef}
              rows={1}
              value={question}
              maxLength={500}
              placeholder="Ask about a drug, dose, interaction, or monograph…"
              onChange={(e) => { setQuestion(e.target.value); autoGrow(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(question); } }}
            />
            <div className="tools">
              <div style={{ position: "relative" }}>
                <button className="mode" onClick={() => setModeOpen((v) => !v)} type="button">
                  <Icon name="sparkle" size={14} />
                  <b>{activeMode.label}</b>{activeMode.live ? " · live" : " · soon"}
                </button>
                {modeOpen ? (
                  <div className="acct-menu" style={{ bottom: "auto", top: "calc(100% + 6px)", left: 0, right: "auto", width: 230 }}>
                    {MODES.map((m) => (
                      <button key={m.id} onClick={() => { setMode(m.id); setModeOpen(false); }} title={m.hint}>
                        <Icon name={m.id === mode ? "check" : "sparkle"} size={14} />
                        <span style={{ flex: 1 }}>{m.label}</span>
                        {!m.live ? <small style={{ color: "var(--text-3)" }}>soon</small> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button className="tool" title="Attach (soon)" type="button" disabled><Icon name="attach" size={16} /></button>
              <div className="spacer" />
              <button className="send" title="Send" onClick={() => submit(question)} disabled={busy || !question.trim()}>
                <Icon name="send" size={18} />
              </button>
            </div>
          </div>
          {error ? <div className="err">{error}</div> : <div className="hint">⏎ to send · Shift+⏎ for a new line · answers are cited</div>}
        </div>
      </div>
    </>
  );
}

function Welcome({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="turn" style={{ paddingTop: 60, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><Orb size={54} /></div>
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Ask PharmaOrb</h2>
      <p className="muted" style={{ maxWidth: 460, margin: "0 auto 22px" }}>
        Every medical claim is source-backed. Ask about a drug, dose, interaction, or monograph for a cited answer.
      </p>
      <div className="chip-row" style={{ justifyContent: "center", maxWidth: 560, margin: "0 auto" }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip-action" onClick={() => onPick(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}

function Thinking({ stage }: { stage: number }) {
  return (
    <div className="thinking">
      <div className="think-row"><span className="shimmer">{STAGES[Math.min(stage, STAGES.length - 1)]}…</span></div>
      <div className="qsearch">
        {STAGES.map((label, i) => (
          <div key={label} className={`qchip${i < stage ? " done" : ""}`}>
            <span className="tick"><Icon name="check" size={10} /></span>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Answer({ answer }: { answer: AskResponse }) {
  const citeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of answer.citations) m.set(normTag(c.chunk_tag), abbr(c.source_type));
    return m;
  }, [answer.citations]);

  const s = answer.answer_sections;
  return (
    <div className="answer fade">
      <span className="grade">{answer.evidence_grade.replace(/_/g, " ")}</span>
      <h4 style={{ marginTop: 8 }}>{answer.plain_english_summary ? null : "Answer"}</h4>
      {answer.plain_english_summary ? <p>{answer.plain_english_summary}</p> : null}
      {answer.template ? <p className="tmpl-note">Conservative response ({answer.template.replace(/_/g, " ")}).</p> : null}

      <Section title="What we know" points={s.what_we_know} citeMap={citeMap} />
      <Section title="Safety" points={s.safety_notes} citeMap={citeMap} />
      <Section title="What we don't know" points={s.what_we_do_not_know} citeMap={citeMap} />

      {s.questions_to_ask?.length ? (
        <section>
          <h5>Questions to ask a clinician</h5>
          <ul>{s.questions_to_ask.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </section>
      ) : null}

      <div className="msg-actions">
        <button className="icon-btn" title="Copy" onClick={() => navigator.clipboard?.writeText(answer.plain_english_summary)}><Icon name="copy" size={15} /></button>
        <button className="icon-btn" title="Save (soon)" disabled><Icon name="save" size={15} /></button>
      </div>
    </div>
  );
}

function Section({ title, points, citeMap }: { title: string; points: Array<{ text: string; citation_ids?: string[] }>; citeMap: Map<string, string> }) {
  if (!points?.length) return null;
  return (
    <section>
      <h5>{title}</h5>
      <ul>
        {points.map((p, i) => (
          <li key={i}>
            {p.text}{" "}
            {(p.citation_ids ?? []).map((id) => {
              const t = normTag(id);
              return <span key={id} className="cite">{citeMap.get(t) ?? "REF"}&nbsp;{t}</span>;
            })}
          </li>
        ))}
      </ul>
    </section>
  );
}
