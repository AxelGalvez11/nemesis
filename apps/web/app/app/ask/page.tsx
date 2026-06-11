"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { AskResponse } from "@pharmabro/shared";
import { askQuestion, createConversation, fetchConversationTurns, fetchResearchReport, fetchResearchRun, fetchUsage, saveResearchTurn, saveTurn, startResearch, type AskQuotaError, type ResearchRunRow, type SavedResearchCard } from "@/lib/api";
import { normTag } from "@/lib/cite";
import { renderInline } from "@/lib/inline-md";
import { useAppChrome } from "@/components/AppShell";
import { EvidencePanel } from "@/components/EvidencePanel";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { ResearchProgress } from "@/components/ResearchProgress";

function isQuotaError(e: unknown): e is AskQuotaError {
  return e instanceof Error && "quota" in e;
}

// Honest pipeline stages (classify → retrieve → rerank → generate), animated while the request runs.
const STAGES = ["Reading the question", "Searching the evidence library", "Ranking the strongest sources", "Composing a cited answer"];

const MODES = [
  { id: "evidence", label: "Quick answer", live: true, pro: false, hint: "Cited answer from the library + live sources" },
  { id: "deep", label: "Deep research", live: true, pro: true, hint: "Multi-step, fully cited report (Pro)" },
  { id: "structured_review", label: "Structured review", live: true, pro: true, hint: "A deep report that documents its own method (Pro)" },
  { id: "meta", label: "Meta-analysis", live: false, pro: true, hint: "Computed pooled estimates — coming soon" },
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

export default function AskPageRoute() {
  // useSearchParams (for the ?c=<conversation> deep link) needs a Suspense boundary at build time.
  return (
    <Suspense fallback={null}>
      <AskPage />
    </Suspense>
  );
}

function AskPage() {
  const chrome = useAppChrome();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cParam = searchParams.get("c"); // the conversation to load, if the URL deep-links one
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingChat, setLoadingChat] = useState(false); // true while a saved chat's turns are loading
  const loadedConvRef = useRef<string | null>(null); // guards against reloading a chat we just created
  const creatingConvRef = useRef<Promise<string | null> | null>(null); // dedupes concurrent first-turn creates
  const [question, setQuestion] = useState("");
  // The full conversation: every question + its answer (or in-flight/errored state) stays on screen,
  // so a second prompt no longer wipes the first.
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [bloom, setBloom] = useState(false);
  const [stage, setStage] = useState(0);
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("evidence");
  const [modeOpen, setModeOpen] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // Which answer's sources the evidence panel shows. null = follow the latest answer. Clicking a
  // citation inside an OLDER turn pins the panel to THAT answer's sources, so a newer answer no
  // longer clobbers the evidence you were looking at (each turn keeps its own sources).
  const [activeAnswer, setActiveAnswer] = useState<AskResponse | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const latest = turns[turns.length - 1];
  // The most recent COMPLETED answer drives the evidence panel + topbar, so the panel doesn't blank
  // out while a follow-up question is still in flight.
  const lastAnswered = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t?.a) return t.a;
    }
    return null;
  }, [turns]);

  // Clicking an inline citation chip opens the evidence panel (respecting the desktop column vs the
  // ≤1100px drawer) and scrolls to / highlights the matching source card. openEvidence is a stable
  // command from the shell that always OPENS (never toggles closed). The double rAF defers the
  // scroll until after React applies the open state and the drawer's slide-in begins laying out.
  const { setEvidence, setTopbar, openEvidence, bumpChats } = chrome;

  // Load a saved chat when the URL targets one (?c=<id>); reset to a blank chat when it doesn't.
  // loadedConvRef stops us re-fetching a conversation we just created in this session.
  useEffect(() => {
    if (!cParam) { loadedConvRef.current = null; creatingConvRef.current = null; setConversationId(null); setTurns([]); return; }
    if (cParam === loadedConvRef.current) return;
    loadedConvRef.current = cParam;
    setConversationId(cParam);
    setActiveTag(null);
    setActiveAnswer(null);
    // Clear the previous chat's turns and block sending until this one finishes loading — otherwise a
    // submit mid-load would compute the wrong ordinal (from the old turns) and the insert would
    // collide with this chat's existing rows (UNIQUE(conversation_id, ordinal)) and be lost.
    setTurns([]);
    setLoadingChat(true);
    let alive = true;
    void fetchConversationTurns(cParam)
      .then((saved) => { if (alive) setTurns(saved.map((s) => ({ q: s.q, a: s.a, err: null, research: s.research ? rehydrateResearchCard(s.research) : undefined }))); })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingChat(false); });
    return () => { alive = false; };
  }, [cParam]);

  // Persist a completed turn — best-effort, so a save failure never breaks the chat. On the first
  // message it creates the conversation, points the URL at it (refresh / deep-link works), and tells
  // the rail to refresh so the new chat appears in history.
  // Create the conversation lazily on the first saved turn (deduped against a concurrent first submit,
  // e.g. a chat turn and a research turn racing), point the URL at it, and refresh the rail history.
  const ensureConversation = useCallback(async (q: string): Promise<string | null> => {
    if (conversationId) return conversationId;
    if (!creatingConvRef.current) creatingConvRef.current = createConversation(q).catch(() => null);
    const convId = await creatingConvRef.current;
    if (convId) {
      loadedConvRef.current = convId;
      setConversationId(convId);
      router.replace(`/app/ask?c=${convId}`);
      bumpChats();
    } else {
      // Create failed/returned null — clear the poisoned promise so the NEXT turn retries.
      creatingConvRef.current = null;
    }
    return convId;
  }, [conversationId, router, bumpChats]);

  // Persist a completed chat turn — best-effort, so a save failure never breaks the chat.
  const persistTurn = useCallback(async (idx: number, q: string, answer: AskResponse) => {
    try {
      const convId = await ensureConversation(q);
      if (convId) await saveTurn(convId, idx * 2, q, answer);
    } catch { /* best-effort persistence */ }
  }, [ensureConversation]);

  // Persist a completed deep-research turn so its "Report ready" card survives a reopen.
  const persistResearchTurn = useCallback(async (idx: number, q: string, mode: "standard" | "structured_review", result: { savedReportId: string | null; sources: number }) => {
    try {
      const convId = await ensureConversation(q);
      if (convId) await saveResearchTurn(convId, idx * 2, q, { mode, savedReportId: result.savedReportId, title: q, citationCount: result.sources });
    } catch { /* best-effort persistence */ }
  }, [ensureConversation]);

  // A citation click pins the panel to ITS answer's sources (per-turn evidence) before opening +
  // scrolling. Takes the answer so an older turn's [n] tag resolves against that turn's citations,
  // not the latest answer's (whose tag N may be a different source).
  const onCite = useCallback((answer: AskResponse, tag: string) => {
    setActiveAnswer(answer);
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
  // The panel shows the PINNED answer (a citation the user clicked) if set, else the latest answer.
  const panelAnswer = activeAnswer ?? lastAnswered;
  useEffect(() => {
    setEvidence(<EvidencePanel citations={panelAnswer?.citations ?? []} activeTag={activeTag ?? undefined} />);
    setTopbar(
      <div>
        <div className="thread-title">{latest?.q || "New question"}</div>
        <div className="thread-sub">{panelAnswer && panelAnswer.intent !== "smalltalk" ? `${panelAnswer.citations.length} sources · ${panelAnswer.evidence_grade.replace(/_/g, " ")}` : "live evidence · cited"}</div>
      </div>,
    );
    return () => {
      setEvidence(null);
      setTopbar(null);
    };
  }, [panelAnswer, latest?.q, activeTag, setEvidence, setTopbar]);

  // Thinking steps: a decelerating schedule that tracks the real pipeline (read the question fast,
  // then the slow library + live search, then ranking) and HOLDS on the final "composing" step until
  // the answer actually arrives — so it reads as honest progress, never a checklist that finishes
  // while the user is still waiting.
  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const at = [600, 1900, 4200]; // ms to reach steps 1, 2, 3 (3 = final step, held until the answer lands)
    const timers = at.map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [busy]);

  // One-shot "bloom" flare on the orb the moment the newest answer lands.
  useEffect(() => {
    if (!latest?.a) return;
    setBloom(true);
    const t = setTimeout(() => setBloom(false), 700);
    return () => clearTimeout(t);
  }, [latest?.a]);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

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
    if (!text || busy || loadingChat) return;
    // Deep research / structured review run INLINE in the thread: append a turn whose body is a
    // research-run card that streams live progress, then becomes a "Report ready" card linking to the
    // full report in the Reports library. It runs in the background (no global busy lock), so the user
    // can keep chatting while it works.
    if (mode === "deep" || mode === "structured_review") {
      const runMode: "standard" | "structured_review" = mode === "structured_review" ? "structured_review" : "standard";
      const ridx = turns.length;
      setTurns((prev) => [...prev, { q: text, a: null, err: null, research: { runId: "", mode: runMode, title: text, error: null, proGate: false } }]);
      setQuestion("");
      if (taRef.current) taRef.current.style.height = "auto";
      try {
        const runId = await startResearch(text, runMode);
        setTurns((prev) => prev.map((t, i) => (i === ridx && t.research ? { ...t, research: { ...t.research, runId } } : t)));
      } catch (e) {
        const proGate = isQuotaError(e) && Number(e.quota.limit) === 0;
        const msg = isQuotaError(e)
          ? (proGate
            ? `Deep research is a Pro feature — your ${e.quota.plan} plan doesn't include it yet.`
            : `Daily deep-research limit reached (${e.quota.used}/${e.quota.limit}) on ${e.quota.plan}.`)
          : (e instanceof Error ? e.message : "Could not start research.");
        setTurns((prev) => prev.map((t, i) => (i === ridx && t.research ? { ...t, research: { ...t.research, error: msg, proGate } } : t)));
      }
      return;
    }
    setBusy(true);
    setBloom(false); // clear any prior flare so the next answer re-triggers it (and it can't stick across an "ask again")
    setActiveTag(null);
    setActiveAnswer(null); // unpin: the panel follows the new answer until a citation is clicked
    const idx = turns.length; // the index this turn will occupy — patch THIS turn, not "the last" (robust if the busy-guard ever loosens)
    setTurns((prev) => [...prev, { q: text, a: null, err: null }]); // append; previous turns stay on screen
    setQuestion("");
    if (taRef.current) taRef.current.style.height = "auto";
    const setLast = (patch: Partial<Turn>) =>
      setTurns((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    try {
      const res = await askQuestion(text);
      setLast({ a: res });
      void fetchUsage().catch(() => {});
      void persistTurn(idx, text, res); // save the question + cited answer to chat history
    } catch (err) {
      const msg = isQuotaError(err)
        ? `Daily Ask limit reached (${err.quota.used}/${err.quota.limit}) on ${err.quota.plan}.`
        : err instanceof Error ? err.message : "Ask failed";
      setLast({ err: msg });
    } finally {
      setBusy(false);
    }
  }

  const hasThread = turns.length > 0;
  const composer = (
    <Composer
      question={question} setQuestion={setQuestion} taRef={taRef} autoGrow={autoGrow}
      submit={submit} busy={busy} mode={mode} setMode={setMode}
      modeOpen={modeOpen} setModeOpen={setModeOpen} error={latest?.err ?? null}
    />
  );

  // While a saved chat's turns are loading, show a quiet placeholder instead of the welcome screen
  // (suggestions flashing mid-load reads as a bug).
  if (loadingChat && !hasThread) {
    return <div className="welcome-wrap"><p className="muted" style={{ fontSize: 14 }}>Loading chat…</p></div>;
  }

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
        {turns.map((t, i) => {
          const isLast = i === turns.length - 1;
          return (
            <div className="turn" key={i}>
              <div className="msg-user"><div className="bubble">{t.q}</div></div>
              <div className="msg-ai">
                <Orb size={28} busy={isLast && busy} bloom={isLast && bloom} className="" />
                <div className="ai-body">
                  {t.research ? <ResearchRunCard card={t.research} onComplete={(r) => void persistResearchTurn(i, t.q, t.research!.mode, r)} /> : t.a ? <Answer answer={t.a} onCite={onCite} /> : isLast && busy ? <Thinking stage={stage} /> : null}
                  {t.err ? <p className="tmpl-note">{t.err}</p> : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="composer-wrap">{composer}</div>
    </>
  );
}

// A research-run turn: the body is a card that polls the run and becomes a "Report ready" link.
// runId is "" only for the brief moment between submit and startResearch resolving.
interface ResearchCard {
  runId: string;
  mode: "standard" | "structured_review";
  title: string;
  error: string | null;
  proGate: boolean;
  completed?: { savedReportId: string | null; sources: number }; // set when rehydrated from a saved chat
}

// A research card loaded from a saved chat is already complete — render the "Report ready" state
// directly (no live run to poll).
function rehydrateResearchCard(s: SavedResearchCard): ResearchCard {
  return { runId: "", mode: s.mode, title: s.title, error: null, proGate: false, completed: { savedReportId: s.savedReportId, sources: s.citationCount } };
}

interface Turn {
  q: string;
  a: AskResponse | null;
  err: string | null;
  research?: ResearchCard; // present when this turn is a deep-research run instead of a chat answer
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
              <b>{activeMode.label}</b>{activeMode.live ? (activeMode.pro ? " · Pro" : " · live") : " · soon"}
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
                    {!m.live ? <small style={{ color: "var(--text-3)" }}>Soon</small> : m.pro ? <small style={{ color: "var(--text-3)" }}>Pro</small> : null}
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
        {STAGES.map((label, i) => {
          // done = ✓, active = live spinner, upcoming = faded. The active step is the one the
          // pipeline is on right now, so it reads as honest in-progress work, not a finished list.
          const state = i < stage ? "done" : i === stage ? "active" : "";
          return (
            <div key={label} className={`qchip ${state}`.trimEnd()}>
              <span className="tick"><Icon name="check" size={10} /></span>
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The inline deep-research card. While the run is in flight it polls research_report_runs (RLS-scoped)
// and shows live progress; on completion it becomes a "Report ready" card linking to the full report
// in the Reports library. A start-time error (quota / Pro gate) is passed down on the card.
function ResearchRunCard({ card, onComplete }: { card: ResearchCard; onComplete?: (r: { savedReportId: string | null; sources: number }) => void }) {
  const [run, setRun] = useState<ResearchRunRow | null>(null);
  // Rehydrated (saved) cards start already-done; live runs reach done via polling.
  const [done, setDone] = useState<{ id: string | null; sources: number; title: string } | null>(
    card.completed ? { id: card.completed.savedReportId, sources: card.completed.sources, title: card.title } : null,
  );
  const [err, setErr] = useState<string | null>(card.error);
  // Hold the latest onComplete in a ref so it isn't a poll-effect dependency (which would restart polling).
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const firedRef = useRef(false);

  useEffect(() => { if (card.error) setErr(card.error); }, [card.error]);

  useEffect(() => {
    // A rehydrated (already complete) or errored card has no live run to poll.
    if (!card.runId || card.error || card.completed || done) return;
    let alive = true;
    let polls = 0;
    const MAX_POLLS = 200; // ~5 min at 1500ms — bounded so a stuck/killed run can't poll forever
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (++polls > MAX_POLLS) { setErr("This is taking longer than expected — check your Reports list in a bit."); return; }
      try {
        const row = await fetchResearchRun(card.runId);
        if (!alive) return;
        if (row) {
          setRun(row);
          if (row.status === "completed") {
            const rep = row.saved_report_id ? await fetchResearchReport(row.saved_report_id) : null;
            if (!alive) return;
            const sources = rep?.citations.length ?? 0;
            setDone({ id: row.saved_report_id, sources, title: rep?.question || card.title });
            // Persist exactly once so the card survives a reopen.
            if (!firedRef.current) { firedRef.current = true; onCompleteRef.current?.({ savedReportId: row.saved_report_id, sources }); }
            return;
          }
          if (row.status === "failed") { setErr(row.error || "Research could not be completed."); return; }
        }
      } catch { /* transient read error — keep polling */ }
      timer = setTimeout(tick, 1500);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [card.runId, card.error, card.completed, card.title, done]);

  const modeLabel = card.mode === "structured_review" ? "Structured review" : "Deep research";

  if (err) {
    return (
      <div className="research-run-card">
        <p className="tmpl-note">{err}</p>
        {card.proGate ? <Link href="/app/billing" className="chip-action"><Icon name="card" size={14} />See Pro plans</Link> : null}
      </div>
    );
  }
  if (done) {
    return (
      <Link href={done.id ? `/app/reports/${done.id}` : "/app/reports"} className="research-card" title={done.title}>
        <Icon name="doc" size={15} />
        <span className="research-card-title">Report ready: {done.title}</span>
        <small>{done.sources} sources · {modeLabel}</small>
      </Link>
    );
  }
  return (
    <div className="research-run-card">
      <div className="ai-block-label"><Icon name="sparkle" size={14} /> {modeLabel} running…</div>
      <ResearchProgress steps={run?.progress ?? []} done={false} />
    </div>
  );
}

function Answer({ answer, onCite }: { answer: AskResponse; onCite: (answer: AskResponse, tag: string) => void }) {
  const citeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of answer.citations) m.set(normTag(c.chunk_tag), abbr(c.source_type));
    return m;
  }, [answer.citations]);

  // Small-talk (a greeting / thanks / "what can you do") is a plain conversational reply — no
  // evidence grade, no sources, no clinical sections. Render just the friendly line.
  if (answer.intent === "smalltalk") {
    return <div className="answer fade"><p className="lead">{renderInline(answer.plain_english_summary)}</p></div>;
  }

  const s = answer.answer_sections;
  const flags = (answer.safety_flags ?? []).filter((f) => f !== "no_sources_found");
  const cite = (tag: string) => onCite(answer, tag); // bind every [n] click to THIS answer's sources
  return (
    <div className="answer fade">
      <div className="grade-row">
        <span className="grade">{answer.evidence_grade.replace(/_/g, " ")}</span>
        {flags.map((f) => <span key={f} className="safety-flag">{f.replace(/_/g, " ")}</span>)}
      </div>
      {answer.plain_english_summary ? <p className="lead">{renderInline(answer.plain_english_summary)}</p> : <h4 style={{ marginTop: 10 }}>Answer</h4>}
      {answer.template ? <p className="tmpl-note">Conservative response ({answer.template.replace(/_/g, " ")}).</p> : null}

      {/* Main explanation: flowing prose, no rigid "What we know" labeled-section scaffold. */}
      <Prose points={s.what_we_know} citeMap={citeMap} onCite={cite} />

      {/* Safety stays prominent — a clear bordered callout (conservative medical app), not a muted aside. */}
      <SafetyBlock points={s.safety_notes} citeMap={citeMap} onCite={cite} />

      {/* Uncertainty, de-emphasized. */}
      <UnclearBlock points={s.what_we_do_not_know} citeMap={citeMap} onCite={cite} />

      {s.questions_to_ask?.length ? (
        <div className="ai-questions">
          <div className="ai-block-label">Worth asking your clinician</div>
          <ul>{s.questions_to_ask.map((q, i) => <li key={i}>{renderInline(q)}</li>)}</ul>
        </div>
      ) : null}

      <div className="msg-actions">
        <button className="icon-btn" title="Copy" aria-label="Copy answer" onClick={() => navigator.clipboard?.writeText(answer.plain_english_summary ?? "")}><Icon name="copy" size={15} /></button>
      </div>
    </div>
  );
}

interface PointBlockProps {
  points: Array<{ text: string; citation_ids?: string[] }>;
  citeMap: Map<string, string>;
  onCite: (tag: string) => void;
}

// Inline [n] citation chips trailing a point's text.
function CiteChips({ ids, citeMap, onCite }: { ids?: string[]; citeMap: Map<string, string>; onCite: (tag: string) => void }) {
  if (!ids?.length) return null;
  return (
    <>
      {" "}
      {ids.map((id) => {
        const t = normTag(id);
        return (
          <button key={id} type="button" className="cite" onClick={() => onCite(t)} title="Show source" aria-label={`Show source ${t}`}>
            {citeMap.get(t) ?? "REF"}&nbsp;{t}
          </button>
        );
      })}
    </>
  );
}

// The answer body: each point a flowing paragraph (no section heading, no bullets) so the answer
// reads like an explanation, not a filled-in form.
function Prose({ points, citeMap, onCite }: PointBlockProps) {
  if (!points?.length) return null;
  return (
    <>
      {points.map((p, i) => (
        <p className="ai-para" key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} citeMap={citeMap} onCite={onCite} /></p>
      ))}
    </>
  );
}

// Safety: kept visibly prominent (conservative medical app) as a bordered callout — never muted.
function SafetyBlock({ points, citeMap, onCite }: PointBlockProps) {
  if (!points?.length) return null;
  return (
    <div className="ai-safety">
      <div className="ai-safety-label"><Icon name="shield" size={14} />Safety</div>
      {points.map((p, i) => (
        <p className="ai-para" key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} citeMap={citeMap} onCite={onCite} /></p>
      ))}
    </div>
  );
}

// What's still unclear: de-emphasized (small muted label + muted text).
function UnclearBlock({ points, citeMap, onCite }: PointBlockProps) {
  if (!points?.length) return null;
  return (
    <div className="ai-unclear">
      <div className="muted-label">Still uncertain</div>
      {points.map((p, i) => (
        <p key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} citeMap={citeMap} onCite={onCite} /></p>
      ))}
    </div>
  );
}
