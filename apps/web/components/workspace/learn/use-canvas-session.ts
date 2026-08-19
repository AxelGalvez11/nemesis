"use client";

// The canvas's brain: one piece of state, and every way it is allowed to change.
//
// Kept out of the components so the page stays a rendering of a canvas rather than a place
// where learning logic hides. Everything that decides anything — what is weak, what may
// change, where the arc goes next — lives in lib/learn and is unit-tested; this wires those
// decisions to the network and to React.

import { useCallback, useEffect, useRef, useState } from "react";

import { coverageNoticeForModel, readCoverage } from "@nemesis/shared";

import { useAuth } from "@/components/AuthProvider";
import { deviceKey, searchWebContext } from "@/lib/workspace/chat-api";
import { extractFile } from "@/lib/workspace/chat-attachments";
import type { ChatWebResult } from "@/lib/workspace/chat-web-search";
import type { TurnDecision, TurnOffer } from "@/lib/learn/turn-router";
import { groundingQuery, groundingSources, needsGrounding } from "@/lib/learn/topic-grounding";
import { canvasCapture, captureStateChange } from "@/lib/learn/canvas-analytics";
import {
  explainBlock,
  generateRelearn,
  generateRecall,
  generateTest,
  applyTeachingAction,
  cardAsTask,
  evaluateLearningResponse,
  explainSelection,
  simplifySelection,
  questionAsTask,
  runCommand,
} from "@/lib/learn/canvas-api";
import { blocksForConcepts, clearEvidenceForRetest, diagnose } from "@/lib/learn/canvas-diagnosis";
import { appendEvent, type NewLearningEvent } from "@/lib/learn/canvas-events";
import { buildExcerpts, buildExcerptsFromModel, excerptsFromSourceContext } from "@/lib/learn/canvas-grounding";
import { CANVAS_FILING_FOLDER, loadCanonicalSource } from "@/lib/learn/canvas-sources";
import { ensureKnowledgeForCanvas } from "@/lib/learn/canvas-knowledge";
import { verdictIsPass } from "@/lib/learn/canvas-judge";
import { actionMutatesCanvas, determineNextCognitiveAction } from "@/lib/learn/canvas-policy";
import { deriveSchedulingSignal } from "@/lib/learn/canvas-scheduling";
import {
  conceptLabel,
  type CanvasBlock,
  type CanvasLevel,
  type LearnerInputModality,
  type CanvasSource,
  type CanvasState,
  type LearningCanvas,
  type ResponseEvaluation,
  type RetrievalFormat,
} from "@/lib/learn/canvas-model";
import type { RelearnMiss } from "@/lib/learn/canvas-prompts";
import { applyOps, applyRewrite, restoreBlock } from "@/lib/learn/canvas-ops";
import { finishReading } from "@/lib/learn/canvas-reading";
import type { CanvasSelection, SelectionAction } from "@/lib/learn/canvas-selection";
import { canStart, canTransition } from "@/lib/learn/canvas-state";
import { RECALL_PLACEHOLDER, RESPONSE_PLACEHOLDER } from "@/lib/learn/canvas-tasks";
import { readingSubjectFor, thinkingCopy } from "@/lib/learn/thinking-phases";
import { deleteCanvas, loadCanvas, mergeSourceIntoCanvas, newCanvas, saveCanvas } from "@/lib/learn/canvas-store";
import { ensureCanvasDeck, gradeStudyCard, writeRecallCards } from "@/lib/learn/canvas-study-bridge";

import { isPreContent } from "@/lib/learn/canvas-hosting";
import { askCanvasChat, type TurnSurroundings } from "./canvas-chat";
import { prepareWebSourcePromotion } from "./web-source-promotion";

const RECALL_CARDS = 8;
const TEST_QUESTIONS = 6;
const RETEST_QUESTIONS = 4;

/** What the canvas is asking for right now, if anything.
 *
 *  The persistent composer reads this to decide what it is FOR: what to call itself, and where
 *  a submission should go. There is exactly one answer surface on the canvas, and this is how
 *  it knows which prompt it is answering. */
export interface ActiveTask {
  kind: "recall" | "question";
  id: string;
  /** What is being asked, so the composer can label itself against the real prompt. */
  prompt: string;
  /** The placeholder the composer shows — derived from the retrieval task, because
   *  "Explain it in your own words" is wrong for a prompt whose answer is one noun. */
  placeholder: string;
  index: number;
  total: number;
  /** Once answered, the composer goes back to being a place to ask about the feedback. */
  answered: boolean;
}

/** Which part of the page is working. Local rather than global so §21 holds: simplifying one
 *  paragraph must light up that paragraph, not blank the document. */
export interface BusyState {
  /**
   * 🔴 `"rewrite"` IS NOT `"command"`, AND THE DIFFERENCE IS THE WHOLE POINT OF §11. Both scope to
   * a block, but `"command"` also puts the COMPOSER into its busy state — which is right when the
   * learner typed something and is waiting on it, and wrong when they asked a paragraph to rewrite
   * itself. §11 says *"the existing passage enters a subtle processing state"*: the passage, not
   * the page, and not the place they type. Reusing `"command"` here would have lit up the one
   * control that has nothing to do with what is happening.
   */
  kind: "lesson" | "command" | "rewrite" | "recall" | "test" | "relearn" | "source" | null;
  /** The block a scoped command is working on, so only it shows as busy. */
  blockIds?: string[];
  label?: string;
}

/** A transient answer, shared between `askAbout` (block-scoped, via a citation marker) and
 *  `converse` (canvas-wide, `blockId: null`) so both write the same shape and contract rule 2's
 *  "clears on the next turn" rule only has one store to apply to. Named so the `useState` call and
 *  the `CanvasSession` field below cannot quietly drift into two different shapes. */
type CanvasAside = {
  text: string;
  blockId: string | null;
  sources?: readonly ChatWebResult[];
  /** Why Nemesis is offering to teach this, when it has a reason worth saying out loud. A plain
   *  answer carries none and the offer stays a bare button. */
  offer?: TurnOffer;
  /** The learner's own question, retained only for the transient general-answer aside. Never
   *  mistaken for their goal: the answer text is not what they asked for. */
  question?: string;
  /** The subject the model read out of the turn, or absent when it had none. What "Learn this"
   *  starts, and whether that button is shown at all. */
  topic?: string;
} | null;

export interface CanvasSession {
  canvas: LearningCanvas;
  busy: BusyState;
  error: string | null;
  /**
   * What the learner said to open this sitting, when the canvas began from an utterance rather than
   * from an attached file. `null` on a canvas reopened later, or one started from material.
   *
   * 🔴 THE SITTING'S, NOT THE CANVAS'S. Deliberately not read from or written to the stored canvas:
   * it answers "what did they come here for just now", and a persisted answer would still be
   * steering the teaching controller on a visit a week later. See `TeachingContext.opening`.
   */
  opening: string | null;
  /**
   * A transient answer to a question that did not change the page (§4).
   *
   * 🔴 `blockId: null` IS A GENUINE, RENDERED CASE, NOT AN UNUSED CORNER OF THE TYPE. It was
   * already representable (this field predates this comment) but nothing ever constructed one and
   * nothing ever rendered one: `canvas-document.tsx`'s per-block rendering only ever matches
   * `aside.blockId === block.id`, which a null `blockId` can never satisfy. `converse` below is
   * the first thing that mints one, for a question that is not about any particular passage, and
   * `learning-canvas.tsx` renders that case at the top of the canvas rather than under a block.
   */
  aside: CanvasAside;
  /** The id of the prompt whose answer is being read, or null. */
  judging: string | null;
  ready: boolean;
  dismissError: () => void;
  /** A short, true, non-failure message for the learner. See the implementation for why it shares
   *  the error strip. */
  showNotice: (message: string) => void;
  /** §11 — restore a passage the learner had rewritten, from the copy kept on the block. */
  restoreRewritten: (blockId: string) => void;
  /** §12 — record that the learner finished reading the chunk on screen. Writes no evidence. */
  finishReadingChunk: () => void;
  dismissAside: () => void;
  attachFiles: (files: FileList | File[]) => Promise<void>;
  /**
   * Read a web page and add it as a source, the same way an uploaded file becomes one.
   *
   * 🔴 REUSES `attachFiles` RATHER THAN A SECOND SOURCE-BUILDING PATH. A page's extracted text is
   * wrapped as a synthetic file and handed to the exact function a real upload already goes
   * through, so filing, knowledge extraction, and every other consequence of "this canvas gained a
   * source" happen in exactly one place. A parallel implementation here would be a second copy of
   * that logic, free to drift the moment one of them changes.
   */
  attachUrl: (url: string) => Promise<void>;
  /** Starts the arc. Takes the topic for a topic-first canvas (§6B); omit it when
   *  material is already attached. */
  begin: (topic?: string) => void;
  command: (text: string, selected: readonly CanvasBlock[]) => Promise<void>;
  askAbout: (block: CanvasBlock, question: string) => Promise<void>;
  /**
   * Take one conversational turn: read what the learner meant, say something back, and carry out
   * whatever that turn asked for. See canvas-chat.ts for the call and lib/learn/turn-router.ts for
   * why the model rather than a regex decides which of those it is.
   *
   * 🔴 NOT SCOPED TO A BLOCK, UNLIKE `askAbout`. "What does osmolarity mean" typed with nothing
   * selected is not about any one passage, so this asks the whole canvas's material (when it has
   * any) and general knowledge together, and a plain answer lands in the SAME `aside` state
   * `askAbout` already uses, with `blockId: null`.
   *
   * Returns the decision so the caller can keep the conversation's own transcript; the canvas is
   * already updated by the time it resolves.
   */
  converse: (
    said: string,
    surroundings: TurnSurroundings,
    /** Fired immediately before a `study` turn writes into an existing study document, so the
     *  caller can stamp the action that was in flight when the learner asked for material. */
    onStudyDocument?: () => void,
  ) => Promise<TurnDecision | null>;
  /** Turn the current conversational answer into an active learning session. Cited web pages are
   *  promoted through the ordinary source-ingestion door before the existing Canvas policy starts. */
  learnFromAside: () => Promise<void>;
  markKnown: (blockId: string, known: boolean) => void;
  toggleCollapsed: (blockId: string, collapsed: boolean) => void;
  gradeRecall: (
    cardId: string,
    grade: "again" | "hard" | "good" | "easy",
    evidence?: {
      said?: string;
      via?: LearnerInputModality;
      revealed?: boolean;
      evaluation?: ResponseEvaluation;
    },
  ) => Promise<void>;
  /** Retrieval by producing something rather than self-grading (§31). */
  attemptRecall: (cardId: string, text: string, via: LearnerInputModality) => Promise<void>;
  /** They asked to see the answer: recorded as a retrieval we did not obtain. */
  revealRecall: (cardId: string) => Promise<void>;
  answer: (questionId: string, picked: number) => void;
  /** Records the learner's own words and asks the judge what they show. */
  respond: (questionId: string, text: string, via: LearnerInputModality, tookMs?: number) => Promise<void>;
  /** What the canvas is asking for right now — null while reading. */
  activeTask: ActiveTask | null;
  /** Move to the next prompt of the round, or off the end of it. */
  advanceTask: () => void;
  /** The ONE way a learner answers anything. Routes to the recall or the test path by what is
   *  currently being asked, so there is never a second answer field. */
  answerActiveTask: (text: string, via: LearnerInputModality, tookMs?: number) => Promise<void>;
  /** "I don't know" — an explicit statement of state, which is real evidence, unlike a reveal
   *  shortcut that only tells us they looked. */
  admitUnknown: () => Promise<void>;
  /** Answer a question about an exact highlighted range. Returns text for a popover; for
   *  "simpler" it rewrites the one block instead and returns null. */
  /** Session management (§10). Kept away from the teaching API above on purpose — these change
   *  what the session IS, not what the learner is doing inside it. */
  rename: (title: string) => void;
  remove: () => Promise<void>;
  askAboutSelection: (
    selection: CanvasSelection,
    action: SelectionAction,
  ) => Promise<{ term: string; text: string; sourceLabel?: string } | null>;
  /** Record what the learner did. 🔴 Telemetry only — see canvas-events.ts. */
  recordEvent: (event: NewLearningEvent) => void;
  selectionBusy: boolean;
  selectionError: string | null;
  clearSelectionAnswer: () => void;
  reset: () => void;
}

export function useCanvasSession(canvasId: string | null): CanvasSession {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;

  const [canvas, setCanvas] = useState<LearningCanvas>(() => newCanvas());
  const [busy, setBusy] = useState<BusyState>({ kind: null });
  const [error, setError] = useState<string | null>(null);
  /** What the learner said to open this sitting, when a canvas began from an utterance rather than
   *  from a file. Read by the teaching controller; see `TeachingContext.opening`. */
  const [opening, setOpening] = useState<string | null>(null);
  const [aside, setAside] = useState<CanvasAside>(null);
  /** The prompt whose answer is being read right now. Per-question rather than a page-wide busy
   *  flag, so judging one answer does not freeze the rest of the page. */
  const [judging, setJudging] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** Which prompt of the current round the learner is on.
   *
   *  🔴 THIS LIVES HERE, NOT IN THE STAGE. It used to be `useState(0)` inside CanvasRecall and
   *  again inside CanvasTest, which is exactly why each of them had to grow its own answer box:
   *  the persistent composer is a sibling of the stage and had no way of knowing what was being
   *  asked. One cursor in the session is what lets one composer answer everything. */
  const [cursor, setCursor] = useState(0);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  // Saving is debounced against a ref so a burst of edits writes once, and so the save always
  // sees the newest canvas rather than the one captured when the timer was set.
  const latest = useRef(canvas);
  latest.current = canvas;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveCanvas(uid, latest.current), 600);
  }, [uid]);

  /** Every state change funnels through here so nothing can update the canvas without also
   *  stamping the time and scheduling a save. */
  const update = useCallback(
    (change: (current: LearningCanvas) => LearningCanvas) => {
      setCanvas((current) => {
        const next = change(current);
        if (next === current) return current;
        latest.current = { ...next, updatedAt: new Date().toISOString() };
        return latest.current;
      });
      persist();
    },
    [persist],
  );

  /** 🔴 Records an interaction and NOTHING ELSE. It must never touch `weakConceptIds`, an
   *  evaluation, or a scheduling grade — those come from performance, and a tooltip is not a
   *  performance. `canvas-events.test.ts` holds the line behaviourally. */
  const recordEvent = useCallback(
    (event: NewLearningEvent) => {
      update((current) =>
        appendEvent(current, event, new Date().toISOString(), `e${current.events.length}-${Date.now()}`),
      );
    },
    [update],
  );

  const go = useCallback(
    (to: CanvasState) => {
      captureStateChange(latest.current, to);
      update((current) => ({ ...current, state: to }));
    },
    [update],
  );

  // Load, or start fresh.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (canvasId) {
        const found = await loadCanvas(uid, canvasId);
        if (alive && found) {
          setCanvas(found);
          latest.current = found;
          setReady(true);
          return;
        }
      }
      if (!alive) return;
      const fresh = newCanvas();
      setCanvas(fresh);
      latest.current = fresh;
      canvasCapture("canvas_created", fresh);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [canvasId, uid]);

  // Time on task, for the completion state. Only counted while the tab is actually visible —
  // "14 min active learning" must not include an hour in a background tab.
  useEffect(() => {
    let since = Date.now();
    const flush = () => {
      const elapsed = Date.now() - since;
      since = Date.now();
      if (elapsed > 500 && document.visibilityState === "visible") {
        update((current) => ({ ...current, activeMs: current.activeMs + elapsed }));
      }
    };
    const onVisibility = () => {
      flush();
      since = Date.now();
    };
    const timer = setInterval(flush, 30_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [update]);

  const requireUid = useCallback((): string | null => {
    if (!uid) setError("Sign in to use the canvas.");
    return uid;
  }, [uid]);

  // ------------------------------------------------------------------ sources

  const attachFiles = useCallback(
    async (files: FileList | File[], sourceUrl?: string) => {
      const id = requireUid();
      if (!id) return;
      setError(null);
      // 🔴 THE SAME VOCABULARY THE POLICY LANE USES, AND SET FROM THE FILE ITSELF. This was a
      // bare `"Reading"` — one unchanging word for the whole of an ingestion that, on a 124 MB
      // lecture deck, is the longest wait in the product. `readingSubjectFor` reads the shape out
      // of the file the learner just handed over, so a deck says it is reading slides because it
      // IS reading slides, not because a timer advanced a list.
      const firstName = Array.from(files)[0]?.name ?? "";
      setBusy({ kind: "source", label: thinkingCopy("reading_source", readingSubjectFor(firstName)) });
      try {
        for (const file of Array.from(files)) {
          // The existing extraction chokepoint — same door chat attachments, Library import
          // and syllabus import all use. No second pipeline.
          //
          // 🔴 `keep` IS WHAT MAKES CROSS-SESSION LEARNING POSSIBLE AT ALL. Without it a file
          // under 4 MB took the inline lane, which has no stored row for a parse to attach to —
          // so a canvas attachment produced no `library_sources` row, no `parsed_documents` row
          // and no durable id. Everything the canvas then learned from that document was anchored
          // to a string that means nothing outside this one canvas: a second canvas built on the
          // same lecture could not tell it was the same lecture, and retrieval, which needs a
          // filed row, returned nothing at all. Chat keeps the old default on purpose — a photo
          // dropped into a conversation should not silently become a permanent document.
          const extracted = await extractFile(file, id, { folderPath: CANVAS_FILING_FOLDER, keep: true });
          // 🔴 A SLOT NUMBER, NOT A DOCUMENT IDENTITY — AND IT IS ONLY UNIQUE BECAUSE NOTHING
          // REMOVES A SOURCE. This mints a fresh ordinal on every attach, which is why the
          // duplicate guard in `mergeSourceIntoCanvas` used to compare `id` and could never
          // fire: production canvas `186d0749` holds one document three times, as s2/s3/s4.
          // Deduplication now happens there, on `librarySourceId`, which names the DOCUMENT.
          //
          // 🔴 IF YOU EVER ADD "remove this source", THIS LINE BECOMES A BUG. With one of three
          // sources removed the next attach mints `s3` again, collides with the survivor, and
          // the id branch of `isSameDocument` overwrites a DIFFERENT document. Deriving from a
          // count is safe only while the count never goes down. Make it monotonic then — not
          // now, because renaming ids is a migration for every stored canvas and every anchor
          // already written against one.
          const sourceId = `s${latest.current.sources.length + 1}`;
          const note = coverageNote(extracted.coverage);

          // 🔴 READ BACK WHAT SURVIVED, RATHER THAN TRUSTING WHAT WAS RETURNED. The upload
          // response carries the model the parser produced in that request; the canvas has to
          // work from the one that got STORED, because that is what every later reader sees —
          // this canvas after a reload, a second canvas, retrieval, extraction. While the two are
          // built from different inputs, a write that silently failed or a shape the envelope
          // reader rejects looks perfect here and empty everywhere else.
          const canonical = extracted.librarySourceId
            ? await loadCanonicalSource(extracted.librarySourceId)
            : { ok: false as const, reason: "not-found" as const };

          const source: CanvasSource = {
            id: sourceId,
            title: extracted.title ?? file.name,
            kind: extracted.kind ?? "text",
            // Three inputs, in order of how much is known about them, and the fallbacks are
            // fallbacks rather than dead code: an image has no structural pass at all, and a PDF
            // the structural reader could not open falls back to `unpdf`.
            //
            //   1. the STORED canonical parse — the one everything else reads;
            //   2. the model from this request — right, but only until the tab closes;
            //   3. the flat text — a heading becomes a guess and a table becomes pipe soup.
            //
            // 🔴 AND A MISSING MODEL IS "UNKNOWN", NEVER "FLAT". Reading absence the second way
            // is how a two-column paper gets filed as prose.
            excerpts: canonical.ok
              ? excerptsFromSourceContext(sourceId, canonical.context)
              : extracted.model
                ? buildExcerptsFromModel(sourceId, extracted.model)
                : buildExcerpts(sourceId, extracted.text),
            ...(note ? { coverageNote: note } : {}),
            // 🔴 STATED, NOT LEFT TO BE INFERRED. A reader must not have to work out durability
            // from whether some other field happens to be set — an ephemeral source can teach this
            // canvas perfectly well, and must not pretend to support anything that outlives it.
            durability: extracted.librarySourceId ? "durable" : "ephemeral",
            ...(extracted.librarySourceId ? { librarySourceId: extracted.librarySourceId } : {}),
            ...(canonical.ok ? { parseQuality: canonical.context.quality } : {}),
            // A promoted web result remains traceable to the page it came from. This metadata is
            // supplied only by `attachUrl`; ordinary uploads correctly leave it absent.
            ...(sourceUrl ? { sourceUrl } : {}),
          };
          update((current) => mergeSourceIntoCanvas(current, source));

          // 🔴 THE FIRST TIME THE RUNNING APP CREATES DURABLE KNOWLEDGE. Until this landed,
          // `extractKnowledgeObjects` existed and was called only by tests and scripts, so the
          // production tables could only ever be filled by hand — which is why nothing could
          // accumulate across sessions no matter how correct the extractor was.
          //
          // 🔴 THE SAME FUNCTION A SECOND CANVAS CALLS ON OPEN, AND THAT IS WHY IT CONVERGES.
          // Attaching here and resolving there are the identical path over the identical source,
          // so both land on the same identity keys and therefore the same rows. A bespoke
          // extract-on-attach would be a second implementation of the step the cross-session claim
          // rests on, free to drift from it by one edit.
          //
          // Deliberately BEST-EFFORT and after the canvas has already been updated: a learner
          // whose material is attached and readable must not lose the attachment because the
          // knowledge layer had a bad day. §13 — "semantic extraction failed" must never be
          // reported as "file upload failed". What fails here costs adaptation, not the lesson.
          if (canonical.ok && extracted.librarySourceId) {
            void (async () => {
              // No bypass here on purpose: attaching a file is not a request to run the policy on
              // material it cannot teach, so the ordinary rule decides whether anything is stored.
              const resolved = await ensureKnowledgeForCanvas(uid, latest.current);
              canvasCapture("knowledge_extracted", latest.current, {
                objectives: resolved.objectives.length,
                outcome: resolved.outcome,
                // 🔴 LOGGED, BECAUSE `objectives: 0` NO LONGER MEANS EXTRACTION FOUND NOTHING.
                // Knowledge is stored only for a canvas the policy owns, so a mixed document now
                // reports zero objectives having extracted plenty — and without these three fields
                // that reads in production as a broken extractor rather than a deliberate refusal.
                owned: resolved.ownership.owns,
                refusal: resolved.ownership.refusal,
                substantiveUnits: resolved.coverage.substantive,
                unrepresentedUnits: resolved.coverage.unrepresented,
              });
            })();
          }

          canvasCapture("source_attached", latest.current, {
            kind: source.kind,
            excerpts: source.excerpts.length,
            chars: extracted.text.length,
            // Logged so the proportion of canvases running on a degraded parse is findable in
            // production without a student having to report one.
            durability: extracted.librarySourceId ? "durable" : "ephemeral",
            grounding: canonical.ok ? "canonical" : extracted.model ? "response-model" : "text",
            ...(canonical.ok ? { quality: canonical.context.quality } : {}),
          });
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Nemesis couldn't read that file.");
      } finally {
        setBusy({ kind: null });
      }
    },
    [requireUid, update],
  );

  /**
   * Read a web page and file it as a source.
   *
   * 🔴 THE SCRAPE ROUTE IS SHARED, NOT NOTEBOOK-SPECIFIC. `/api/notebooks/extract/url` fetches a
   * URL and returns plain text; nothing about its implementation reads or writes a notebook, and
   * `components/workspace/notebooks/notebook-source-actions.ts` already calls it as exactly that,
   * a generic "read this page" utility. A second route with the identical body would be the same
   * Firecrawl call behind a different path for no reason.
   *
   * 🔴 THE URL IS PROVENANCE, NOT SOURCE CONTENT. `CanvasSource.sourceUrl` carries it separately,
   * so the learner can reopen the page without teaching the extractor the synthetic claim
   * `Source: https://...`. The scraped body remains exactly the body the page reader returned.
   */
  const attachUrl = useCallback(
    async (rawUrl: string) => {
      const id = requireUid();
      if (!id) return;
      const url = rawUrl.trim();
      if (!url) return;
      setError(null);
      setBusy({ kind: "source", label: "Reading that page" });
      try {
        const key = await deviceKey(id);
        if (!key) throw new Error("Sign in to add a web link.");
        const response = await fetch("/api/notebooks/extract/url", {
          body: JSON.stringify({ url }),
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          method: "POST",
        });
        const body = (await response.json().catch(() => null)) as
          | { title?: string; text?: string; sourceUrl?: string; error?: string }
          | null;
        if (!response.ok || !body?.text) throw new Error(body?.error ?? "Nemesis couldn't read that page.");
        const promotion = prepareWebSourcePromotion({
          requestedUrl: url,
          ...(body.sourceUrl ? { returnedUrl: body.sourceUrl } : {}),
          text: body.text,
          ...(body.title ? { title: body.title } : {}),
        });
        // The identical door every other material lane already shares (see the file-level
        // comment on `attachFiles` above): filing, knowledge extraction and every later reader
        // treat this exactly as they would a learner's own uploaded text file.
        await attachFiles(
          [new File([promotion.content], promotion.fileName, { type: "text/markdown" })],
          promotion.sourceUrl,
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Nemesis couldn't read that page.");
        setBusy({ kind: null });
      }
    },
    [attachFiles, requireUid],
  );

  /** Start learning. The topic is passed in rather than set first and read back:
   *
   *  🔴 `setTopic(t); begin();` looked fine and was a race. `latest.current` is only written
   *  inside the `setCanvas` updater, and React runs that eagerly only when the fiber has no
   *  pending work — which the active-time interval routinely creates. So the topic-first entry
   *  path (§6B, one of the two documented ways in) intermittently read a canvas with no title
   *  and refused with "Add material, or say what you want to learn." Taking the topic as an
   *  argument removes the ordering dependency instead of narrowing the window. */
  // ------------------------------------------------------------------- lesson

  /**
   * Open the canvas.
   *
   * 🔴 IT GENERATES NOTHING TO READ — §24, AND IT IS THE WHOLE POINT OF THIS FUNCTION NOW.
   *
   *     "Source ingestion is not source summarization."
   *     "The first generated artifact is normally a diagnostic, not a document overview."
   *
   * Uploading a lecture used to call `generateLesson`, which wrote 8-25 headed paragraphs, and the
   * owner's own canvas opened on a heading reading "What this document covers" followed by a
   * summary of material they had just handed us. Nemesis was telling a learner what was in their
   * document before finding out what they already understood.
   *
   * Both ways in now do the same thing here: move out of the pre-content state and let the policy
   * runtime ask. `ensureKnowledgeForCanvas` runs on every canvas already, so there is nothing to
   * await and no second path to keep in step.
   *
   * 🔴 REMOVING THIS CALL ALONE WOULD HAVE SHIPPED A BLANK PAGE, WHICH IS WHY THE KNOWLEDGE CHANGE
   * IS IN THE SAME PR. `extractKnowledgeObjects` is a structured-table lane; the owner's 15-page
   * lecture has `table_count: 0` in its stored parse, so it minted zero objectives and the policy
   * had nothing to ask. `canvas-knowledge.ts` now reads such a document with the same constructor
   * the topic lane uses, so there is a question waiting where the summary used to be.
   *
   * 🔴 "SUMMARIZE THIS" IS UNAFFECTED AND MUST STAY THAT WAY. §24 keeps that path explicitly. It
   * runs through `command()` below, which asks for the summary the learner actually requested,
   * grounded in their sources. What is gone is producing one nobody asked for.
   *
   * `level` is optional and is only ever a level the learner actually expressed.
   */
  const openCanvas = useCallback(
    async (level?: CanvasLevel) => {
      const id = requireUid();
      if (!id) return;
      if (level) update((current) => ({ ...current, level }));
      setError(null);
      update((current) => ({ ...current, state: "learn" }));
    },
    [requireUid, update],
  );

  /**
   * Open the canvas by DOING something with the material, rather than by asking the learner to
   * classify themselves first.
   *
   * 🔴 THIS USED TO ROUTE INTO `orient`, AND `orient` WAS A WALL. The composer was hidden while it
   * showed (`showComposer` excluded the state), so the only way into a canvas was to pick one of
   * four labels — "Start from fundamentals", "I know the basics", "Advanced", "Exam-focused" —
   * before Nemesis had used a single thing it already knew. That is the six-stage machine's defect
   * at a different scale: a route decided before anything about the learner was established.
   *
   * It is also a bad input. Two people who choose "I know the basics" know completely different
   * things, and neither answer says which concepts are solid, which have decayed, or which
   * misconception is in the way. Those are discovered from what someone DOES.
   *
   * 🔴 WHAT THIS IS NOT, YET. A real `initializeCanvas` reads learner state, objective state,
   * recent evidence and the calendar, and picks the opening action from them. None of those exist
   * yet — so this does the honest version: it starts from the SOURCE and the learner's own words,
   * and asks nothing. When the policy lands it replaces the call below; it does not have to undo a
   * question we should never have asked.
   */
  const begin = useCallback(
    (topic?: string) => {
      const title = topic?.trim() ?? "";
      const check = canStart({ sources: latest.current.sources, title: title || latest.current.title });
      if (!check.ok) {
        setError(check.reason);
        return;
      }
      if (title) update((current) => ({ ...current, title }));

      /**
       * 🔴 A TOPIC WITH NO MATERIAL USED TO OPEN AN EMPTY ROOM. Measured in production: "Teach me
       * innate immunity." set a title and a state, and every step after that reads KNOWLEDGE, which
       * is built from SOURCES — of which there were none. The learner asked to be taught and got
       * *"Nemesis has your material but hasn't found anything to ask you about yet."*
       *
       * So ground it first: one search, a few pages, promoted through `attachUrl` — the SAME door
       * `learnFromAside` already uses and the same door an uploaded lecture goes through. There is
       * one ingestion pipeline and one knowledge substrate; only where the material came from
       * differs.
       *
       * 🔴 AND IT OPENS THE CANVAS EITHER WAY. If the search returns nothing usable, the learner
       * still lands in their canvas and can attach something — the old empty state, reached
       * honestly, rather than a spinner that never resolves. Grounding is a best effort on the way
       * in, never a gate.
       */
      const ground = async () => {
        const id = requireUid();
        if (id && needsGrounding({ attachedSources: latest.current.sources.length, topic: title })) {
          setBusy({ kind: "source", label: "Finding material on that" });
          try {
            const found = await searchWebContext(id, groundingQuery(title));
            const chosen = groundingSources(found.sources);
            // 🔴🔴 ONE PAGE PER `try`, NOT ONE `try` AROUND THE WHOLE LOOP. With a cap of three this
            // barely mattered; with the cap removed (owner call, 2026-08-19) a single unreachable
            // page part-way down the list would have aborted every page after it, and the outer
            // catch would have swallowed that silently — so a topic would ground on four pages
            // instead of twelve and look exactly like a topic that only had four. The failure this
            // prevents is the one that reads as "he took the cap off and it stopped working".
            let promoted = 0;
            for (const source of chosen) {
              try {
                await attachUrl(source.url);
                promoted += 1;
              } catch {
                // This page could not be read. The others still can.
              }
            }
            canvasCapture("canvas_topic_grounded", latest.current, {
              // 🔴 WHAT LANDED, NOT WHAT WAS CHOSEN. The old line recomputed `groundingSources` and
              // reported its length, so the number recorded was how many pages we MEANT to read —
              // which is the same number whether ingestion worked or every page failed.
              offered: chosen.length,
              promoted,
            });
          } catch {
            // Nothing usable came back. The canvas still opens; see the note above.
          }
          setBusy({ kind: null });
        }
        // The learner's own words are the goal signal. "Teach me organic chemistry from scratch"
        // already says where to start, so there is nothing left to ask them.
        await openCanvas();
      };
      void ground();
    },
    [attachUrl, openCanvas, requireUid, update],
  );

  /**
   * A canvas stored at `orient` is one that never got past the level picker. Start it.
   *
   * 🔴 WITHOUT THIS THOSE CANVASES BECOME DEAD ENDS. `orient` was only ever escapable by choosing
   * one of four labels, and that screen is gone — so a canvas sitting in that state has no forward
   * path at all and would open to an empty page for ever. Old rows must keep working; that is the
   * whole reason `orient` survives in the state union rather than being deleted from it.
   *
   * Guarded on having produced NOTHING, so this can only ever fire for a canvas that genuinely
   * never ran. A ref rather than state, because the effect must not re-fire while the generation it
   * started is still in flight.
   */
  const resumedOrient = useRef(false);
  useEffect(() => {
    if (!ready || resumedOrient.current) return;
    const current = latest.current;
    if (current.state !== "orient") return;
    if (current.blocks.length > 0 || current.recall.length > 0 || current.questions.length > 0) return;
    resumedOrient.current = true;
    void openCanvas();
  }, [openCanvas, ready]);

  // ----------------------------------------------------------------- commands

  const command = useCallback(
    async (text: string, selected: readonly CanvasBlock[]) => {
      const id = requireUid();
      if (!id || !text.trim()) return;
      setError(null);
      setAside(null);
      setBusy({
        kind: "command",
        blockIds: selected.map((block) => block.id),
        label: selected.length ? "Rewriting" : "Updating",
      });
      const result = await runCommand(id, latest.current, text.trim(), selected);
      setBusy({ kind: null });
      if (!result.value) {
        setError(result.error);
        return;
      }
      update((current) => applyOps(current, result.value ?? []));
      canvasCapture("canvas_section_rewritten", latest.current, {
        scoped: selected.length > 0,
        selected: selected.length,
        applied: result.value.length,
        rejected: result.rejected,
      });
    },
    [requireUid, update],
  );

  /** Questions that do not change the page. Answered in a popover that disappears — the whole
   *  point of §4 is that asking does not build a transcript down the side of the document. */
  const askAbout = useCallback(
    async (block: CanvasBlock, question: string) => {
      const id = requireUid();
      if (!id) return;
      setError(null);
      setBusy({ kind: "command", blockIds: [block.id], label: "Looking" });
      const result = await explainBlock(id, latest.current, block, question);
      setBusy({ kind: null });
      if (!result.value) setError(result.error);
      else setAside({ text: result.value, blockId: block.id });
    },
    [requireUid],
  );

  /**
   * One conversational turn: read it, say something, and do what it asked for.
   *
   * 🔴🔴 THE MODEL DECIDES WHAT THE TURN MEANT; THIS FUNCTION DECIDES WHAT THAT CAN DO. Those are
   * different jobs and keeping them apart is the whole point. `askCanvasChat` comes back with
   * "reply" or "study" — an intent, in the learner's terms. Which mechanism a "study" turn reaches
   * is not the model's to pick, because it depends on a fact the canvas already holds and the
   * model would only be guessing at: a canvas that has not begun starts a session, and a canvas
   * that has steers the study document it already owns. Handing that choice to the model would be
   * asking it to rediscover something the software knows for certain.
   *
   * 🔴 SAME `aside` STATE `askAbout` USES, `blockId: null`. Two answer stores would have meant two
   * places contract rule 2's "clears on the next turn" rule had to be implemented, and the second
   * one would have been the one nobody remembered to wire up. `learning-canvas.tsx`'s
   * `applyExplanationEvent` already clears any non-null `aside` on `new_turn`; it does not
   * distinguish which of the two callers set it, and it does not need to.
   *
   * 🔴 A `study` TURN THAT REACHES `command` SETS NO ASIDE, BECAUSE `command` CLEARS ONE. The
   * document rewriting itself IS the reply there, and a sentence that appeared for an instant and
   * then vanished under the write would read as a glitch rather than as an answer.
   */
  const converse = useCallback(
    async (
      question: string,
      surroundings: TurnSurroundings,
      onStudyDocument?: () => void,
    ): Promise<TurnDecision | null> => {
      const id = requireUid();
      if (!id) return null;
      const said = question.trim();
      if (!said) return null;
      setError(null);
      setBusy({ kind: "command", blockIds: [], label: "Thinking" });
      const result = await askCanvasChat(id, latest.current, said, surroundings);
      setBusy({ kind: null });
      const decision = result.decision;
      if (!decision) {
        setError(result.error ?? "Nemesis had nothing to add.");
        return null;
      }

      if (decision.then === "study") {
        // 🔴 THE LEARNER'S OWN WORDS, KEPT FOR THIS SITTING ONLY. The teaching controller needs to
        // know the difference between "teach me glycolysis" and "quiz me on glycolysis", which the
        // topic alone cannot carry — both reduce to "glycolysis". Not persisted and not written to
        // the canvas: it describes how this session opened, and a stored one would still be
        // steering the controller next week. See `TeachingContext.opening`.
        setOpening(said);
        // 🔴 `isPreContent` RATHER THAN `state === "empty"`, WHICH IS THE PREDICATE THE COMPOSER
        // ALREADY USES for "this canvas has not begun". The old rule here was `=== "empty"`, so
        // "teach me this" typed on a canvas with a file attached but no lesson yet fell through to
        // a document command instead of starting one. One predicate, one meaning.
        if (isPreContent(latest.current.state)) {
          if (decision.say) {
            setAside({ blockId: null, offer: decision.offer ?? undefined, question: said, sources: [], text: decision.say });
          }
          begin(decision.topic ?? said);
        } else {
          // 🔴 STAMPED BEFORE THE WRITE, NOT AFTER IT. `materialOwnsAttention` compares the action
          // that was in flight WHEN THE LEARNER ASKED against the one in flight now; reading it
          // after the round trip would record whichever action the policy had moved on to.
          onStudyDocument?.();
          await command(said, []);
        }
        return decision;
      }

      // 🔴 THE ANSWER COMES BACK IN FULL, WHATEVER THE OFFER SAYS. `offer` changes one line of copy
      // above a button the learner may ignore; it never shortens or withholds what they asked for.
      // Offering is not seizing.
      if (!decision.say) {
        setError("Nemesis had nothing to add.");
        return null;
      }
      setAside({
        blockId: null,
        offer: decision.offer ?? undefined,
        question: said,
        sources: result.sources,
        text: decision.say,
        topic: decision.topic ?? undefined,
      });
      return decision;
    },
    [begin, command, requireUid],
  );

  /**
   * Cross the boundary from information to learning only after the learner asks to.
   *
   * Ordinary questions remain ordinary answers. This action is the strong contextual evidence
   * that the same question should now become a learning goal. Any live pages the answer actually
   * cited are ingested through `attachUrl`, so web-grounded learning and uploaded-course learning
   * converge on the same durable source and knowledge substrate.
   */
  const learnFromAside = useCallback(async () => {
    const current = aside;
    if (!current || current.blockId !== null) return;
    // 🔴 THE SUBJECT THE MODEL READ, FALLING BACK TO WHAT THEY TYPED. `begin` takes this as the
    // canvas TITLE, so starting from the raw question left canvases called "what is incretin?".
    const topic = (current.topic ?? current.question ?? "").trim();
    if (!topic) return;
    const sources = current.sources ?? [];
    setAside(null);
    for (const source of sources) await attachUrl(source.url);
    canvasCapture("canvas_learning_started_from_answer", latest.current, { webSources: sources.length });
    begin(topic);
  }, [aside, attachUrl, begin]);

  const markKnown = useCallback(
    (blockId: string, known: boolean) => {
      update((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, known } : block)),
      }));
    },
    [update],
  );

  const toggleCollapsed = useCallback(
    (blockId: string, collapsed: boolean) => {
      update((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, collapsed } : block)),
      }));
    },
    [update],
  );

  // ------------------------------------------------------------------- recall

  // 🔴 THE SIX-STAGE ENTRY POINTS ARE DELETED (owner, §38): startRecall, startTest, startRetest,
  // startChoiceTest, finishTest, relearn and finish. Each had exactly ONE call site, all inside the
  // handler behind "Retest me" / "Fix my weak spots" / "I've read this" — controls #585 proved
  // unreachable in every observable state, and which the owner has now ruled out by description:
  // "The only button should be 'continue' below reading passages, thats it."
  //
  // Nothing routes to them any more. The reading-pace half came back as `Continue` (§38/§39); the
  // rest are behaviours the system owes automatically — §18 makes re-testing its job and objective
  // ordering already targets weak spots — so a button for either was the learner managing the
  // learning system (§26).

  const gradeRecall = useCallback(
    async (
      cardId: string,
      grade: "again" | "hard" | "good" | "easy",
      evidence?: {
      said?: string;
      via?: LearnerInputModality;
      revealed?: boolean;
      evaluation?: ResponseEvaluation;
    },
    ) => {
      const card = latest.current.recall.find((candidate) => candidate.id === cardId);
      // The same Postgres function the Study tab grades through, so the scheduling is real.
      void gradeStudyCard(card?.studyCardId, grade);
      update((current) => {
        const recallResults = [
          ...current.recallResults.filter((result) => result.cardId !== cardId),
          {
            cardId,
            conceptId: card?.conceptId ?? null,
            at: new Date().toISOString(),
            grade,
            ...(evidence ?? {}),
          },
        ];
        // The deck is finished the moment the last card is graded — the funnel needs the
        // "got through recall" number, not just the "started recall" one.
        if (current.recall.length > 0 && recallResults.length >= current.recall.length) {
          canvasCapture("canvas_recall_completed", current, {
            cards: current.recall.length,
            again: recallResults.filter((result) => result.grade === "again").length,
          });
        }
        return { ...current, recallResults };
      });
    },
    [update],
  );

  /** Retrieval by producing something, rather than by revealing and marking yourself (§31).
   *
   *  🔴 THE ORDER HERE IS THE ARCHITECTURE. The performance is evaluated first, that evidence is
   *  what gets stored, and only then is a review grade derived from it. Deriving the grade first
   *  and keeping only that would leave a spaced-repetition app with a text box on it — the
   *  evaluation is the thing Nemesis is actually for. */
  const attemptRecall = useCallback(
    async (cardId: string, text: string, via: LearnerInputModality) => {
      const said = text.trim();
      if (!said) return;
      const card = latest.current.recall.find((candidate) => candidate.id === cardId);
      if (!card) return;

      const id = requireUid();
      if (!id) {
        await gradeRecall(cardId, deriveSchedulingSignal({ evaluation: null }).grade, { said, via });
        return;
      }

      recordEvent({
        type: "response_submitted",
        ...(card.conceptId ? { conceptIds: [card.conceptId] } : {}),
        payload: { via, stage: "recall" },
      });

      setJudging(cardId);
      const result = await evaluateLearningResponse(
        id,
        latest.current,
        cardAsTask(latest.current, card, { text: said, via }),
      );
      setJudging(null);

      const evaluation = result.value;
      if (!evaluation) canvasCapture("canvas_judge_failed", latest.current, { cardId });
      else {
        canvasCapture("canvas_response_judged", latest.current, {
          verdict: evaluation.verdict,
          errorType: evaluation.errorType ?? null,
          confidence: evaluation.confidence,
          via,
          conceptId: card.conceptId,
          stage: "recall",
        });
      }

      // Earlier successful retrievals of this same idea, from previous rounds on this canvas.
      // This is what separates "right just now" from "right again", and without it the
      // scheduler could never award Easy — the rule would exist only in its tests.
      //
      // `timeSinceLastExposureMs` is deliberately NOT passed: nothing on a RecallResult records
      // when it happened, and inventing a gap from the canvas's own timestamps would be a
      // guess dressed as a measurement. Repeat success is the honest half of the same test.
      const priorSuccesses = card.conceptId
        ? latest.current.recallResults.filter(
            (entry) =>
              entry.cardId !== cardId &&
              entry.conceptId === card.conceptId &&
              entry.evaluation &&
              verdictIsPass(entry.evaluation.verdict),
          ).length
        : 0;

      const signal = deriveSchedulingSignal({ evaluation, hintsUsed: 0, priorSuccesses });
      await gradeRecall(cardId, signal.grade, {
        said,
        via,
        ...(evaluation ? { evaluation } : {}),
      });
    },
    [gradeRecall, recordEvent, requireUid],
  );

  /** They asked to see the answer instead of attempting it.
   *
   *  §7: that is itself evidence — we did not obtain a retrieval — and it is recorded as such.
   *  The learner is deliberately NOT asked how well they knew it afterwards: someone who has
   *  just read the answer is the worst available judge of whether they could have produced it,
   *  and asking puts the metacognitive work back on them for a worse signal than we already have. */
  const revealRecall = useCallback(
    async (cardId: string) => {
      const signal = deriveSchedulingSignal({ evaluation: null, revealed: true });
      await gradeRecall(cardId, signal.grade, { revealed: true });
    },
    [gradeRecall],
  );

  // --------------------------------------------------------------------- test

  const runTest = useCallback(
    async (state: "test" | "retest", format: RetrievalFormat = "free") => {
      // Retired — see `startRecall`. This one call covers `startTest`, `startRetest` AND
      // `startChoiceTest`, which all delegate here, so there is no fourth entrance behind them.
      if (!canTransition(latest.current.state, state)) return;
      const id = requireUid();
      if (!id) return;
      setError(null);
      setBusy({ kind: "test", label: state === "retest" ? "Writing your retest" : "Writing your test" });
      const retest = state === "retest";
      const result = await generateTest(
        id,
        latest.current,
        retest ? RETEST_QUESTIONS : TEST_QUESTIONS,
        format,
        retest ? latest.current.weakConceptIds : undefined,
      );
      setBusy({ kind: null });
      if (!result.value) {
        setError(result.error);
        canvasCapture("canvas_generation_failed", latest.current, { stage: state, format });
        return;
      }
      captureStateChange(latest.current, "test");
      setCursor(0);
      update((current) => ({
        // A retest replaces the evidence about the concepts it re-assesses — including the
        // recall grades. Without that a single "Again" kept a concept weak forever and the
        // canvas could never be finished.
        //
        // The plain-test branch clears responses alongside answers for the same reason: a new
        // set of questions makes the old ones' evidence stale, and evidence that outlives its
        // round is what made this state unreachable the first time.
        ...(retest
          ? clearEvidenceForRetest(current, current.weakConceptIds)
          : { ...current, answers: [], responses: [] }),
        questions: result.value ?? [],
        state,
      }));
    },
    [requireUid, update],
  );


  const answer = useCallback(
    (questionId: string, picked: number) => {
      update((current) => {
        const question = current.questions.find((candidate) => candidate.id === questionId);
        // Only a choice question has an option to have picked. A stray call against a free
        // prompt is a bug upstream, and scoring it against `undefined` would silently mark it
        // wrong rather than showing that bug.
        if (!question || question.format !== "choice") return current;
        return {
          ...current,
          answers: [
            ...current.answers.filter((entry) => entry.questionId !== questionId),
            { questionId, picked, correct: picked === question.answer },
          ],
        };
      });
    },
    [update],
  );

  /** Record what the learner said, then ask the judge what it showed.
   *
   *  The answer is stored BEFORE the model is called and is never removed if the call fails.
   *  Someone who just explained something at length must not lose their words because a judge
   *  timed out — an unjudged response simply carries no evidence (see diagnose). */
  const respond = useCallback(
    async (questionId: string, text: string, via: LearnerInputModality, tookMs?: number) => {
      const said = text.trim();
      if (!said) return;

      const question = latest.current.questions.find((candidate) => candidate.id === questionId);
      if (!question || question.format !== "free") return;

      update((current) => ({
        ...current,
        responses: [
          ...current.responses.filter((entry) => entry.questionId !== questionId),
          {
            questionId,
            // Captured here, not derived later: the question this came from is replaced on the
            // next round, and by then nothing can say what this answer was evidence about.
            ...(question.conceptId ? { objectiveIds: [question.conceptId] } : {}),
            at: new Date().toISOString(),
            text: said,
            via,
            ...(tookMs !== undefined ? { tookMs } : {}),
          },
        ],
      }));

      recordEvent({
        type: "response_submitted",
        ...(question.conceptId ? { conceptIds: [question.conceptId] } : {}),
        payload: { via, stage: "test", ...(tookMs !== undefined ? { tookMs } : {}) },
      });

      const id = requireUid();
      if (!id) return;
      setJudging(questionId);
      const result = await evaluateLearningResponse(
        id,
        latest.current,
        questionAsTask(latest.current, question, { text: said, via, ...(tookMs !== undefined ? { tookMs } : {}) }),
      );
      setJudging(null);

      if (!result.value) {
        // Deliberately not surfaced as a page error: the learner did their part, and "we could
        // not read that" is a fact about us, not a verdict about them.
        canvasCapture("canvas_judge_failed", latest.current, { questionId });
        return;
      }

      const evaluation = result.value;
      canvasCapture("canvas_response_judged", latest.current, {
        verdict: evaluation.verdict,
        errorType: evaluation.errorType ?? null,
        confidence: evaluation.confidence,
        via,
        conceptId: question.conceptId,
        stage: "test",
      });
      update((current) => ({
        ...current,
        responses: current.responses.map((entry) =>
          entry.questionId === questionId ? { ...entry, evaluation } : entry,
        ),
      }));

      // ── The teaching loop ────────────────────────────────────────────────
      //
      // 🔴 This is the step that makes the canvas adaptive rather than a graded quiz. The
      // decision is deterministic — the evaluation already says what was demonstrated, what was
      // missing and which false belief appeared, so no second model call is spent working out
      // what to do. A model is used only to WRITE the correction, once the action is chosen.
      const objectiveId = question.conceptId;
      const action = determineNextCognitiveAction({
        evaluation,
        attempts: latest.current.correctiveAttempts[objectiveId ?? ""] ?? 0,
      });
      canvasCapture("canvas_action_chosen", latest.current, {
        action: action.type,
        because: action.because,
        verdict: evaluation.verdict,
        conceptId: objectiveId,
      });
      if (!actionMutatesCanvas(action) || !objectiveId) return;

      setBusy({ kind: "relearn", label: "Working through that with you" });
      const change = await applyTeachingAction(id, latest.current, {
        action,
        objectiveId,
        prompt: question.q,
        said,
        demonstrated: evaluation.demonstrated,
      });
      setBusy({ kind: null });
      if (!change.value) return;

      const { ops, followUp } = change.value;
      // What the correction actually said, so it can sit beside their answer as well as in the
      // document. Taken from the ops we just validated rather than asked for separately.
      const taught = ops
        .map((op) =>
          op.operation === "replace_block"
            ? op.content
            : op.operation === "insert_before" || op.operation === "insert_after"
              ? op.block.content
              : op.operation === "annotate_block"
                ? op.note
                : "",
        )
        .filter(Boolean)
        .join("\n\n");

      update((current) => {
        const mutated = applyOps(current, ops);
        // The follow-up goes immediately after the prompt it follows up, so "Next" lands on it
        // rather than on whatever the generator happened to put there.
        const at = current.questions.findIndex((entry) => entry.id === questionId);
        const questions = followUp
          ? [
              ...current.questions.slice(0, at + 1),
              followUp,
              ...current.questions.slice(at + 1),
            ]
          : current.questions;
        return {
          ...mutated,
          questions,
          correctiveAttempts: {
            ...current.correctiveAttempts,
            [objectiveId]: (current.correctiveAttempts[objectiveId] ?? 0) + 1,
          },
          responses: current.responses.map((entry) =>
            entry.questionId === questionId
              ? {
                  ...entry,
                  action: action.type,
                  ...(taught ? { taught } : {}),
                  ...(followUp ? { followUpQuestionId: followUp.id } : {}),
                }
              : entry,
          ),
        };
      });
    },
    [recordEvent, requireUid, update],
  );


  // ---------------------------------------------------------------- relearn



  const reset = useCallback(() => {
    const fresh = newCanvas();
    latest.current = fresh;
    setCanvas(fresh);
    canvasCapture("canvas_created", fresh);
  }, []);

  // ── The one thing being asked, and the one way to answer it ─────────────
  //
  // Derived rather than stored: the prompts themselves live on the canvas, the cursor says
  // which one, and everything else follows. Storing a duplicate of the current prompt would be
  // one more thing to keep in step with a document the teaching loop rewrites mid-round.
  const activeTask: ActiveTask | null = (() => {
    if (canvas.state === "recall") {
      const card = canvas.recall[cursor];
      if (!card) return null;
      return {
        kind: "recall",
        id: card.id,
        prompt: card.front,
        placeholder: RECALL_PLACEHOLDER,
        index: cursor,
        total: canvas.recall.length,
        answered: canvas.recallResults.some((entry) => entry.cardId === card.id),
      };
    }
    if (canvas.state === "test" || canvas.state === "retest") {
      const question = canvas.questions[cursor];
      if (!question) return null;
      return {
        kind: "question",
        id: question.id,
        prompt: question.q,
        // A multiple-choice prompt is answered by picking, not by typing, so the composer stays
        // a place to ask about it rather than pretending to be the answer field.
        placeholder: question.format === "free" ? RESPONSE_PLACEHOLDER[question.task] : "",
        index: cursor,
        total: canvas.questions.length,
        answered:
          question.format === "choice"
            ? canvas.answers.some((entry) => entry.questionId === question.id)
            : canvas.responses.some((entry) => entry.questionId === question.id),
      };
    }
    return null;
  })();

  // Read through a ref for the same reason `latest` exists: these handlers are called from
  // async paths and from event listeners, where a value captured at render time can already be
  // a round out of date.
  const activeTaskRef = useRef(activeTask);
  activeTaskRef.current = activeTask;

  const advanceTask = useCallback(() => setCursor((current) => current + 1), []);

  const answerActiveTask = useCallback(
    async (text: string, via: LearnerInputModality, tookMs?: number) => {
      const task = activeTaskRef.current;
      if (!task || task.answered) return;
      if (task.kind === "recall") await attemptRecall(task.id, text, via);
      else await respond(task.id, text, via, tookMs);
    },
    [attemptRecall, respond],
  );

  /** §24: not the same thing as showing the answer. "I don't know" is the learner reporting
   *  their state, which is evidence; a reveal shortcut only records that they read something.
   *  Either way no retrieval was obtained, so the scheduler hears the same thing — but this
   *  path is chosen deliberately rather than reached by pressing space. */
  const admitUnknown = useCallback(async () => {
    const task = activeTaskRef.current;
    if (!task || task.answered) return;
    canvasCapture("canvas_unknown_admitted", latest.current, { kind: task.kind, id: task.id });
    recordEvent({ type: "unknown_admitted", payload: { kind: task.kind, id: task.id } });
    if (task.kind === "recall") await revealRecall(task.id);
    else await respond(task.id, "I don't know.", "typed");
  }, [recordEvent, respond, revealRecall]);

  /** The fast path from "I don't understand this bit" to an answer, without leaving the page.
   *
   *  🔴 Only "simpler" is allowed to touch the document, and only the one block the selection
   *  came from. Everything else answers in a popover: looking up a word must not move the
   *  paragraph the learner is looking at. */
  const askAboutSelection = useCallback(
    async (selection: CanvasSelection, action: SelectionAction) => {
      const id = requireUid();
      if (!id) {
        // 🔴 Also reported in the popover, not only in the page-level error strip. The learner
        // asked about one word and is looking at that word; an explanation that appears at the
        // bottom of the screen is an explanation they will not connect to what they just did.
        setSelectionError("Sign in to use the canvas.");
        return null;
      }
      setSelectionError(null);
      setSelectionBusy(true);

      recordEvent({
        type:
          action === "define"
            ? "definition_opened"
            : action === "simpler"
              ? "simplification_requested"
              : action === "example"
                ? "example_requested"
                : action === "why"
                  ? "why_requested"
                  : "explanation_requested",
        ...(selection.blockId ? { blockId: selection.blockId } : {}),
        ...(selection.conceptIds ? { conceptIds: selection.conceptIds } : {}),
        selectedText: selection.selectedText,
      });

      if (action === "simpler") {
        // 🔴 THE PASSAGE SHOWS THE WORK, NOT THE POPOVER (§11). `setSelectionBusy` drives the
        // toolbar the learner just clicked; on its own it left the paragraph — the thing actually
        // being rewritten — looking untouched until the new wording appeared out of nowhere.
        if (selection.blockId) setBusy({ blockIds: [selection.blockId], kind: "rewrite" });
        const result = await simplifySelection(id, latest.current, selection);
        setSelectionBusy(false);
        setBusy({ kind: null });
        if (!result.value) {
          setSelectionError(result.error);
          return null;
        }
        // 🔴 `applyRewrite`, NOT `applyOps` — and the difference is a field that already existed
        // and was being thrown away. `simplifySelection` has always returned `before`, captured at
        // the moment of the write with the comment *"once the ops are applied the original wording
        // is gone and no later step can reconstruct it"*. Nothing read it. §11's *"keep the old
        // version internally so it can be restored"* was one assignment away the whole time.
        const rewrite = result.value;
        update((current) => applyRewrite(current, rewrite));
        return null;
      }

      const result = await explainSelection(id, latest.current, selection, action);
      setSelectionBusy(false);
      if (!result.value) {
        setSelectionError(result.error);
        return null;
      }
      return result.value;
    },
    [recordEvent, requireUid, update],
  );

  /**
   * §12 — the learner says they have finished the chunk on screen.
   *
   * 🔴 TWO STORES, KEPT APART FROM THE FIRST LINE. The STATE (which material has been read) goes
   * on the block; the TIMING goes in the interaction log and nowhere else. §25 says the timing may
   * later be useful evidence about difficulty, and R3 says the reading itself is not evidence of
   * knowledge — so the timing must land somewhere that provably cannot become a verdict.
   * `canvas-events.ts` is exactly that place: it carries `activeElapsedMs` already (active time,
   * not wall clock, so walking away for 25 minutes does not read as deep thought), and
   * `canvas-events.test.ts` appends fifty events and asserts `diagnose()` is unchanged. Nothing
   * here can reach a judgement, and that is enforced rather than intended.
   *
   * 🔴 IT WRITES NO `learner_evidence`. Reading is not demonstration. `recordEvent` and
   * `recordEvidence` are different functions with different stores, and this calls the first.
   */
  const finishReadingChunk = useCallback(() => {
    recordEvent({ type: "reading_finished" });
    update((current) => finishReading(current, new Date().toISOString()));
  }, [recordEvent, update]);

  /** §11 — put a rewritten passage back the way it was written. Local, immediate and free: the
   *  previous wording is already on the block, so this costs no model call and cannot fail. */
  const restoreRewritten = useCallback(
    (blockId: string) => {
      recordEvent({ blockId, type: "simplification_restored" });
      update((current) => restoreBlock(current, blockId));
    },
    [recordEvent, update],
  );

  return {
    canvas,
    busy,
    error,
    aside,
    judging,
    opening,
    ready,
    dismissError: () => setError(null),
    /**
     * Say something short and true to the learner that is NOT a failure.
     *
     * 🔴 IT SHARES THE ERROR STRIP DELIBERATELY, AND THAT IS A DESIGN DECISION RATHER THAN REUSE.
     * The alternative is a second floating notice surface, which means two things can be on screen
     * saying two things, and §19 asks for an interface that almost disappears. The strip is already
     * neutral rather than red — bordered, secondary text — so it reads as a notice, and it is
     * dismissible by the same control.
     *
     * The one thing this must never become is a place to report internal state. A refusal here
     * names the action that resolves it; "ambiguous referent" is not the learner's problem.
     */
    showNotice: (message: string) => setError(message),
    restoreRewritten,
    finishReadingChunk,
    dismissAside: () => setAside(null),
    attachFiles,
    attachUrl,
    begin,
    command,
    askAbout,
    converse,
    learnFromAside,
    markKnown,
    toggleCollapsed,
    gradeRecall,
    attemptRecall,
    revealRecall,
    answer,
    respond,
    activeTask,
    advanceTask,
    answerActiveTask,
    admitUnknown,
    rename: (title: string) => update((current) => ({ ...current, title: title.slice(0, 300) })),
    remove: async () => {
      // Written through before navigating away. The debounced autosave would otherwise fire
      // after the row is already flagged deleted and quietly resurrect it.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await deleteCanvas(uid, latest.current.id);
    },
    askAboutSelection,
    recordEvent,
    selectionBusy,
    selectionError,
    clearSelectionAnswer: () => setSelectionError(null),
    reset,
  };
}

/** The extractor's own account of what it could not read, in the words the shared module
 *  already uses for exactly this — so a canvas built on a half-read lecture says so in the
 *  same terms chat does. Returns null when the file was read whole. */
function coverageNote(coverage: unknown): string | null {
  const parsed = readCoverage(coverage);
  return parsed ? coverageNoticeForModel(parsed) : null;
}
