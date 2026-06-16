"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { AskResponse, ClaimSupport, ReportMode, ScienceStateSignal, ScopeQuestion } from "@pharmabro/shared";
import { scienceState } from "@pharmabro/shared";
import { askQuestion, createConversation, fetchConversationTurns, fetchResearchReport, fetchResearchRun, fetchUsage, saveResearchTurn, saveTurn, scopeResearch, startResearch, type AskQuotaError, type ResearchRunRow, type SavedResearchCard } from "@/lib/api";
import { normTag, supportQuoteFor } from "@/lib/cite";
import { renderInline } from "@/lib/inline-md";
import { phCapture } from "@/lib/posthog";
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
  { id: "deep", label: "Deep research", live: true, pro: true, hint: "A multi-step, fully cited report that documents its method (Pro)" },
  { id: "meta", label: "Meta-analysis", live: true, pro: true, hint: "Pools comparable studies into a computed estimate, when the evidence supports it (Pro)" },
  { id: "lab_draft", label: "Lab draft (beta)", live: true, pro: true, hint: "Study-design scaffold for a clinical or pharmacokinetic study — unvalidated draft, not a protocol (Pro, beta)" },
] as const;

const SUGGESTIONS = [
  { text: "What are the major warnings for semaglutide?", icon: "doc" as const },
  { text: "Metformin dosing when eGFR is 40?", icon: "calc" as const },
  { text: "Compare semaglutide and tirzepatide safety evidence", icon: "sparkle" as const },
  { text: "Is lisinopril safe with spironolactone?", icon: "search" as const },
];

const PROVIDER_ABBR: Record<string, string> = { openfda: "FDA", dailymed: "DM", pubmed: "PMID", pubmed_oa: "PMID", clinicaltrials: "NCT", faers: "FAERS", openalex: "OA" };
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
  const [chatLoadError, setChatLoadError] = useState<string | null>(null); // a failed reopen is shown, not swallowed
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
  // The verbatim source sentence backing the claim whose citation was just clicked, shown highlighted
  // in that source's evidence card. null = no claim-specific highlight (e.g. nothing cleared the bar).
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
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
    setActiveQuote(null);
    setActiveAnswer(null);
    // Clear the previous chat's turns and block sending until this one finishes loading — otherwise a
    // submit mid-load would compute the wrong ordinal (from the old turns) and the insert would
    // collide with this chat's existing rows (UNIQUE(conversation_id, ordinal)) and be lost.
    setTurns([]);
    setChatLoadError(null);
    setLoadingChat(true);
    let alive = true;
    void fetchConversationTurns(cParam)
      .then((saved) => { if (alive) setTurns(saved.map((s) => ({ q: s.q, a: s.a, err: null, research: s.research ? rehydrateResearchCard(s.research) : undefined }))); })
      .catch((e) => { if (alive) setChatLoadError(e instanceof Error ? e.message : "Could not load this chat."); })
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
  const persistResearchTurn = useCallback(async (idx: number, q: string, mode: ReportMode, result: { savedReportId: string | null; sources: number }) => {
    try {
      const convId = await ensureConversation(q);
      if (convId) await saveResearchTurn(convId, idx * 2, q, { mode, savedReportId: result.savedReportId, title: q, citationCount: result.sources });
    } catch { /* best-effort persistence */ }
  }, [ensureConversation]);

  // Turn slot `idx` into a running research card and kick off the run. `searchQ` may be enriched with
  // clarifying answers, while `displayQ` stays the readable original (shown on the card + saved).
  const launchResearch = useCallback(async (idx: number, displayQ: string, searchQ: string, runMode: ReportMode) => {
    setTurns((prev) => prev.map((t, i) => (i === idx ? { q: displayQ, a: null, err: null, research: { runId: "", mode: runMode, title: displayQ, error: null, proGate: false } } : t)));
    try {
      const runId = await startResearch(searchQ, runMode);
      setTurns((prev) => prev.map((t, i) => (i === idx && t.research ? { ...t, research: { ...t.research, runId } } : t)));
    } catch (e) {
      const proGate = isQuotaError(e) && Number(e.quota.limit) === 0;
      const msg = isQuotaError(e)
        ? (proGate
          ? `Deep research is a Pro feature — your ${e.quota.plan} plan doesn't include it yet.`
          : `Daily deep-research limit reached (${e.quota.used}/${e.quota.limit}) on ${e.quota.plan}.`)
        : (e instanceof Error ? e.message : "Could not start research.");
      setTurns((prev) => prev.map((t, i) => (i === idx && t.research ? { ...t, research: { ...t.research, error: msg, proGate } } : t)));
    }
  }, []);

  // A citation click pins the panel to ITS answer's sources (per-turn evidence) before opening +
  // scrolling. Takes the answer so an older turn's [n] tag resolves against that turn's citations,
  // not the latest answer's (whose tag N may be a different source). `quote` is the verbatim sentence
  // in that source supporting the specific claim clicked — derived from the click, not the tag, so the
  // same [n] cited by two claims highlights each claim's own supporting line.
  const onCite = useCallback((answer: AskResponse, tag: string, quote?: string) => {
    setActiveAnswer(answer);
    setActiveQuote(quote ?? null);
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
    setEvidence(<EvidencePanel citations={panelAnswer?.citations ?? []} activeTag={activeTag ?? undefined} activeQuote={activeQuote ?? undefined} />);
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
  }, [panelAnswer, latest?.q, activeTag, activeQuote, setEvidence, setTopbar]);

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
    phCapture("ask_submitted", { mode });
    // Deep research / structured review run INLINE in the thread: append a turn whose body is a
    // research-run card that streams live progress, then becomes a "Report ready" card linking to the
    // full report in the Reports library. It runs in the background (no global busy lock), so the user
    // can keep chatting while it works.
    if (mode === "deep" || mode === "meta" || mode === "lab_draft") {
      // Deep research documents its method (engine's structured_review); meta-analysis additionally
      // pools comparable studies into a computed estimate when the evidence supports it; lab_draft
      // produces a study-design scaffold (not a runnable protocol).
      const runMode: ReportMode = mode === "meta" ? "meta" : mode === "lab_draft" ? "lab_draft" : "structured_review";
      phCapture("research_started", { mode: runMode });
      const ridx = turns.length;
      // Show the turn immediately ("scoping…"), then either ask clarifying questions or run.
      setTurns((prev) => [...prev, { q: text, a: null, err: null, scoping: true }]);
      setQuestion("");
      if (taRef.current) taRef.current.style.height = "auto";
      const scope = await scopeResearch(text); // best-effort; degrades to no-clarification on any failure
      if (scope.needs_clarification) {
        setTurns((prev) => prev.map((t, i) => (i === ridx ? { q: text, a: null, err: null, scope: { question: text, runMode, questions: scope.questions } } : t)));
      } else {
        void launchResearch(ridx, text, text, runMode);
      }
      return;
    }
    setBusy(true);
    setBloom(false); // clear any prior flare so the next answer re-triggers it (and it can't stick across an "ask again")
    setActiveTag(null);
    setActiveQuote(null);
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
      phCapture("ask_answered", { mode, citations: res.citations.length, evidence_grade: res.evidence_grade, intent: res.intent });
      void fetchUsage().catch(() => {});
      void persistTurn(idx, text, res); // save the question + cited answer to chat history
    } catch (err) {
      const msg = isQuotaError(err)
        ? `Daily Ask limit reached (${err.quota.used}/${err.quota.limit}) on ${err.quota.plan}.`
        : err instanceof Error ? err.message : "Ask failed";
      setLast({ err: msg });
      if (isQuotaError(err)) phCapture("ask_blocked", { mode, reason: "quota", plan: err.quota.plan });
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
  // A failed reopen is surfaced (was silently swallowed → blank screen). The chat is still usable:
  // the composer renders below for a fresh question.
  if (chatLoadError && !hasThread) {
    return (
      <div className="welcome-wrap">
        <p className="muted" style={{ fontSize: 14, textAlign: "center" }}>
          Couldn’t open this chat.<br />
          <span style={{ color: "var(--text-3)", fontSize: 12 }}>{chatLoadError}</span><br />
          <button type="button" className="mode" style={{ marginTop: 12 }} onClick={() => router.push("/app/ask")}>Start a new chat</button>
        </p>
      </div>
    );
  }

  // Empty state: a centered "welcome" with the composer in the middle (ChatGPT-style). This ALSO
  // covers a reopened conversation that loaded zero saved turns — it keeps the composer (so you can
  // keep typing in this chat) and shows a note, instead of a dead-end. Once a conversation starts,
  // switch to the scrolling thread with the composer pinned to the bottom.
  if (!hasThread) {
    const reopenedEmpty = Boolean(cParam); // an old chat reopened with no saved messages
    return (
      <div className="welcome-wrap">
        <div className="welcome">
          <Orb size={56} />
          <h2 className="welcome-title">{reopenedEmpty ? "This chat has no saved messages" : "What can I help you research?"}</h2>
          <p className="welcome-sub">{reopenedEmpty
            ? "Its earlier turns didn’t save (a now-fixed bug). Ask below to continue in this chat, or start a new one."
            : "Every medical claim is source-backed. Ask about a drug, dose, interaction, or monograph for a cited answer."}</p>
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
                  {t.scoping ? (
                    <div className="thinking"><div className="think-row"><span className="shimmer">Scoping your question…</span></div></div>
                  ) : t.scope ? (
                    <ScopeTurn state={t.scope} onRun={(enriched) => void launchResearch(i, t.scope!.question, enriched, t.scope!.runMode)} />
                  ) : t.research ? (
                    <ResearchRunCard card={t.research} onComplete={(r) => void persistResearchTurn(i, t.q, t.research!.mode, r)} />
                  ) : t.a ? (
                    <Answer answer={t.a} onCite={onCite} />
                  ) : isLast && busy ? <Thinking stage={stage} /> : null}
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
  mode: ReportMode;
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

// A pending clarification turn: the scope step found the question ambiguous, so we collect answers
// (chips + free text) before starting the run.
interface ScopeTurnState {
  question: string;
  runMode: ReportMode;
  questions: ScopeQuestion[];
}

interface Turn {
  q: string;
  a: AskResponse | null;
  err: string | null;
  research?: ResearchCard; // present when this turn is a deep-research run instead of a chat answer
  scope?: ScopeTurnState;  // present while clarifying questions await answers
  scoping?: boolean;       // brief: the scope step is running before we know if clarification is needed
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

// The clarifying-question turn: shown when the scope step found the question ambiguous. Each question
// offers quick-pick chips (which fill the matching free-text box) plus a free-text answer. "Run with
// answers" folds the answers into the question; "Just run it" runs the original unchanged.
function ScopeTurn({ state, onRun }: { state: ScopeTurnState; onRun: (enrichedQuestion: string) => void }) {
  const [answers, setAnswers] = useState<string[]>(() => state.questions.map(() => ""));
  const [submitted, setSubmitted] = useState(false);
  const setAnswer = (i: number, v: string) => setAnswers((prev) => prev.map((a, j) => (j === i ? v : a)));

  const run = (withAnswers: boolean) => {
    if (submitted) return;
    setSubmitted(true);
    if (!withAnswers) { onRun(state.question); return; }
    const parts = state.questions
      .map((q, i) => ({ q: q.text, a: (answers[i] ?? "").trim() }))
      .filter((x) => x.a)
      .map((x) => `${x.q} ${x.a}`);
    onRun(parts.length ? `${state.question}\n\nFocus: ${parts.join("; ")}` : state.question);
  };

  return (
    <div className="scope-card">
      <div className="ai-block-label"><Icon name="sparkle" size={14} /> A couple of quick questions to focus this</div>
      {state.questions.map((q, i) => (
        <div key={i} className="scope-q">
          <div className="scope-q-text">{q.text}</div>
          {q.chips.length ? (
            <div className="chip-row">
              {q.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`chip-action${answers[i] === chip ? " active" : ""}`}
                  onClick={() => setAnswer(i, answers[i] === chip ? "" : chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}
          <input
            className="scope-input"
            value={answers[i] ?? ""}
            placeholder="or type your own…"
            aria-label={q.text}
            onChange={(e) => setAnswer(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(true); }}
          />
        </div>
      ))}
      <div className="scope-actions">
        <button className="chip-action" onClick={() => run(true)} disabled={submitted}><Icon name="send" size={14} />Run with answers</button>
        <button className="chip-action" onClick={() => run(false)} disabled={submitted}>Just run it</button>
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

  const modeLabel = card.mode === "meta" ? "Meta-analysis" : card.mode === "lab_draft" ? "Lab draft (beta)" : "Deep research";

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

// Honest, countable basis for the science-state chip (hover) — derived from the cited sources,
// never prose the model wrote.
function scienceBasis(s: ScienceStateSignal): string {
  const n = `${s.total} cited source${s.total === 1 ? "" : "s"}`;
  return s.state === "well_studied"
    ? `Includes ${s.syntheses} systematic review/meta-analysis among ${n}`
    : `Cited evidence is early-stage — ${s.earlyStage} early-phase trial/preprint of ${n}`;
}

function Answer({ answer, onCite }: { answer: AskResponse; onCite: (answer: AskResponse, tag: string, quote?: string) => void }) {
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
  // "Where the science stands" — deterministic, positive-only signal from the cited sources'
  // study-type metadata (well_studied / emerging, or nothing). Never an LLM guess.
  const science = scienceState(answer.citations);
  const cite = (tag: string, quote?: string) => onCite(answer, tag, quote); // bind every [n] click to THIS answer's sources + the clicked claim's supporting line
  return (
    <div className="answer fade">
      <div className="grade-row">
        <span className="grade">{answer.evidence_grade.replace(/_/g, " ")}</span>
        {science ? (
          <span className={`science-state ${science.state}`} title={scienceBasis(science)}>
            {science.state === "well_studied" ? "Well-studied" : "Emerging"}
          </span>
        ) : null}
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
  points: Array<{ text: string; citation_ids?: string[]; support?: ClaimSupport[] }>;
  citeMap: Map<string, string>;
  onCite: (tag: string, quote?: string) => void;
}

// Inline [n] citation chips trailing a point's text. `support` carries the verbatim source sentence(s)
// this point cited; clicking a chip passes that source's supporting line so the evidence card can
// highlight exactly what backs the claim.
function CiteChips({ ids, support, citeMap, onCite }: { ids?: string[]; support?: ClaimSupport[]; citeMap: Map<string, string>; onCite: (tag: string, quote?: string) => void }) {
  if (!ids?.length) return null;
  return (
    <>
      {" "}
      {ids.map((id) => {
        const t = normTag(id);
        return (
          <button key={id} type="button" className="cite" onClick={() => onCite(t, supportQuoteFor(support, t))} title="Show source" aria-label={`Show source ${t}`}>
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
        <p className="ai-para" key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} support={p.support} citeMap={citeMap} onCite={onCite} /></p>
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
        <p className="ai-para" key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} support={p.support} citeMap={citeMap} onCite={onCite} /></p>
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
        <p key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} support={p.support} citeMap={citeMap} onCite={onCite} /></p>
      ))}
    </div>
  );
}
