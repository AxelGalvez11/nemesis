"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { AskResponse } from "@pharmabro/shared";
import { askQuestion, fetchUsage, type AskQuotaError } from "@/lib/api";
import { normTag } from "@/lib/cite";
import { renderInline } from "@/lib/inline-md";
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
  { text: "What are the major warnings for semaglutide?", icon: "doc" as const },
  { text: "Metformin dosing when eGFR is 40?", icon: "calc" as const },
  { text: "Compare semaglutide and tirzepatide safety evidence", icon: "sparkle" as const },
  { text: "Is lisinopril safe with spironolactone?", icon: "search" as const },
];

const PROVIDER_ABBR: Record<string, string> = { openfda: "FDA", dailymed: "DM", pubmed: "PMID", pubmed_oa: "PMID", clinicaltrials: "NCT", faers: "FAERS" };
function abbr(t: string): string {
  const k = Object.keys(PROVIDER_ABBR).find((p) => t.toLowerCase().includes(p));
  return (k ? PROVIDER_ABBR[k] : undefined) ?? "REF";
}

export default function AskPage() {
  const chrome = useAppChrome();
  const [question, setQuestion] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bloom, setBloom] = useState(false);
  const [stage, setStage] = useState(0);
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("evidence");
  const [modeOpen, setModeOpen] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Clicking an inline citation chip opens the evidence panel (respecting the desktop column vs the
  // ≤1100px drawer) and scrolls to / highlights the matching source card. openEvidence is a stable
  // command from the shell that always OPENS (never toggles closed). The double rAF defers the
  // scroll until after React applies the open state and the drawer's slide-in begins laying out.
  const { setEvidence, setTopbar, openEvidence } = chrome;
  const onCite = useCallback((tag: string) => {
    openEvidence();
    setActiveTag(tag);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(`ev-src-${tag}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        // Move keyboard/AT focus into the panel too (the card is a focusable <a>/<Link>); on the
        // ≤1100px drawer this gets focus past the backdrop scrim. preventScroll keeps the
        // scrollIntoView framing above.
        el?.focus({ preventScroll: true });
      }),
    );
  }, [openEvidence]);

  // Inject the topbar (thread meta) + evidence panel into the shell. Depend on the STABLE setters
  // (useCallback in AppShell), NOT the whole `chrome` object — `chrome` is recreated every AppShell
  // render, so depending on it would re-run this effect in a loop as it sets shell state.
  useEffect(() => {
    setEvidence(<EvidencePanel citations={answer?.citations ?? []} activeTag={activeTag ?? undefined} />);
    setTopbar(
      <div>
        <div className="thread-title">{lastQuestion || "New question"}</div>
        <div className="thread-sub">{answer ? `${answer.citations.length} sources · ${answer.evidence_grade.replace(/_/g, " ")}` : "live evidence · cited"}</div>
      </div>,
    );
    return () => {
      setEvidence(null);
      setTopbar(null);
    };
  }, [answer, lastQuestion, activeTag, setEvidence, setTopbar]);

  // Animate the thinking stages while busy.
  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length)), 800);
    return () => clearInterval(t);
  }, [busy]);

  // One-shot "bloom" flare on the orb the moment an answer lands.
  useEffect(() => {
    if (!answer) return;
    setBloom(true);
    const t = setTimeout(() => setBloom(false), 700);
    return () => clearTimeout(t);
  }, [answer]);

  // Close the mode menu on Escape / outside click.
  useEffect(() => {
    if (!modeOpen) return;
    const onDoc = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".mode-wrap")) setModeOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModeOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [modeOpen]);

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
    setBloom(false); // clear any prior flare so the next answer re-triggers it (and it can't stick across an "ask again")
    setError(null);
    setAnswer(null);
    setActiveTag(null);
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

  const hasThread = busy || answer != null || lastQuestion !== "";
  const composer = (
    <Composer
      question={question} setQuestion={setQuestion} taRef={taRef} autoGrow={autoGrow}
      submit={submit} busy={busy} mode={mode} setMode={setMode}
      modeOpen={modeOpen} setModeOpen={setModeOpen} error={error}
    />
  );

  // Empty state: a centered "welcome" with the composer in the middle (ChatGPT-style). Once a
  // conversation starts, switch to the scrolling thread with the composer pinned to the bottom.
  if (!hasThread) {
    return (
      <div className="welcome-wrap">
        <div className="welcome">
          <Orb size={56} />
          <h2 className="welcome-title">What can I help you research?</h2>
          <p className="welcome-sub">Every medical claim is source-backed. Ask about a drug, dose, interaction, or monograph for a cited answer.</p>
          {composer}
          <div className="chip-row welcome-chips">
            {SUGGESTIONS.map((s) => (
              <button key={s.text} className="chip-action" onClick={() => submit(s.text)}>
                <Icon name={s.icon} size={14} />{s.text}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="thread">
        <div className="turn">
          <div className="msg-user"><div className="bubble">{lastQuestion}</div></div>
          <div className="msg-ai">
            <Orb size={28} busy={busy} bloom={bloom} className="" />
            <div className="ai-body">
              {busy ? <Thinking stage={stage} /> : answer ? <Answer answer={answer} onCite={onCite} /> : null}
              {error ? <p className="tmpl-note">{error}</p> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="composer-wrap">{composer}</div>
    </>
  );
}

interface ComposerProps {
  question: string;
  setQuestion: Dispatch<SetStateAction<string>>;
  taRef: RefObject<HTMLTextAreaElement | null>;
  autoGrow: () => void;
  submit: (q: string) => void;
  busy: boolean;
  mode: (typeof MODES)[number]["id"];
  setMode: Dispatch<SetStateAction<(typeof MODES)[number]["id"]>>;
  modeOpen: boolean;
  setModeOpen: Dispatch<SetStateAction<boolean>>;
  error: string | null;
}

// The input pill, shared between the centered welcome screen and the pinned bottom bar. A leading
// "+" (attachments) and a "mic" (voice) are shown as ChatGPT-style affordances but disabled until
// those features ship — same honest "coming soon" treatment as the non-live modes.
function Composer({ question, setQuestion, taRef, autoGrow, submit, busy, mode, setMode, modeOpen, setModeOpen, error }: ComposerProps) {
  const activeMode = MODES.find((m) => m.id === mode)!;
  return (
    <div className="composer">
      <div className="box">
        <textarea
          ref={taRef}
          rows={1}
          value={question}
          maxLength={500}
          aria-label="Ask a question about a drug, dose, interaction, or monograph"
          placeholder="Ask anything about a drug, dose, interaction, or monograph…"
          onChange={(e) => { setQuestion(e.target.value); autoGrow(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(question); } }}
        />
        <div className="tools">
          <button className="tool" type="button" title="Attach — coming soon" aria-label="Attach" disabled>
            <Icon name="plus" size={18} />
          </button>
          <div className="mode-wrap" style={{ position: "relative" }}>
            <button className="mode" onClick={() => setModeOpen((v) => !v)} type="button" aria-haspopup="menu" aria-expanded={modeOpen}>
              <Icon name="sparkle" size={14} />
              <b>{activeMode.label}</b>{activeMode.live ? " · live" : " · soon"}
            </button>
            {modeOpen ? (
              <div className="acct-menu" role="menu" style={{ bottom: "calc(100% + 6px)", top: "auto", left: 0, right: "auto", width: 230 }}>
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    disabled={!m.live}
                    onClick={() => { if (m.live) { setMode(m.id); setModeOpen(false); } }}
                    title={m.hint}
                  >
                    <Icon name={m.live ? (m.id === mode ? "check" : "sparkle") : "lock"} size={14} />
                    <span style={{ flex: 1 }}>{m.label}</span>
                    {!m.live ? <small style={{ color: "var(--text-3)" }}>Soon</small> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="spacer" />
          <button className="tool" type="button" title="Voice — coming soon" aria-label="Voice input" disabled>
            <Icon name="mic" size={18} />
          </button>
          <button className="send" title="Send" onClick={() => submit(question)} disabled={busy || !question.trim()}>
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
      {error ? <div className="err">{error}</div> : <div className="hint">⏎ to send · Shift+⏎ for a new line · answers are cited</div>}
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

function Answer({ answer, onCite }: { answer: AskResponse; onCite: (tag: string) => void }) {
  const citeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of answer.citations) m.set(normTag(c.chunk_tag), abbr(c.source_type));
    return m;
  }, [answer.citations]);

  const s = answer.answer_sections;
  const flags = (answer.safety_flags ?? []).filter((f) => f !== "no_sources_found");
  return (
    <div className="answer fade">
      <div className="grade-row">
        <span className="grade">{answer.evidence_grade.replace(/_/g, " ")}</span>
        {flags.map((f) => <span key={f} className="safety-flag">{f.replace(/_/g, " ")}</span>)}
      </div>
      {answer.plain_english_summary ? <p className="lead">{renderInline(answer.plain_english_summary)}</p> : <h4 style={{ marginTop: 10 }}>Answer</h4>}
      {answer.template ? <p className="tmpl-note">Conservative response ({answer.template.replace(/_/g, " ")}).</p> : null}

      <Section title="What we know" points={s.what_we_know} citeMap={citeMap} onCite={onCite} />
      <Section title="Safety" points={s.safety_notes} citeMap={citeMap} onCite={onCite} />
      <Section title="What we don't know" points={s.what_we_do_not_know} citeMap={citeMap} onCite={onCite} />

      {s.questions_to_ask?.length ? (
        <section>
          <h5>Questions to ask a clinician</h5>
          <ul>{s.questions_to_ask.map((q, i) => <li key={i}>{renderInline(q)}</li>)}</ul>
        </section>
      ) : null}

      <div className="msg-actions">
        <button className="icon-btn" title="Copy" aria-label="Copy answer" onClick={() => navigator.clipboard?.writeText(answer.plain_english_summary ?? "")}><Icon name="copy" size={15} /></button>
      </div>
    </div>
  );
}

function Section({ title, points, citeMap, onCite }: { title: string; points: Array<{ text: string; citation_ids?: string[] }>; citeMap: Map<string, string>; onCite: (tag: string) => void }) {
  if (!points?.length) return null;
  return (
    <section>
      <h5>{title}</h5>
      <ul>
        {points.map((p, i) => (
          <li key={i}>
            {renderInline(p.text)}{" "}
            {(p.citation_ids ?? []).map((id) => {
              const t = normTag(id);
              return (
                <button key={id} type="button" className="cite" onClick={() => onCite(t)} title="Show source" aria-label={`Show source ${t}`}>
                  {citeMap.get(t) ?? "REF"}&nbsp;{t}
                </button>
              );
            })}
          </li>
        ))}
      </ul>
    </section>
  );
}
