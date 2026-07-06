"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { AskMode, AskResponse, Citation, ClaimSupport, ReportMode, ResearchProgressStep, ScienceStateSignal, ScopeQuestion } from "@pharmabro/shared";
import { autoDepth, meterForPoint, scienceState } from "@pharmabro/shared";
import { deliverablesOnCommandEnabled, simplifiedModesEnabled } from "@/lib/env";
import { detectDeliverableIntent, type DeliverableFormat } from "@/lib/deliverable-intent";
import { askQuestion, createConversation, downloadReportExport, fetchConversationTurns, fetchProject, fetchResearchReport, fetchResearchRun, planResearchPreview, saveResearchTurn, saveTurn, scopeResearch, startResearch, type AskQuotaError, type ResearchRunRow, type SavedResearchCard } from "@/lib/api";
import { normTag, supportQuoteFor } from "@/lib/cite";
import { renderInline } from "@/lib/inline-md";
import { countWords, newRevealCtx, revealDelay, wrapWords, REVEAL_BASE, REVEAL_STEP, type RevealCtx } from "@/lib/reveal-text";
import { pubchemMoleculeUrl } from "@/lib/molecule";
import { phCapture } from "@/lib/posthog";
import { POINT_OF_USE_DISCLAIMER } from "@/lib/legal";
import { buildThinkingPreview } from "@/lib/thinking-preview";
import { citationDomains, faviconUrl, hostnameOf, SEARCH_DOMAINS } from "@/lib/favicon";
import { composerModeLabel } from "@/lib/ask-mode-label";
import { getCached, setCached } from "@/lib/cache";
import { ASK_EXAMPLE_PROMPTS, askPlaceholderFor } from "@/lib/ask-examples";
import { useAppChrome } from "@/components/AppShell";
import { EvidencePanel } from "@/components/EvidencePanel";
import { Icon } from "@/components/icons";
import { AgentRunDock } from "@/components/AgentRunDock";
import { WorkPanel } from "@/components/WorkPanel";
import { DomainChips } from "@/components/DomainChips";
import { MissionSheet } from "@/components/MissionSheet";
import { ResearchProgress } from "@/components/ResearchProgress";
import { WatchButton } from "@/components/WatchButton";

function isQuotaError(e: unknown): e is AskQuotaError {
  return e instanceof Error && "quota" in e;
}

// Two composer surfaces (the ChatGPT split): the RIGHT dial is the answer-depth dial (auto/fast/
// thorough — single cited answers on the /ask engine, free); the LEFT "+" launcher holds the TOOLS
// (deep research / discovery — multi-step Pro report runs on the research endpoint). A tool is still
// a `mode` under the hood so submit() routing is unchanged; it just isn't offered in the depth dial.
// "Meta-analysis" is no longer a separate user-facing tool: Deep research runs the meta pipeline,
// which ALWAYS produces the full structured review and ADDS a computed pooled estimate only when the
// studies are genuinely comparable (engine degrades to an honest "no pooled estimate" note otherwise).
const MODES = [
  { id: "auto", label: "Auto", live: true, pro: false, hint: "Picks the right depth for your question automatically" },
  { id: "fast", label: "Fast", live: true, pro: false, hint: "Quick, plain-English answer — cited from the library + live sources" },
  { id: "thorough", label: "Thorough", live: true, pro: false, hint: "Thinks longer: a wider source pull and a fuller, more technical answer" },
  { id: "deep", label: "Deep research", live: true, pro: true, hint: "A multi-step, fully cited report — pools comparable studies into a computed estimate when the evidence supports it (Pro)" },
  { id: "structured_review", label: "Systematic review", live: true, pro: true, hint: "A documented-method evidence review: what was searched, what was included, and cited findings in tables (Pro)" },
  { id: "discovery", label: "Discovery", live: true, pro: true, hint: "Finds research gaps, claim cards, hypotheses, and next-study designs (Pro)" },
  { id: "lab_draft", label: "Lab draft (beta)", live: true, pro: true, hint: "Study-design scaffold for a clinical or pharmacokinetic study — unvalidated draft, not a protocol (Pro, beta)" },
] as const;

// Where the dial rests when no tool is armed — and what an armed tool resets to after its run
// launches (tools are single-shot, the ChatGPT behavior; see submit()).
const DEFAULT_DEPTH: (typeof MODES)[number]["id"] = simplifiedModesEnabled ? "auto" : "fast";

const MIN_THINKING_PREVIEW_MS = 650;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PROVIDER_ABBR: Record<string, string> = { openfda: "FDA", dailymed: "DM", pubmed: "PMID", pubmed_oa: "PMID", clinicaltrials: "NCT", faers: "FAERS", openalex: "OA" };
function abbr(t: string): string {
  const k = Object.keys(PROVIDER_ABBR).find((p) => t.toLowerCase().includes(p));
  return (k ? PROVIDER_ABBR[k] : undefined) ?? "REF";
}
// Friendly source name for the inline citation pill (favicon + name, ChatGPT-style) — the terse
// abbr() codes stay for the hover-preview label where space is tight.
const PROVIDER_PILL: Record<string, string> = { openfda: "FDA", dailymed: "DailyMed", pubmed: "PubMed", europepmc: "PubMed", clinicaltrials: "ClinicalTrials", faers: "FAERS", openalex: "OpenAlex", medlineplus: "MedlinePlus" };
function pillName(t: string): string {
  const k = Object.keys(PROVIDER_PILL).find((p) => t.toLowerCase().includes(p));
  return (k ? PROVIDER_PILL[k] : undefined) ?? "Source";
}

// ── Dictation (Web Speech API) ────────────────────────────────────────────────────────────────────
// SpeechRecognition isn't in the TS DOM lib, so we declare the minimal surface we use. No `any`.
interface SpeechRecognitionAlternativeLike { readonly transcript: string; }
interface SpeechRecognitionResultLike { readonly isFinal: boolean; readonly length: number; readonly [index: number]: SpeechRecognitionAlternativeLike; }
interface SpeechRecognitionResultListLike { readonly length: number; readonly [index: number]: SpeechRecognitionResultLike; }
interface SpeechRecognitionEventLike { readonly resultIndex: number; readonly results: SpeechRecognitionResultListLike; }
interface SpeechRecognitionErrorEventLike { readonly error: string; }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Dictation hook: feature-detected on the client (init `false` so SSR and first client render agree —
// no hydration mismatch). `toggle` starts/stops recognition; finals accumulate onto the text present
// when recording began (`getBaseText`), and the live interim is shown appended. Permission errors
// surface as an honest note. The recognizer is aborted on unmount.
function useDictation(setQuestion: Dispatch<SetStateAction<string>>, getBaseText: () => string) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");     // textarea text captured when recording started
  const finalsRef = useRef("");   // finalized transcript accumulated this session

  useEffect(() => { setSupported(getSpeechRecognitionCtor() !== null); }, []);

  useEffect(() => () => { recRef.current?.abort(); }, []); // stop cleanly if we unmount mid-dictation

  const toggle = useCallback(() => {
    if (listening) { recRef.current?.stop(); return; }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) { setError("Dictation isn’t supported in this browser."); return; }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = getBaseText();
    finalsRef.current = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue; // noUncheckedIndexedAccess: index access on the results list is optional
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) finalsRef.current += text;
        else interim += text;
      }
      const base = baseRef.current;
      const joiner = base && !/\s$/.test(base) ? " " : "";
      setQuestion(`${base}${joiner}${finalsRef.current}${interim}`.trimStart());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access is blocked — allow it in your browser to dictate.");
      } else if (e.error === "no-speech") {
        setError(null); // benign: user just didn't speak
      } else {
        setError("Dictation stopped unexpectedly. Try again.");
      }
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    recRef.current = rec;
    setError(null);
    try { rec.start(); setListening(true); }
    catch { setError("Couldn’t start dictation. Try again."); setListening(false); recRef.current = null; }
  }, [listening, setQuestion, getBaseText]);

  return { supported, listening, error, toggle };
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
  const qParam = searchParams.get("q"); // a pre-filled question (e.g. the "See current evidence" link on a watch)
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadingChat, setLoadingChat] = useState(false); // true while a saved chat's turns are loading
  const [chatLoadError, setChatLoadError] = useState<string | null>(null); // a failed reopen is shown, not swallowed
  const loadedConvRef = useRef<string | null>(null); // guards against reloading a chat we just created
  const creatingConvRef = useRef<Promise<string | null> | null>(null); // dedupes concurrent first-turn creates
  const [question, setQuestion] = useState("");
  // Project context (ChatGPT-Projects): a chat started from a project workspace carries its projectId
  // (so the new conversation is filed into it) and the project's user-set instructions (prepended to
  // the OUTGOING question for plain Ask calls only — never shown in the transcript, never to autoDepth,
  // never to saved history, and never to report runs). Read once from the session cache on mount.
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [projectInstructions, setProjectInstructions] = useState<string>("");
  const appliedProjectRef = useRef(false); // one-shot guard for the project→Ask cache handoff below
  // The full conversation: every question + its answer (or in-flight/errored state) stays on screen,
  // so a second prompt no longer wipes the first.
  const [turns, setTurns] = useState<Turn[]>([]);
  // Live progress for the currently-active research run, lifted up from ResearchRunCard so the pinned
  // AgentRunDock (docked above the composer) can mirror it. Null when no run is active — the card
  // reports its `run.progress` here on each poll and clears it (null) on completion/failure/unmount.
  const [activeRunProgress, setActiveRunProgress] = useState<ResearchProgressStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [showThinking, setShowThinking] = useState(false);
  const [revealIdx, setRevealIdx] = useState<number | null>(null); // the turn whose answer should type itself in (only the just-arrived one — never reopened/saved turns)
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>(DEFAULT_DEPTH);
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
  // Slides skill: `slidesArmedRef` is set when the user clicks Skills → Slides but hasn't sent yet.
  // On the next submit we consume it and, for a research run, record THAT turn's index in
  // `exportIntentRef` so the completed report auto-exports to the matching file. Keyed by index (not
  // a single boolean) so two concurrent runs — the research branch never sets `busy` — don't cross
  // wires. Maps a turn index to the export format to run when that turn's report completes: "pptx"
  // from the Skills → Slides menu action (unchanged), or "pptx"/"docx" from a typed deliverable
  // request detected by lib/deliverable-intent.ts when NEXT_PUBLIC_DELIVERABLES_ON_COMMAND is on.
  const slidesArmedRef = useRef(false);
  const exportIntentRef = useRef<Map<number, "pptx" | "docx">>(new Map());

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
  const { setEvidence, setTopbar, openEvidence, bumpChats, bumpUsage } = chrome;

  // Sidebar "New chat" pressed (chrome.newChatNonce bumps on every click). router.push("/app/ask")
  // alone is a NO-OP when the current chat is unsaved — the URL is already bare /app/ask, so no
  // navigation happens, cParam never changes, and the old thread stayed on screen (the reported
  // "New chat button doesn't work"). The nonce makes the reset unconditional. Mid-request state is
  // safe: an in-flight answer's setLast patch maps over the now-empty turns array (a no-op).
  const seenNonceRef = useRef(chrome.newChatNonce);
  useEffect(() => {
    if (chrome.newChatNonce === seenNonceRef.current) return; // initial mount — nothing was clicked
    seenNonceRef.current = chrome.newChatNonce;
    loadedConvRef.current = null; creatingConvRef.current = null;
    setConversationId(null); setTurns([]); setQuestion("");
    setActiveTag(null); setActiveQuote(null); setActiveAnswer(null);
    setRevealIdx(null); setChatLoadError(null); setLoadingChat(false);
    appliedProjectRef.current = false;
    setProjectId(null); setProjectName(""); setProjectInstructions("");
    if (taRef.current) taRef.current.style.height = "auto";
  }, [chrome.newChatNonce]);

  // Load a saved chat when the URL targets one (?c=<id>); reset to a blank chat when it doesn't.
  // loadedConvRef stops us re-fetching a conversation we just created in this session.
  useEffect(() => {
    if (!cParam) {
      loadedConvRef.current = null; creatingConvRef.current = null; setConversationId(null); setTurns([]);
      // A bare "new chat" (router.push("/app/ask") from the sidebar, a saved chat, or elsewhere) must not
      // inherit the previous mount's project context — AskPage doesn't remount on a query-only navigation,
      // so without this, an unrelated next message would still be filed into the old project. If this
      // navigation IS a fresh project→Ask handoff, the prefill effect below (same commit, declared after)
      // re-populates projectId/instructions from the cache right after this clears it.
      appliedProjectRef.current = false;
      setProjectId(null); setProjectName(""); setProjectInstructions("");
      return;
    }
    // cParam === loadedConvRef.current means this is OUR OWN just-created/just-loaded conversation
    // (e.g. ensureConversation's router.replace after the first send) — keep the project context so a
    // multi-turn project chat still carries instructions into turn 2+. Only a change to a genuinely
    // DIFFERENT chat (switching in the sidebar) should drop the previous chat's project context; a
    // reopened chat that WAS filed into a project won't re-show its chip (the one-shot cache seed is
    // long consumed by then) — a known, out-of-scope limitation; it's still correctly filed server-side
    // via its stored project_id.
    if (cParam === loadedConvRef.current) return;
    appliedProjectRef.current = false;
    setProjectId(null); setProjectName(""); setProjectInstructions("");
    loadedConvRef.current = cParam;
    setConversationId(cParam);
    setActiveTag(null);
    setActiveQuote(null);
    setActiveAnswer(null);
    // Clear the previous chat's turns and block sending until this one finishes loading — otherwise a
    // submit mid-load would compute the wrong ordinal (from the old turns) and the insert would
    // collide with this chat's existing rows (UNIQUE(conversation_id, ordinal)) and be lost.
    setTurns([]);
    setRevealIdx(null); // loaded turns render instantly — only a freshly-asked turn types itself in
    setChatLoadError(null);
    setLoadingChat(true);
    let alive = true;
    void fetchConversationTurns(cParam)
      .then((saved) => { if (alive) setTurns(saved.map((s) => ({ q: s.q, a: s.a, err: null, research: s.research ? rehydrateResearchCard(s.research) : undefined }))); })
      .catch((e) => { if (alive) setChatLoadError(e instanceof Error ? e.message : "Could not load this chat."); })
      .finally(() => { if (alive) setLoadingChat(false); });
    return () => { alive = false; };
  }, [cParam]);

  // Pre-fill the composer from ?q= (the "See current evidence" link on a watch). We ONLY fill the box —
  // never auto-submit; the user reviews and presses send (so it counts as a normal, user-initiated ask).
  // Applied once per arrival, then ?q= is stripped from the URL (keeping ?c= if present) so a later edit
  // isn't clobbered on a re-render or refresh. Coexists with the ?c= loader above: filling the input is
  // independent of loading a saved chat's turns.
  const appliedQRef = useRef(false);
  useEffect(() => {
    const q = (qParam ?? "").trim();
    if (!q || appliedQRef.current) return;
    appliedQRef.current = true;
    setQuestion(qParam ?? "");
    router.replace(cParam ? `/app/ask?c=${cParam}` : "/app/ask");
  }, [qParam, cParam, router]);

  // Consume a project→Ask handoff written by the project workspace ("New chat in {name}"). Prefill the
  // box (never auto-submit — same as ?q=), remember the project so the new chat is filed into it, and
  // load the project to get its display name + instructions. Applied once, then the cache key is cleared
  // so a later unrelated new chat isn't wrongly tagged to the project. (appliedProjectRef is declared
  // with the other state above so the ?c=-reset effect can clear it too — see that effect's comment.)
  useEffect(() => {
    if (appliedProjectRef.current || cParam) return; // only on a fresh (no ?c=) chat
    const seed = getCached<{ projectId: string; question: string }>("ask-project-prefill");
    if (!seed || !seed.projectId) return;
    appliedProjectRef.current = true;
    setCached("ask-project-prefill", undefined); // consume it (one-shot)
    setProjectId(seed.projectId);
    if (seed.question) setQuestion(seed.question);
    let alive = true; // guards against a stale response landing after the user navigates away mid-fetch
    void fetchProject(seed.projectId).then((p) => {
      if (alive && p) { setProjectName(p.name); setProjectInstructions(p.instructions ?? ""); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [cParam]);

  // Persist a completed turn — best-effort, so a save failure never breaks the chat. On the first
  // message it creates the conversation, points the URL at it (refresh / deep-link works), and tells
  // the rail to refresh so the new chat appears in history.
  // Create the conversation lazily on the first saved turn (deduped against a concurrent first submit,
  // e.g. a chat turn and a research turn racing), point the URL at it, and refresh the rail history.
  const ensureConversation = useCallback(async (q: string): Promise<string | null> => {
    if (conversationId) return conversationId;
    if (!creatingConvRef.current) creatingConvRef.current = createConversation(q, projectId).catch(() => null);
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
  }, [conversationId, router, bumpChats, projectId]);

  // Persist a completed chat turn — best-effort, so a save failure never breaks the chat.
  const persistTurn = useCallback(async (idx: number, q: string, answer: AskResponse) => {
    try {
      const convId = await ensureConversation(q);
      if (convId) await saveTurn(convId, idx * 2, q, answer);
    } catch (e) { console.error("chat persist failed (best-effort):", e); }
  }, [ensureConversation]);

  // Persist a completed deep-research turn so its "Report ready" card survives a reopen.
  const persistResearchTurn = useCallback(async (idx: number, q: string, mode: ReportMode, result: { savedReportId: string | null; sources: number }) => {
    try {
      const convId = await ensureConversation(q);
      if (convId) await saveResearchTurn(convId, idx * 2, q, { mode, savedReportId: result.savedReportId, title: q, citationCount: result.sources });
    } catch (e) { console.error("research persist failed (best-effort):", e); }
  }, [ensureConversation]);

  // Turn slot `idx` into a running research card and kick off the run. `searchQ` may be enriched with
  // clarifying answers, while `displayQ` stays the readable original (shown on the card + saved).
  // `bubbleQ` is what the chat bubble shows — normally identical to `displayQ`, but for a detected
  // deliverable command it's the user's own typed words ("make me slides on statin safety") while
  // `displayQ`/searchQ carry just the stripped topic ("statin safety") that the report is titled and
  // searched from. `deliverableLabel`/`deliverableNote` (when set) flow onto the run card so a
  // deliverable request stays honestly visible while the report builds — see ResearchRunCard.
  const launchResearch = useCallback(async (
    idx: number, displayQ: string, searchQ: string, runMode: ReportMode, subQuestions?: string[],
    deliverableLabel?: DeliverableFormat, deliverableNote?: string, bubbleQ?: string,
  ) => {
    setTurns((prev) => prev.map((t, i) => (i === idx ? {
      q: bubbleQ ?? displayQ, a: null, err: null,
      research: { runId: "", mode: runMode, title: displayQ, error: null, proGate: false, deliverableLabel, deliverableNote },
    } : t)));
    try {
      const runId = await startResearch(searchQ, runMode, subQuestions);
      setTurns((prev) => prev.map((t, i) => (i === idx && t.research ? { ...t, research: { ...t.research, runId } } : t)));
    } catch (e) {
      const proGate = isQuotaError(e) && Number(e.quota.limit) === 0;
      const feature = runMode === "discovery" ? "Discovery" : runMode === "lab_draft" ? "Lab draft" : runMode === "structured_review" ? "Systematic review" : "Deep research";
      const msg = isQuotaError(e)
        ? (proGate
          ? `${feature} is a Pro feature — your ${e.quota.plan} plan doesn't include it yet.`
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
  // While a research run is LIVE the right dock shows the "watch the evidence assemble" WorkPanel;
  // when it ends (progress back to null) the dock reverts to the normal per-answer EvidencePanel.
  // `runActive` re-derives on every poll (activeRunProgress gets a fresh array each tick), which is
  // exactly what keeps the WorkPanel's timeline + source count live via the injection effect below.
  const runActive = Boolean(activeRunProgress && activeRunProgress.length);
  useEffect(() => {
    setEvidence(
      runActive
        ? <WorkPanel progress={activeRunProgress!} question={latest?.q} />
        : <EvidencePanel citations={panelAnswer?.citations ?? []} reviewed={panelAnswer?.reviewed_sources} activeTag={activeTag ?? undefined} activeQuote={activeQuote ?? undefined} />,
    );
    setTopbar(
      <div>
        <div className="thread-title">{latest?.q || "New question"}</div>
        {panelAnswer && panelAnswer.intent !== "smalltalk" ? (
          <div className="thread-sub">{panelAnswer.citations.length + (panelAnswer.reviewed_sources?.length ?? 0)} sources · {panelAnswer.evidence_grade.replace(/_/g, " ")}</div>
        ) : null}
      </div>,
    );
    return () => {
      setEvidence(null);
      setTopbar(null);
    };
  }, [runActive, activeRunProgress, panelAnswer, latest?.q, activeTag, activeQuote, setEvidence, setTopbar]);

  // Open the right dock ONCE when a run starts (the null→live rising edge), so the WorkPanel is
  // visible. Depending on the BOOLEAN `runActive` (not the poll-updated array) means this effect
  // does NOT re-fire on each poll — so a user who re-collapses the dock stays collapsed. openEvidence
  // is a stable useCallback that only ever un-collapses; setEvidence never touches the collapsed state.
  useEffect(() => {
    if (runActive) openEvidence();
  }, [runActive, openEvidence]);

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

  useEffect(() => {
    if (!busy) { setShowThinking(false); return; }
    setShowThinking(true);
  }, [busy]);

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
    // Consume the Slides arm on every submit (so it can't go stale across sends). Only a research run
    // records it below; a plain ask clears it and moves on.
    const wantSlides = slidesArmedRef.current;
    slidesArmedRef.current = false;
    // Deliverable-on-command (flag-gated, off by default — see lib/env.ts): when on, a pure grammar
    // check looks for a COMMAND to produce a named artifact ("make me slides on X", "write a document
    // about Y", "make a poster on Z") in the raw typed text. `deliverable` stays null unless the flag
    // is on AND the detector actually fires, so every read of `deliverable?.` below collapses to the
    // exact flag-off code path — nothing new runs when the flag is off. Detection never touches `mode`
    // (setMode is async and wouldn't take effect until the NEXT submit — see comment on `runMode`
    // below), so it must drive this call directly rather than routing through armSlides()/setMode().
    const deliverable = deliverablesOnCommandEnabled ? detectDeliverableIntent(text) : null;
    const isDeliverableCommand = Boolean(deliverable?.isDeliverable);
    phCapture("ask_submitted", isDeliverableCommand ? { mode, deliverable: deliverable!.format } : { mode });
    // Deep research / structured review run INLINE in the thread: append a turn whose body is a
    // research-run card that streams live progress, then becomes a "Report ready" card linking to the
    // full report in the Reports library. It runs in the background (no global busy lock), so the user
    // can keep chatting while it works. A detected deliverable command ALSO enters this branch (it
    // always wants a deep-research report to export from), even if the composer dial is sitting on a
    // plain ask mode — this is the "type it, don't click a menu" path the owner asked for.
    if (isDeliverableCommand || mode === "deep" || mode === "structured_review" || mode === "discovery" || mode === "lab_draft") {
      // Deep research runs the engine's "meta" pipeline: the full structured review (documented
      // method, cited sections) PLUS a code-computed pooled estimate when the studies are genuinely
      // comparable — and an honest "no pooled estimate could be computed" note when they aren't
      // (meta-prose.ts degrades gracefully; parsePico → null skips pooling entirely). One tool, not
      // two: the old separate "Meta-analysis" mode is folded in. Discovery adds claim cards, gap
      // analysis, hypotheses, and a next-study design; lab_draft produces a study-design scaffold
      // (not a runnable protocol). A detected deliverable always runs the "meta" (Deep research)
      // pipeline — slides/documents/posters are built FROM a deep-research report, not a lighter mode.
      const runMode: ReportMode = isDeliverableCommand ? "meta"
        : mode === "lab_draft" ? "lab_draft" : mode === "discovery" ? "discovery" : mode === "structured_review" ? "structured_review" : "meta";
      phCapture("research_started", { mode: runMode });
      const ridx = turns.length;
      // SLIDES is fully wired (existing armSlides path, unchanged). DOCUMENT reuses the existing docx
      // export route (also fully wired — apps/web/app/api/reports/[id]/export/docx already exists).
      // POSTER has no export today (ResearchPoster is dev-preview only, no live route) — it honestly
      // falls back to a normal deep-research report; see the "coming soon" note added to that turn.
      if (wantSlides) exportIntentRef.current.set(ridx, "pptx");
      else if (isDeliverableCommand && deliverable!.format === "slides") exportIntentRef.current.set(ridx, "pptx");
      else if (isDeliverableCommand && deliverable!.format === "document") exportIntentRef.current.set(ridx, "docx");
      // The report itself is scoped/searched/titled from the stripped `topic` ("statin safety", not
      // "make me slides on statin safety") so it reads like a normal research report, not an echo of
      // the command. The user's own typed words stay the DISPLAY text (`displayText`) passed to
      // launchResearch below, so the chat bubble always shows exactly what they typed.
      const searchText = isDeliverableCommand ? deliverable!.topic : text;
      const displayText = text;
      const posterFallback = isDeliverableCommand && deliverable!.format === "poster";
      // Honest surfacing: while scoping/running, this turn's research card shows what's actually
      // happening ("Building your slides on statin safety…"), not a silent reinterpretation. See
      // deliverableLabel/deliverableNote on Turn/ResearchCard and their render in ResearchRunCard.
      const deliverableLabel: DeliverableFormat | undefined = isDeliverableCommand ? (deliverable!.format ?? undefined) : undefined;
      const deliverableNote = posterFallback
        ? `Poster export isn't built yet — building a deep-research report on "${searchText}" instead.`
        : undefined;
      // Show the turn immediately ("scoping…"), then either ask clarifying questions or run.
      setTurns((prev) => [...prev, { q: displayText, a: null, err: null, scoping: true, deliverableLabel, deliverableNote }]);
      setQuestion("");
      if (taRef.current) taRef.current.style.height = "auto";
      // Tools are SINGLE-SHOT (the ChatGPT behavior): this run is launched, so the composer returns
      // to a normal ask — a follow-up question won't silently burn another Pro report run.
      setMode(DEFAULT_DEPTH);
      // Scope (clarifying questions) and the pre-run plan (editable sub-questions) are independent,
      // best-effort steps — fetch both in parallel so the "scoping…" wait isn't doubled.
      const [scope, plan] = await Promise.all([scopeResearch(searchText), planResearchPreview(searchText, runMode)]);
      if (scope.needs_clarification || plan.length) {
        // A fresh object (NOT `{ ...t, ... }`) — `t` at this index is still the `scoping: true`
        // placeholder pushed above, and the render ternary checks `t.scoping` before `t.scope`, so
        // carrying `scoping: true` forward here would leave the turn stuck on the "Scoping…" shimmer
        // forever instead of showing the clarifying-questions/plan UI. Matches the pre-existing pattern.
        setTurns((prev) => prev.map((t, i) => (i === ridx ? { q: displayText, a: null, err: null, scope: { question: searchText, runMode, questions: scope.questions, plan, deliverableLabel, deliverableNote, bubbleQ: displayText } } : t)));
      } else {
        void launchResearch(ridx, searchText, searchText, runMode, undefined, deliverableLabel, deliverableNote, displayText);
      }
      return;
    }
    setBusy(true);
    setShowThinking(true);
    setActiveTag(null);
    setActiveQuote(null);
    setActiveAnswer(null); // unpin: the panel follows the new answer until a citation is clicked
    const idx = turns.length; // the index this turn will occupy — patch THIS turn, not "the last" (robust if the busy-guard ever loosens)
    setTurns((prev) => [...prev, { q: text, a: null, err: null }]); // append; previous turns stay on screen
    setQuestion("");
    if (taRef.current) taRef.current.style.height = "auto";
    const setLast = (patch: Partial<Turn>) =>
      setTurns((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    const minThinkingPreview = wait(MIN_THINKING_PREVIEW_MS);
    const t0 = Date.now();
    try {
      // Only fast/thorough/auto reach here — report modes returned above via the research branch.
      // Auto picks the depth from the question shape (reuses the same fast/thorough engine paths).
      const askMode: AskMode = mode === "thorough" ? "thorough" : mode === "auto" ? autoDepth(text) : "fast";
      // Ride the project's user-set instructions into the question the engine sees — the frozen /ask fn
      // is untouched; the safety scan still sees everything. Never applied to `text` (transcript, saved
      // history) or autoDepth (depth classification) above. Report runs (deep/discovery) are excluded.
      const outgoing = projectInstructions.trim()
        ? `Project context (user-set): ${projectInstructions.trim().slice(0, 500)}\n\nQuestion: ${text}`
        : text;
      const res = await askQuestion(outgoing, askMode);
      await minThinkingPreview;
      setLast({ a: res, thinkSecs: Math.max(1, Math.round((Date.now() - t0) / 1000)) });
      setRevealIdx(idx); // this turn just arrived → type it in (cleared whenever a saved chat loads)
      phCapture("ask_answered", { mode, citations: res.citations.length, evidence_grade: res.evidence_grade, intent: res.intent });
      bumpUsage(); // refresh the shell's account footer + credits chip after this ask consumed a unit
      void persistTurn(idx, text, res); // save the question + cited answer to chat history
    } catch (err) {
      const msg = isQuotaError(err)
        ? `Daily Ask limit reached (${err.quota.used}/${err.quota.limit}) on ${err.quota.plan}.`
        : err instanceof Error ? err.message : "Ask failed";
      await minThinkingPreview;
      setLast({ err: msg });
      if (isQuotaError(err)) phCapture("ask_blocked", { mode, reason: "quota", plan: err.quota.plan });
    } finally {
      setBusy(false);
    }
  }

  // Skill: Systematic review — arms the documented-method report mode. Skill: Slides — arms Deep
  // research AND flags "export this run's report to PowerPoint when it's done" (consumed on the next
  // submit; see submit()'s wantSlides/slidesIntentRef). Both callbacks and their submit()-side machinery
  // are kept live (the PPTX auto-export path still works end-to-end) even though the composer "+" menu
  // no longer exposes a Skills row that calls them — the ChatGPT-parity menu (Task B, 2026-07-06) has
  // no Skills slot. Slides currently has NO trigger surface anywhere in the UI; needs a new home.
  const armSystematicReview = useCallback(() => { setMode("structured_review"); }, []);
  const armSlides = useCallback(() => { setMode("deep"); slidesArmedRef.current = true; }, []);

  const hasThread = turns.length > 0;
  const composer = (
    <>
      {projectId ? (
        <div className="chip-row" style={{ justifyContent: "center", marginBottom: 6 }}>
          <span className="chip-action" style={{ cursor: "default" }}>
            <Icon name="folder" size={14} />
            in {projectName || "project"}
            <button type="button" aria-label="Leave project context" title="Leave project context"
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "0 0 0 4px" }}
              onClick={() => { setProjectId(null); setProjectInstructions(""); setProjectName(""); }}>✕</button>
          </span>
        </div>
      ) : null}
      <Composer
        question={question} setQuestion={setQuestion} taRef={taRef} autoGrow={autoGrow}
        submit={submit} busy={busy} mode={mode} setMode={setMode}
        modeOpen={modeOpen} setModeOpen={setModeOpen}
        error={latest?.err ?? null}
        welcome={!hasThread}
      />
    </>
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
          <h2 className="welcome-title">{reopenedEmpty ? "This chat has no saved messages" : "What can I help you research?"}</h2>
          {reopenedEmpty ? (
            <p className="welcome-sub">Its earlier turns didn’t save (a now-fixed bug). Ask below to continue in this chat, or start a new one.</p>
          ) : null}
          {composer}
          {/* ChatGPT-style calm landing: greeting + composer + ONE row of at most three ghost chips.
              The composer's own "+" launcher is now ChatGPT's own short shape (Add photos & files /
              Web search / Deep research) — Discovery, Monitor, Playbooks, and Data sources no longer
              live there; Discovery/Verify stay reachable via these welcome chips and Monitor's own
              page, Data sources via Settings. */}
          {!reopenedEmpty ? (
            <div className="chip-row welcome-chips">
              <button type="button" className="chip-action" onClick={() => { setQuestion("Is it true that "); taRef.current?.focus(); }}>
                <Icon name="check" size={14} />Verify a claim
              </button>
              <button type="button" className="chip-action" onClick={() => { setMode("deep"); taRef.current?.focus(); }}>
                <Icon name="doc" size={14} />Deep research
              </button>
              <button type="button" className="chip-action" onClick={() => { setQuestion("Is creatine good for me?"); taRef.current?.focus(); }}>
                <Icon name="search" size={14} />Is this good for me?
              </button>
            </div>
          ) : null}
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
                {/* Manus-style agent turn header: a quiet monogram avatar + the product name above each
                    AI answer (Manus shows "🌱 manus"). The decorative Orb was removed by owner direction,
                    so this is a simple token-tinted "P" square, not <Orb/>. Purely presentational. */}
                <div className="agent-head" aria-hidden="true">
                  <span className="agent-avatar">P</span>
                  <span className="agent-name">PharmaOrb</span>
                </div>
                <div className="ai-body">
                  {t.scoping ? (
                    <div className="thinking"><div className="think-row"><span className="shimmer">{t.deliverableLabel ? `Building your ${t.deliverableLabel} — scoping the research first…` : "Scoping your question…"}</span></div></div>
                  ) : t.scope ? (
                    <ScopeTurn state={t.scope} onRun={(enriched, subQuestions) => void launchResearch(i, t.scope!.question, enriched, t.scope!.runMode, subQuestions, t.scope!.deliverableLabel, t.scope!.deliverableNote, t.scope!.bubbleQ)} />
                  ) : t.research ? (
                    <>
                      <ResearchRunCard
                        card={t.research}
                        onProgress={setActiveRunProgress}
                        onComplete={(r) => {
                          void persistResearchTurn(i, t.q, t.research!.mode, r);
                          // Slides skill (or a typed "make me slides/a document…" deliverable command,
                          // see submit()): if THIS turn armed an export, run it once. `downloadReportExport`
                          // needs the saved report id; if it's missing (no report row) or the download
                          // throws, show a neutral fallback — the report is already saved and the "Report
                          // ready" card links to it for a manual export.
                          const fmt = exportIntentRef.current.get(i);
                          if (fmt) {
                            exportIntentRef.current.delete(i);
                            const label = fmt === "docx" ? "your document" : "your slides";
                            if (r.savedReportId) {
                              setTurns((prev) => prev.map((x, j) => (j === i ? { ...x, slidesNote: `Opening ${label} — check your downloads.` } : x)));
                              void downloadReportExport(r.savedReportId, fmt, "vancouver").catch(() => {
                                setTurns((prev) => prev.map((x, j) => (j === i ? { ...x, slidesNote: `Couldn’t export ${label} automatically — open the report to download.` } : x)));
                              });
                            } else {
                              setTurns((prev) => prev.map((x, j) => (j === i ? { ...x, slidesNote: `Couldn’t export ${label} automatically — open the report to download.` } : x)));
                            }
                          }
                        }}
                      />
                      {t.slidesNote ? <p className="tmpl-note">{t.slidesNote}</p> : null}
                    </>
                  ) : t.a ? (
                    <>
                      {t.a.intent !== "smalltalk" ? (
                        <Thinking stage={3} question={t.q} complete secs={t.thinkSecs} domains={citationDomains(t.a.citations, t.a.reviewed_sources)} />
                      ) : null}
                      <Answer answer={t.a} onCite={onCite} question={t.q} reveal={i === revealIdx} />
                    </>
                  ) : isLast && busy && showThinking ? <Thinking stage={stage} question={t.q} /> : null}
                  {t.err ? <p className="tmpl-note">{t.err}</p> : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="composer-wrap">
        <AgentRunDock progress={activeRunProgress} question={latest?.q} />
        {composer}
      </div>
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
  // Set only for a run launched from a detected deliverable command — surfaces the honest
  // "Building your slides on {title}…" framing instead of the generic "Deep research running…".
  // deliverableNote (when set) is the poster-fallback disclosure ("Poster export isn't built yet…").
  deliverableLabel?: DeliverableFormat;
  deliverableNote?: string;
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
  /** The engine's planned sub-questions (3-6), shown as editable rows above the run actions. May be empty. */
  plan: string[];
  // Carried through from a detected deliverable command (see submit()) so a clarification round
  // doesn't drop the armed export or the honest "building your slides…" framing.
  deliverableLabel?: DeliverableFormat;
  deliverableNote?: string;
  bubbleQ?: string;
}

interface Turn {
  q: string;
  a: AskResponse | null;
  err: string | null;
  research?: ResearchCard; // present when this turn is a deep-research run instead of a chat answer
  scope?: ScopeTurnState;  // present while clarifying questions await answers
  scoping?: boolean;       // brief: the scope step is running before we know if clarification is needed
  thinkSecs?: number;      // wall-clock seconds the engine spent before this turn's answer arrived ("Thought for Xs")
  slidesNote?: string;     // set when a Slides-skill run finished: either a "opening PowerPoint" note or a neutral fallback
  // Set only when a typed deliverable command was detected (NEXT_PUBLIC_DELIVERABLES_ON_COMMAND) —
  // drives the honest "Building your slides…" copy on the brief scoping placeholder before `research`
  // exists yet. Once `research` is set, ResearchCard.deliverableLabel/deliverableNote take over.
  deliverableLabel?: DeliverableFormat;
  deliverableNote?: string;
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
  // true only on the empty welcome screen — drives the cycling example placeholders. In an active
  // chat (thread) it's false, so the box shows a calm static "Ask a follow-up…" instead.
  welcome: boolean;
}

// The input pill, shared between the centered welcome screen and the pinned bottom bar. A leading
// "+" (attachments) and a "mic" (voice) are shown as ChatGPT-style affordances but disabled until
// those features ship — same honest "coming soon" treatment as the non-live modes.
function Composer({ question, setQuestion, taRef, autoGrow, submit, busy, mode, setMode, modeOpen, setModeOpen, error, welcome }: ComposerProps) {
  const activeMode = MODES.find((m) => m.id === mode)!;
  // On the welcome screen, cycle example questions through an animated overlay placeholder (reveals
  // in from the left, fades out) so suggestions live in the chat bar without a hard text swap. Once a
  // chat is active the suggestions stop — the box shows a calm static placeholder instead.
  const [phIdx, setPhIdx] = useState(0);
  const [plusOpen, setPlusOpen] = useState(false); // the "+" tools launcher popover
  // The "+" tools menu flips up/down and caps its height to the free space on that side, so it's never
  // pushed past the window edge — the welcome composer sits low (little room above) while a thread
  // composer sits at the bottom (little room below).
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const [plusMenuStyle, setPlusMenuStyle] = useState<CSSProperties>({ bottom: "calc(100% + 6px)", top: "auto", left: 0, right: "auto", width: 280, maxHeight: 460 });
  const dictation = useDictation(setQuestion, () => question);
  useEffect(() => {
    if (!welcome) return;
    const id = setInterval(() => setPhIdx((i) => (i + 1) % ASK_EXAMPLE_PROMPTS.length), 5000);
    return () => clearInterval(id);
  }, [welcome]);
  // Place the tools menu when it opens (and keep it placed on resize/scroll): open on whichever side of
  // the "+" button has more room, and cap the menu to that side's height so the whole list always fits.
  useEffect(() => {
    if (!plusOpen) return;
    const place = () => {
      const btn = plusBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const gap = 12;
      // The upward menu must clear the fixed topbar, so the usable space above is measured from the
      // topbar's bottom edge (not the window top). This also biases the choice toward whichever side
      // genuinely has more room, so a low welcome composer flips the menu downward instead of clipping.
      const topbarH = (document.querySelector(".topbar") as HTMLElement | null)?.getBoundingClientRect().height ?? 56;
      const above = r.top - topbarH - gap;
      const below = window.innerHeight - r.bottom - gap;
      const openUp = above >= below;
      const maxHeight = Math.max(200, Math.min(460, Math.round(openUp ? above : below)));
      setPlusMenuStyle(
        openUp
          ? { bottom: "calc(100% + 6px)", top: "auto", left: 0, right: "auto", width: 280, maxHeight }
          : { top: "calc(100% + 6px)", bottom: "auto", left: 0, right: "auto", width: 280, maxHeight },
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [plusOpen]);
  return (
    <div className="composer">
      <div className="box">
        <div className="mode-wrap" style={{ position: "relative" }}>
          <button ref={plusBtnRef} className="tool" type="button" data-tip="Tools" aria-label="Tools" aria-haspopup="menu" aria-expanded={plusOpen} onClick={() => setPlusOpen((v) => !v)}>
            <Icon name="plus" size={18} />
          </button>
          {plusOpen ? (
            // ChatGPT's own "+" shape (docs/design/chatgpt-clone-teardown-2026-07-06.md): Add photos
            // & files / Web search / Deep research, nothing else — the owner's complaint was this menu
            // carrying Discovery/Verify/Monitor/filters/Skills/Playbooks/Data sources all at once.
            // Those still exist: Discovery/Verify via the welcome-screen chips, Monitor at /app/monitor,
            // Data sources in Settings. Only Deep research is wired here — the other two are honest
            // disabled "Soon" rows (no upload backend, no frontend web-search toggle yet) rather than
            // dead buttons that claim to do something they don't.
            <div className="acct-menu tools-menu" role="menu" style={plusMenuStyle}>
              <button type="button" role="menuitem" disabled>
                <Icon name="attach" size={14} /><span style={{ flex: 1 }}>Add photos &amp; files</span><small style={{ color: "var(--text-3)" }}>Soon</small>
              </button>
              <button type="button" role="menuitem" disabled>
                <Icon name="globe" size={14} /><span style={{ flex: 1 }}>Web search</span><small style={{ color: "var(--text-3)" }}>Soon</small>
              </button>
              {/* Deep research runs the engine's "meta" pipeline: the full structured review (documented
                  method, cited sections) PLUS a code-computed pooled estimate when the studies are
                  genuinely comparable. This is the one live tool — single-shot (see submit()), the
                  armed mode resets to the default depth once the run launches. */}
              <button type="button" role="menuitem" onClick={() => { setMode("deep"); setPlusOpen(false); taRef.current?.focus(); }}>
                <Icon name="doc" size={14} /><span style={{ flex: 1 }}>Deep research</span><small style={{ color: "var(--text-3)" }}>cited report + pooled stats</small>
              </button>
            </div>
          ) : null}
        </div>
        <div className="ta-wrap">
          <textarea
            ref={taRef}
            rows={1}
            value={question}
            maxLength={500}
            aria-label="Ask a question about a drug, dose, interaction, or monograph"
            placeholder={welcome ? "Ask anything, or type / for more" : busy ? "Follow up" : "Ask anything"}
            onChange={(e) => { setQuestion(e.target.value); autoGrow(); }}
            onKeyDown={(e) => {
              // Manus's slash affordance: on an empty box, "/" opens the existing "+" tools launcher
              // instead of typing a literal slash. Any non-empty box types "/" normally.
              if (e.key === "/" && !question) { e.preventDefault(); setPlusOpen(true); return; }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(question); }
            }}
          />
          {/* The standing "/ for more" affordance lives in the textarea PLACEHOLDER (short, static, never
              clips). This overlay only rotates the example prompts on top of it — it has an opaque
              background so it cleanly occludes the placeholder while shown, then fades to reveal the
              standing "/ for more" hint again. Best of both: rotating examples AND a persistent slash hint. */}
          {welcome && !question ? <span className="ph-anim" key={phIdx} aria-hidden="true">{askPlaceholderFor(phIdx)}</span> : null}
        </div>
        <div className="mode-wrap" style={{ position: "relative" }}>
          <button className="mode" onClick={() => setModeOpen((v) => !v)} type="button" aria-haspopup="menu" aria-expanded={modeOpen}>
            <b>{composerModeLabel(activeMode)}</b>
            <Icon name="chevron-down" size={14} />
          </button>
          {modeOpen ? (
            <div className="acct-menu" role="menu" style={{ bottom: "calc(100% + 6px)", top: "auto", left: 0, right: "auto", width: 230 }}>
              {/* Depth ONLY — the Pro report tools (Deep research / Discovery) moved to the "+"
                  launcher on the left, so this dial reads as speed/depth (the ChatGPT split). When a
                  tool is armed, the dial button shows its name; picking a depth here disarms it.
                  lab_draft stays out until its engine deploy is owner-gated live. */}
              {MODES.filter((m) => simplifiedModesEnabled ? m.id === "auto" : (m.id === "fast" || m.id === "thorough")).map((m) => (
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
        <button
          className={`tool${dictation.listening ? " rec" : ""}`}
          type="button"
          data-tip={dictation.supported ? (dictation.listening ? "Stop dictation" : "Dictate") : "Dictation not supported in this browser"}
          aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
          aria-pressed={dictation.listening}
          disabled={!dictation.supported}
          onClick={dictation.toggle}
        >
          <Icon name="mic" size={18} />
        </button>
        <button className="send" data-tip="Send" aria-label="Send" onClick={() => submit(question)} disabled={busy || !question.trim()}>
          <Icon name="send" size={18} />
        </button>
      </div>
      {error ? <div className="err">{error}</div> : null}
      {dictation.error ? <div className="err">{dictation.error}</div> : null}
      <div className="composer-disclaimer">{POINT_OF_USE_DISCLAIMER}</div>
    </div>
  );
}

// The thinking header over an answer, ChatGPT-measured anatomy (observed live 2026-07-05):
//   1. A first-person plan line ("I'll check what the evidence says about …") that appears first and
//      STAYS above the answer permanently — it never collapses away.
//   2. While working: a dimmed reasoning snippet under it that swaps as the pipeline advances (the
//      live "I'm thinking of…" line), plus the search-surface chips during the search stages.
//   3. Once answered: a "Thought for Xs ›" disclosure under the plan line that expands into the
//      activity trail — alternating search blocks (search icon + gerund title + domain chips) and
//      reasoning blocks (bullet + first-person paragraph), ChatGPT's Activity-panel pattern.
function Thinking({ stage, question, complete = false, secs, domains }: { stage: number; question: string; complete?: boolean; secs?: number; domains?: string[] }) {
  const preview = buildThinkingPreview(question, stage);
  const [open, setOpen] = useState(false);
  if (!complete) {
    return (
      <div className="thinking engine-preview engine-preview-compact" aria-live="polite" title={preview.preview}>
        <div className="intent-line">{preview.intent}</div>
        <span className="engine-preview-title thinking-snippet">
          {stage <= 0 ? "Thinking" : preview.current}
          <span className="engine-dots" aria-hidden="true"><span /><span /><span /></span>
        </span>
        {stage >= 1 && stage <= 2 ? <DomainChips domains={SEARCH_DOMAINS} max={4} /> : null}
      </div>
    );
  }
  const chips = domains?.length ? domains : SEARCH_DOMAINS;
  return (
    <div className="thinking engine-preview engine-preview-compact engine-preview-done">
      <div className="intent-line">{preview.intent}</div>
      <button type="button" className="thought-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="engine-preview-title">
          {secs ? `Thought for ${secs}s` : "Thought through evidence"}
          <span className={`engine-preview-chevron${open ? " open" : ""}`} aria-hidden="true">›</span>
        </span>
      </button>
      {open ? (
        <div className="activity-trail">
          {preview.steps.map((s) => (
            <div className={`activity-step activity-step-${s.kind}`} key={s.label}>
              <div className="activity-step-title">
                {s.kind === "search" ? <Icon name="search" size={13} /> : <span className="activity-bullet" aria-hidden="true" />}
                {s.current}
              </div>
              <div className="activity-step-detail">{s.detail}</div>
              {s.kind === "search" ? <DomainChips domains={chips} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// The clarifying-question turn: shown when the scope step found the question ambiguous, or when the
// engine has a pre-run plan (or both). Each clarifying question offers quick-pick chips (which fill the
// matching free-text box) plus a free-text answer; the plan (when present) shows as editable rows the
// user can tweak before the run starts. "Run with answers" folds the answers into the question AND
// passes the (trimmed, non-empty) edited plan; "Just run it" runs the original question with NO
// sub-questions override, so the engine plans it itself.
function ScopeTurn({ state, onRun }: { state: ScopeTurnState; onRun: (enrichedQuestion: string, subQuestions?: string[]) => void }) {
  const [answers, setAnswers] = useState<string[]>(() => state.questions.map(() => ""));
  const [planDraft, setPlanDraft] = useState<string[]>(() => [...state.plan]);
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
    const enriched = parts.length ? `${state.question}\n\nFocus: ${parts.join("; ")}` : state.question;
    const editedPlan = planDraft.map((p) => p.trim()).filter(Boolean);
    onRun(enriched, editedPlan.length ? editedPlan : undefined);
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
      {planDraft.length ? (
        <div className="scope-q">
          <div className="scope-q-text">The research plan — edit any line before it runs:</div>
          {planDraft.map((p, i) => (
            <input key={i} className="scope-input" value={p} aria-label={`Planned sub-question ${i + 1}`}
              onChange={(e) => setPlanDraft((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
        </div>
      ) : null}
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
function ResearchRunCard({ card, onComplete, onProgress }: { card: ResearchCard; onComplete?: (r: { savedReportId: string | null; sources: number }) => void; onProgress?: (progress: ResearchProgressStep[] | null) => void }) {
  const [run, setRun] = useState<ResearchRunRow | null>(null);
  // Rehydrated (saved) cards start already-done; live runs reach done via polling.
  const [done, setDone] = useState<{ id: string | null; sources: number; title: string } | null>(
    card.completed ? { id: card.completed.savedReportId, sources: card.completed.sources, title: card.title } : null,
  );
  const [err, setErr] = useState<string | null>(card.error);
  // Hold the latest onComplete in a ref so it isn't a poll-effect dependency (which would restart polling).
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  // Same ref pattern for onProgress — keeps it out of the poll effect's deps so lifting live progress
  // up to the pinned dock never restarts the poll.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const firedRef = useRef(false);
  const [showMission, setShowMission] = useState(false);

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
      if (++polls > MAX_POLLS) { onProgressRef.current?.(null); setErr("This is taking longer than expected — check your Reports list in a bit."); return; }
      try {
        const row = await fetchResearchRun(card.runId);
        if (!alive) return;
        if (row) {
          setRun(row);
          // Mirror this run's live progress up to the pinned AgentRunDock (above the composer).
          onProgressRef.current?.(row.progress ?? []);
          if (row.status === "completed") {
            // Run finished — clear the dock so it stops mirroring a now-done run.
            onProgressRef.current?.(null);
            const rep = row.saved_report_id ? await fetchResearchReport(row.saved_report_id) : null;
            if (!alive) return;
            const sources = rep?.citations.length ?? 0;
            setDone({ id: row.saved_report_id, sources, title: rep?.question || card.title });
            // Persist exactly once so the card survives a reopen.
            if (!firedRef.current) { firedRef.current = true; onCompleteRef.current?.({ savedReportId: row.saved_report_id, sources }); }
            return;
          }
          if (row.status === "failed") { onProgressRef.current?.(null); setErr(row.error || "Research could not be completed."); return; }
        }
      } catch { /* transient read error — keep polling */ }
      timer = setTimeout(tick, 1500);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); onProgressRef.current?.(null); };
  }, [card.runId, card.error, card.completed, card.title, done]);

  // "meta", "structured_review", and "standard" are ALL user-facing "Deep research" now (the pooled
  // pipeline is folded into the one tool) — old saved cards relabel too, by design.
  const modeLabel = card.mode === "lab_draft"
    ? "Lab draft (beta)"
    : card.mode === "discovery"
    ? "Discovery"
    : card.mode === "structured_review"
    ? "Systematic review"
    : "Deep research";

  if (err) {
    return (
      <div className="research-run-card">
        <p className="tmpl-note">{err}</p>
        {card.proGate ? <Link href="/app/billing" className="chip-action"><Icon name="card" size={14} />See Pro plans</Link> : null}
      </div>
    );
  }
  // Deliverable-on-command framing (see submit() in AskPage): when this run was launched from a
  // typed "make me slides on X" / "write a document about Y" / "make a poster on Z" command, name the
  // artifact honestly instead of the generic mode label — this IS the "surface it honestly" requirement,
  // reusing this same research-run card rather than any silent reinterpretation. A poster request has
  // no export today (deliverableNote carries the fallback disclosure, shown once the report is done) —
  // so its RUNNING label says "report" up front rather than promising a poster it can't yet produce.
  const deliverableWord = card.deliverableLabel === "slides" ? "slides"
    : card.deliverableLabel === "document" ? "document"
    : card.deliverableLabel === "poster" ? "report"
    : null;
  const runningLabel = deliverableWord ? `Building your ${deliverableWord} on ${card.title}…` : `${modeLabel} running…`;

  if (done) {
    return (
      <div className="research-done">
        <Link href={done.id ? `/app/reports/${done.id}` : "/app/reports"} className="research-card" title={done.title}>
          <Icon name="doc" size={15} />
          <span className="research-card-title">Report ready: {done.title}</span>
          <small>{done.sources} sources · {modeLabel}</small>
        </Link>
        {card.deliverableNote ? <p className="tmpl-note">{card.deliverableNote}</p> : null}
        <div className="msg-actions">
          <button type="button" className="chip-action" onClick={() => setShowMission((v) => !v)} aria-expanded={showMission}>
            <Icon name="bell" size={14} />Repeat this research
          </button>
        </div>
        {showMission ? <MissionSheet question={card.title} reportMode={card.mode} onClose={() => setShowMission(false)} /> : null}
      </div>
    );
  }
  return (
    <div className="research-run-card">
      {/* Manus-style one-line acknowledgement, shown only for a real research run (this branch renders
          solely while a deep-research / systematic-review / discovery / lab-draft run is live) — an
          honest "I'm on it" before the progress steps. Plain fast asks never reach here. */}
      <p className="agent-ack">{card.deliverableLabel === "poster" ? "Poster export is coming soon — building a cited deep-research report on this instead." : deliverableWord ? `Building your ${deliverableWord} — gathering and citing sources first.` : "Researching this now — gathering and citing sources."}</p>
      <div className="ai-block-label"><Icon name="sparkle" size={14} /> {runningLabel}</div>
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

// A chemical-structure thumbnail for the answer's primary drug, hot-linked from PubChem (renders a PNG
// by compound name — no key, public-domain depiction; cross-origin <img> needs no CORS/proxy). Hides
// itself when PubChem has no structure for the name (a condition, a biologic, a typo) via onError → null.
function MoleculeImage({ drug }: { drug: string }) {
  const [failed, setFailed] = useState(false);
  const src = pubchemMoleculeUrl(drug); // null for biologics/peptides — their 2D depiction is a useless tangle
  if (!src || failed) return null;
  return (
    <figure className="mol-fig">
      <img src={src} alt={`Chemical structure of ${drug}`} loading="lazy" onError={() => setFailed(true)} />
      <figcaption>{drug} · structure</figcaption>
    </figure>
  );
}

function Answer({ answer, onCite, question, reveal = false }: { answer: AskResponse; onCite: (answer: AskResponse, tag: string, quote?: string) => void; question: string; reveal?: boolean }) {
  const citeMap = useMemo(() => {
    const m = new Map<string, CiteInfo>();
    for (const c of answer.citations) m.set(normTag(c.chunk_tag), { label: abbr(c.source_type), name: pillName(c.source_type), title: c.title ?? c.source_type, domain: hostnameOf(c.url) });
    return m;
  }, [answer.citations]);

  // When this is the just-arrived turn, reveal the answer text word-by-word (see lib/reveal-text).
  // One shared counter spans the lead + the prose so the whole thing types in as one continuous
  // stream; null when not revealing (loaded/historical turns render instantly). `fade` (the one-shot
  // block fade) is dropped while revealing so the word stagger isn't fighting a container fade.
  const ctx: RevealCtx | null = reveal ? newRevealCtx() : null;
  const rt = (text: string) => (ctx ? wrapWords(renderInline(text), ctx) : renderInline(text));
  const fadeClass = reveal ? "" : " fade";

  // Small-talk (a greeting / thanks / "what can you do") is a plain conversational reply — no
  // evidence grade, no sources, no clinical sections. Render just the friendly line.
  if (answer.intent === "smalltalk") {
    return <div className={`answer${fadeClass}`}><p className="lead">{rt(answer.plain_english_summary)}</p></div>;
  }

  const s = answer.answer_sections;
  const flags = (answer.safety_flags ?? []).filter((f) => f !== "no_sources_found");
  // "Where the science stands" — deterministic, positive-only signal from the cited sources'
  // study-type metadata (well_studied / emerging, or nothing). Never an LLM guess.
  const science = scienceState(answer.citations);
  const cite = (tag: string, quote?: string) => onCite(answer, tag, quote); // bind every [n] click to THIS answer's sources + the clicked claim's supporting line
  // When revealing, fade the trailing sections (uncertainty / questions / news / actions) in just AFTER
  // the lead + prose finish typing, so they don't sit there fully-formed while the top types. The word
  // counter is mutated inside <Prose>, so we estimate the head's reveal span up front (+1 slot per prose
  // point for its citation chip, +150ms breathing room).
  const headSlots = ctx ? countWords(answer.plain_english_summary) + (s.what_we_know ?? []).reduce((n, p) => n + countWords(p.text) + 1, 0) : 0;
  const tailDelayMs = REVEAL_BASE + headSlots * REVEAL_STEP + 150;
  return (
    <div className={`answer${fadeClass}`}>
      <div className="grade-row">
        <span className="grade">{answer.evidence_grade.replace(/_/g, " ")}</span>
        {science ? (
          <span className={`science-state ${science.state}`} title={scienceBasis(science)}>
            {science.state === "well_studied" ? "Well-studied" : "Emerging"}
          </span>
        ) : null}
        {flags.map((f) => <span key={f} className="safety-flag">{f.replace(/_/g, " ")}</span>)}
      </div>
      {answer.primary_drug && !answer.template && !answer.refused_unsupported ? <MoleculeImage drug={answer.primary_drug} /> : null}
      {answer.plain_english_summary ? <p className="lead">{rt(answer.plain_english_summary)}</p> : <h4 style={{ marginTop: 10 }}>Answer</h4>}
      {answer.template ? <p className="tmpl-note">Conservative response ({answer.template.replace(/_/g, " ")}).</p> : null}

      {/* Main explanation, under a quiet section heading (owner wants clearer structure) over the cited body. */}
      {s.what_we_know?.length ? <div className="ai-block-label">What the evidence shows</div> : null}
      <Prose points={s.what_we_know} citeMap={citeMap} onCite={cite} citations={answer.citations} ctx={ctx} />

      {/* Safety block intentionally NOT rendered in the answer body (owner 2026-06-21: it "reads like
          fluff" and breaks the natural-conversation feel). RENDER-ONLY: safety_notes are still generated,
          safety-scanned server-side, and stored in the trace; the emergency 911 routing and the class-
          caution banner are untouched. Restore the <SafetyBlock> render from git to bring it back. */}

      {/* Trailing sections fade in together just after the lead + prose finish typing (rv-tail), so they
          don't pop in fully-formed while the top is still revealing. Instant when not revealing. */}
      <div className={ctx ? "rv-tail" : undefined} style={ctx ? { animationDelay: `${tailDelayMs}ms` } : undefined}>
        {/* Uncertainty, de-emphasized. */}
        <UnclearBlock points={s.what_we_do_not_know} citeMap={citeMap} onCite={cite} />

        {/* "Worth asking your clinician" (questions_to_ask) intentionally NOT rendered (owner 2026-06-23:
            it reads like a patient intake form and breaks the natural-conversation feel — same call as the
            Safety block). RENDER-ONLY: the engine still generates questions_to_ask, safety-scans, and stores
            them in the trace; nothing server-side changed. Restore this block from git to bring it back. */}

        {/* "In the news" panel intentionally NOT rendered in the chat answer (owner 2026-06-23: a news box
            under a cited medical answer is clutter that fights the clean conversation feel). It lives in
            Monitoring instead, where tracking a topic over time makes its news relevant. RENDER-ONLY: the
            engine still returns answer.news; the walled NewsPanel still ships in WatchDetail. */}

        <div className="msg-actions">
          <button className="icon-btn" data-tip="Copy answer" aria-label="Copy answer" onClick={() => navigator.clipboard?.writeText(answer.plain_english_summary ?? "")}><Icon name="copy" size={15} /></button>
          {answer.citations.length ? (
            <button
              type="button"
              className="sources-btn"
              aria-label="Show the sources behind this answer"
              onClick={() => cite(normTag(answer.citations[0]!.chunk_tag))}
            >
              <span className="sources-favs" aria-hidden="true">
                {citationDomains(answer.citations, answer.reviewed_sources).slice(0, 3).map((d) => (
                  <img key={d} src={faviconUrl(d)} alt="" width={16} height={16} loading="lazy" />
                ))}
              </span>
              Sources
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Short, locale-stable news date ("Jun 21"). Null/garbage → "" (we just drop it from the meta line).
function fmtNewsDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The walled "In the news — not verified evidence" panel. THE WALL (UI side): these headlines link OUT
// and are never citations — they carry no [n], never open the evidence drawer, and sit visually apart
// from the cited answer. Paid (Plus/Pro) users get the list; free users get a locked upgrade teaser
// where the panel would be (the backend gates which one via answer.news / answer.news_locked).
function NewsPanel({ news, locked }: { news?: AskResponse["news"]; locked?: boolean }) {
  if (news?.length) {
    return (
      <div className="ai-news" role="group" aria-label="In the news — not verified evidence">
        <div className="ai-block-label ai-news-head">
          <Icon name="bell" size={14} /> In the news
          <span className="ai-news-tag">not verified evidence</span>
        </div>
        <ul className="ai-news-list">
          {news.map((n, i) => {
            const meta = [n.source, fmtNewsDate(n.published_at)].filter(Boolean).join(" · ");
            return (
              <li key={i}>
                <a href={n.url} target="_blank" rel="noopener noreferrer nofollow">{n.title}</a>
                {meta ? <span className="ai-news-meta">{meta}</span> : null}
              </li>
            );
          })}
        </ul>
        <p className="ai-news-foot">Headlines for context only — never used as evidence in the answer above.</p>
      </div>
    );
  }
  if (locked) {
    return (
      <div className="ai-news ai-news-locked" role="group" aria-label="In the news — available on Plus and Pro">
        <div className="ai-block-label ai-news-head">
          <Icon name="lock" size={14} /> In the news
          <span className="ai-news-tag">not verified evidence</span>
        </div>
        <p className="ai-news-foot">See what’s being said about this drug in the news — kept clearly separate from the cited evidence. Available on Plus and Pro.</p>
        <Link href="/app/billing" className="chip-action"><Icon name="card" size={14} />See plans</Link>
      </div>
    );
  }
  return null;
}

// Per-citation metadata for the inline chips: the short source label + title, shown in the
// hover-preview card (footnote-style chips — the ChatGPT/Claude feel).
type CiteInfo = { label: string; name: string; title: string; domain: string | null };

interface PointBlockProps {
  points: Array<{ text: string; citation_ids?: string[]; support?: ClaimSupport[] }>;
  citeMap: Map<string, CiteInfo>;
  onCite: (tag: string, quote?: string) => void;
}

// One ChatGPT-style citation pill trailing a point's text: favicon + source name + a "+N" count that
// folds this point's extra sources into the same pill (the measured "PubMed +1" pattern). Clicking
// opens the evidence panel at the point's primary source with the verbatim supporting line highlighted;
// the folded sources are one scroll away in the same panel.
function CiteChips({ ids, support, citeMap, onCite }: { ids?: string[]; support?: ClaimSupport[]; citeMap: Map<string, CiteInfo>; onCite: (tag: string, quote?: string) => void }) {
  if (!ids?.length) return null;
  const tags = ids.map(normTag);
  const first = tags[0]!;
  const info = citeMap.get(first);
  const extra = tags.length - 1;
  return (
    <button
      type="button"
      className="cite"
      onClick={() => onCite(first, supportQuoteFor(support, first))}
      aria-label={info ? `Source: ${info.name} — ${info.title}${extra > 0 ? ` and ${extra} more` : ""}` : `Show source ${first}`}
    >
      <span className="cite-pill">
        {info?.domain ? <img className="cite-favicon" src={faviconUrl(info.domain)} alt="" width={14} height={14} loading="lazy" /> : null}
        {info?.name ?? first}
        {extra > 0 ? <span className="cite-extra">+{extra}</span> : null}
      </span>
      {info ? (
        <span className="cite-pop" aria-hidden="true">
          <span className="cite-pop-label">{info.label}</span>
          <span className="cite-pop-title">{info.title}</span>
        </span>
      ) : null}
    </button>
  );
}

// Render a section's points: several discrete points become scannable bullets; a lone point stays a
// flowing paragraph (a single bullet reads oddly). Citation chips trail each point either way.
// `paraClass` styles the single-point paragraph form per block (safety/uncertainty are quieter).
function PointItems({ points, citeMap, onCite, paraClass = "ai-para" }: PointBlockProps & { paraClass?: string }) {
  if (points.length >= 2) {
    return (
      <ul className="ai-list">
        {points.map((p, i) => (
          <li key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} support={p.support} citeMap={citeMap} onCite={onCite} /></li>
        ))}
      </ul>
    );
  }
  return (
    <>
      {points.map((p, i) => (
        <p className={paraClass} key={i}>{renderInline(p.text)}<CiteChips ids={p.citation_ids} support={p.support} citeMap={citeMap} onCite={onCite} /></p>
      ))}
    </>
  );
}

// The answer body (what_we_know): each supporting point is its OWN short paragraph (the ChatGPT/Claude
// feel), each ending with its citation chips — NOT a bullet list, and NOT one giant joined block (the
// owner found a single run-on paragraph a "fact dump"). The model still emits discrete, individually-
// cited points, so per-sentence citation grounding AND per-sentence safety-salvage granularity are
// preserved upstream (citation.ts / safety.ts); this is purely how they're laid out.
function Prose({ points, citeMap, onCite, citations = [], ctx = null }: PointBlockProps & { citations?: Citation[]; ctx?: RevealCtx | null }) {
  if (!points?.length) return null;
  return (
    <>
      {points.map((p, i) => {
        const chips = <CiteChips ids={p.citation_ids} support={p.support} citeMap={citeMap} onCite={onCite} />;
        // Per-claim Evidence Meter chip — deterministic, design-weighted (never vote-counted, see
        // packages/shared/src/claim-meter.ts). Additive: null when the point has no usable citations,
        // so the answer renders exactly as before.
        const meter = (() => {
          const m = meterForPoint(p.citation_ids, citations);
          return m ? (
            <span
              className={`meter-chip meter-${m.label}`}
              style={{ "--pct": `${m.score}%` } as CSSProperties}
              title={`Evidence for this point: ${m.basis}`}
            >
              <i />
              <b>{m.label}</b>
            </span>
          ) : null;
        })();
        return (
          <p className="ai-para" key={i}>
            {ctx ? wrapWords(renderInline(p.text), ctx) : renderInline(p.text)}
            {/* delay the chips (and the meter, sharing the same slot) so neither appears before the
                sentence it backs — keeps the single reveal-timeline slot-per-point that headSlots assumes. */}
            {ctx ? <span className="rv-w" style={{ animationDelay: `${revealDelay(ctx)}ms` }}>{chips}{meter}</span> : <>{chips}{meter}</>}
          </p>
        );
      })}
    </>
  );
}

// What's still unclear: de-emphasized (small muted label + muted text).
function UnclearBlock({ points, citeMap, onCite }: PointBlockProps) {
  if (!points?.length) return null;
  return (
    <div className="ai-unclear">
      <div className="muted-label">Still uncertain</div>
      <PointItems points={points} citeMap={citeMap} onCite={onCite} paraClass="" />
    </div>
  );
}
