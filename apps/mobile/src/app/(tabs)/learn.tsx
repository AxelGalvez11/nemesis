// The Canvas — the phone's front door, and the only entry path into the product.
//
// The port of the web app's `apps/web/components/workspace/learn/canvas-home.tsx` and
// `learning-canvas.tsx`. Several of its rules are decisions the owner reached on web, and
// rebuilding any of them here would undo that work, so they are repeated rather than summarised:
//
// 🔴 NOT A DASHBOARD. No greeting by name, no streak, no "cards due", no "4 sessions today".
// The first thing a student sees is the place they type, because the product's claim is that
// they should not have to decide which tool they want before they can start.
//
// 🔴 AND NOT A FILE BROWSER. This surface does not list the canvases the student already has.
// Web tried that twice — a list below the fold, then a list lifted onto the first screen — and
// both were answering the wrong question. A landing page showing somebody their backlog invites
// them to browse it; they arrive with something to learn and should start immediately. Their
// canvases live in the Library, which is one tap away — and, since this pass, that Library tap
// can actually open one (see the `c` route param below).
//
// 🔴 THE REPLY COMES THROUGH `sendChat`, i.e. THE `nemesis-llm` VALVE — NOT THE `ask` EDGE
// FUNCTION. This was wired to `api/ask.ts` first, on the assumption that the web canvas called
// the `ask` function too. It does not, and never has: the only web caller of `ask` is
// `components/WatchCurrentEvidence.tsx`, and the canvas's own lane is `nemesis-llm`
// (`apps/web/lib/workspace/chat-api.ts:43`). The mistake came from reading `/learn?ask=<topic>`
// in `canvas-home.tsx` as an edge-function name when it is a URL query parameter.
//
// It matters beyond tidiness: `ask` is a PharmaOrb-era pipeline and it is currently broken in
// production — it calls the RPC `match_core_source_chunks`, which the `drop_pharmaorb_rpcs`
// migration removed, so every authenticated call 500s. Pointing the Canvas at it would have
// shipped a front door that cannot answer. `sendChat` is the same metered valve the desktop
// uses (`lib/chat-thread.ts`), it streams, and it is demonstrably healthy.
//
// ── WHAT CHANGED IN THIS PASS (owner, 2026-08-20) ───────────────────────────────────────────
//
// 🔴 NO TITLE, ANYWHERE ("there should not be any canvas titles"). This screen used to push the
// asked question into the TopBar. It does not any more, and the line that did it is gone rather
// than commented out: a canvas's name is how it is FOUND in the Library, not a heading on the
// thing itself. `setHeaderTitle(null)` is still called, and called deliberately — the shell's
// title is shared state, so a screen that simply never writes it inherits whatever the previous
// screen left there.
//
// 🔴 THE COMPOSER IS DOCKED AT THE FOOT ON EVERY PRESENCE, INCLUDING THE LANDING — and that is a
// departure from the web, which centres the landing composer under its heading. Two reasons, and
// they are both about a phone rather than about taste. The reference the owner attached is the
// ChatGPT iOS composer, which is docked. And a composer that starts centred and travels to the
// foot the moment you send has to travel again every time the keyboard opens; on a laptop the
// keyboard is not a thing that appears. So the box holds still and the surface above it changes.
//
// 🔴 ONE CHARACTER AT A TIME, AND ITS PLACEMENT IS THE STATE. Web draws `BloubDock` and, during a
// wait, `CanvasThinkingPreview`'s mascot as well — two characters on one screen. The phone draws
// exactly one and MOVES it: it stands above the composer for the whole session, and when a turn
// is in flight with nothing yet to read it is the 128pt figure in the middle of the surface. That
// is the behaviour web's dock describes in prose ("it walks to the middle of the surface and comes
// back") without a second copy of the character to explain away. The crossfade carries the swap.
//
// 🔴 THE CHARACTER IS NOT A SPINNER, SO IT DOES NOT LEAVE WHEN THE WAIT ENDS. Before this pass the
// phone drew it on the landing and nowhere else, which taught the learner it was a loading
// indicator — because that is exactly what it was. Web's file says it in one line worth repeating:
// "a companion that only appears when you are waiting IS a spinner with a face."
//
// 🔴 EVERY CAPTION IS THE NAME OF A STEP THAT IS GENUINELY RUNNING. The phases come from
// `sendChat`'s own `onPhase`, through `lib/thinking-phase.ts`, whose header explains at length why
// there is no timed walk through plausible-sounding stages here and must never be one.
//
// 🔴 PHASE 2 OF A PHASED PORT. The web canvas is 46 files. This pass adds the composer, the two
// thinking previews, the crossfade, the source pills and a READER for a stored canvas. Still
// deliberately absent, because nothing behind them exists yet: the drills, the minimap and the
// recorder.
//
// ── AND WHAT CHANGED IN THIS ONE (owner, 2026-08-20) ────────────────────────────────────────
//
// 🔴🔴 THE TURN IS NOW SAVED. The line above used to end "a turn asked here is not saved back into
// a stored canvas, and no control on this screen says it is" — which was honest, and was also the
// whole of the reported bug: the phone could OPEN a canvas and never WROTE one, so "let users
// reopen canvases" had nothing of the phone's own to reopen. Every completed turn now lands in
// `public.learning_canvases` through `api/canvases.ts`'s `saveCanvasTurn`, in the exact row shape
// the web's `canvasToRow` writes.
//
// 🔴 A QUESTION ASKED FROM THE LANDING MINTS A CANVAS; FROM THEN ON THIS SCREEN IS EDITING THAT
// ONE. A question asked on a canvas opened through `?c=<id>` appends to the canvas it opened. Both
// go through one id held in `writingTo` — see its declaration for why it is a ref and not state.
//
// 🔴 THE CANVAS IS NAMED FROM WHAT THE STUDENT ASKED, ONCE. That is web's own rule arriving from
// the other side: `mergeSourceIntoCanvas` names a canvas from its first source and never renames
// it, and `begin(topic)` names it from the learner's typed words. A canvas that already has a name
// keeps it, so a rename made in either Library survives the next question asked here. The name is
// still never PAINTED on this screen — it is how a canvas is found in the Library, which is
// exactly why it has to be written even though it is never shown.
//
// 🔴 AND A SAVE THAT FAILS SAYS SO, IN THE SAME LINE EVERY OTHER FAILURE ON THIS SCREEN USES. The
// answer stays on screen either way. `saveCanvasTurn` re-reads the row after writing it and
// reports three outcomes rather than two — saved, not saved, and saved-but-unconfirmed — because
// only one of those means the text in front of the student is the only copy of it, and the student
// is the one who has to decide whether to copy it somewhere.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { speedOf, stateForCanvas } from "@nemesis/shared/character/stations";
import { BloubBot } from "@/components/bloub/BloubBot";
import { usePoke } from "@/components/bloub/use-poke";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding, useKeyboardVisible } from "@/components/shell-chrome";
import { BottomFadeBlur } from "@/components/BottomFadeBlur";
import { MessageBody } from "@/components/MessageBody";
import { CanvasComposer } from "@/components/canvas/CanvasComposer";
import { CanvasDock, DOCK_SIZE, DOCK_GAP } from "@/components/canvas/CanvasDock";
import { CanvasDocument } from "@/components/canvas/CanvasDocument";
import { CanvasFade, CanvasFadeIn } from "@/components/canvas/CanvasFade";
import { SourcesPillButton, SourcesSheet } from "@/components/SourcesSheet";
import { CanvasThinkingLine, CanvasThinkingPreview } from "@/components/canvas/CanvasThinking";
import { CANVAS_TEXT } from "@/components/canvas/canvas-metrics";
import { sourcePills } from "@/components/canvas/canvas-sources";
import { createMarkdownStyles } from "@/theme/markdown";
import { useAuth } from "@/auth/AuthProvider";
import { sendChat } from "@/api/chat";
import { DocumentError, pickAndReadDocument } from "@/api/documents";
import { blocksForAnswer, loadCanvas, mintCanvasId, saveCanvasTurn, type StoredCanvas } from "@/api/canvases";
import type { AttachedLibraryDoc, ChatMsg, ChatSource } from "@/lib/chat-thread";
import { DEFAULT_CHAT_EFFORT, type ChatEffort } from "@/lib/chat-effort";
import { phaseLabel, type ThinkingPhase } from "@/lib/thinking-phase";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

/**
 * What the surface is showing. This is the phone's `presence`, and it is the ONLY thing (with the
 * open canvas's id) that keys the crossfade.
 *
 * 🔴 `busy` AND THE STREAMED TEXT ARE DELIBERATELY NOT PART OF THE KEY, and web's
 * `learning-canvas.tsx:828` makes the same exclusion by hand. Keying on "a request is in flight"
 * fades the whole page out and back in the instant the learner presses send; keying on the answer's
 * text does it once per token. `thinking` below is not that: it is the state where there is
 * NOTHING to read, which is a genuine change of what the surface is, and it is reached at most
 * once per turn.
 */
type Presence = "landing" | "thinking" | "reading";

/**
 * How softly the bottom blur eases in on THIS surface, in points. See the `BottomFadeBlur` call.
 *
 * 🔴 IT IS THE HEIGHT OF THE CHARACTER PLUS THE GAP IT STANDS ABOVE THE COMPOSER, WHICH IS THE
 * WHOLE DERIVATION. The band's solid part now stops at the composer's top edge, so this ramp is
 * exactly the stretch the character occupies — it starts clear at the character's crown and is
 * fully solid by its feet. Picking a round number instead would put the edge somewhere arbitrary
 * on the character's face, which is the shape of the complaint being fixed. Derived rather than
 * typed so it follows the dock if either measurement ever changes.
 */
const CANVAS_FADE_SPAN = DOCK_SIZE + DOCK_GAP;

export default function CanvasScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  // The same markdown treatment every other reading surface uses (note, review, notebook), so an
  // answer looks identical wherever the student meets it.
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const keyboardUp = useKeyboardVisible();
  const { setHeaderTitle } = useShell();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  // 🔴 THE LIBRARY'S HANDLE ON THIS SCREEN. `?c=<canvas id>` — the same parameter name the web
  // route uses (`/learn?c=<id>`), so a link works on either. `chat.tsx` reads its thread id from
  // the identically named param, which is why the array form is unwrapped the same way there.
  const params = useLocalSearchParams<{ c?: string }>();
  const canvasId = (Array.isArray(params.c) ? params.c[0] : params.c) ?? null;

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string>("");
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [phase, setPhase] = useState<ThinkingPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [effort, setEffort] = useState<ChatEffort>(DEFAULT_CHAT_EFFORT);
  const [listening, setListening] = useState(false);
  const [attachedDoc, setAttachedDoc] = useState<AttachedLibraryDoc | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  // The answer block's identity — bumped once per send, never derived from the text.
  //
  // 🔴 THIS IS THE WHOLE OF REQUIREMENT "fade the block in once". `CanvasFadeIn` replays its 220ms
  // on every change of `blockKey`; anything computed from the streamed answer (its length, a hash,
  // the string itself) changes on every delta and the paragraph strobes for the length of the turn.
  const [turnId, setTurnId] = useState(0);
  // How tall the composer currently is. Measured by the composer itself and handed up, because the
  // character docks against its top edge and the box grows as the question wraps. The web dock
  // re-measures `#canvas-composer` every 120ms to get the same number; `onLayout` is the phone's
  // equivalent handle and is functional rather than cosmetic.
  const [composerHeight, setComposerHeight] = useState(0);

  // The canvas opened from the Library, if any.
  const [stored, setStored] = useState<StoredCanvas | null>(null);
  const [storedLoading, setStoredLoading] = useState(false);
  // 🔴 THREE OUTCOMES, NOT TWO. A row that is gone, a row that belongs to somebody else and a row
  // that was deleted are one sentence to a learner ("this is not here"); a transport failure is a
  // different one ("we could not reach it"), because only the second is worth retrying.
  const [storedMissing, setStoredMissing] = useState(false);

  // 🔴 NO SCROLL REF AND NO AUTO-SCROLL, WHICH IS A CHOICE RATHER THAN AN OMISSION. This screen
  // carried a `ScrollView` ref that nothing ever called; it is gone. An answer that scrolls itself
  // while it streams takes the page away from a learner who is reading the top of it, and this
  // surface renders ONE answer from the top rather than a chat log growing off the bottom, so
  // there is nothing to follow.
  // Cancels the turn in flight if the student leaves the screen mid-answer. Without it the
  // stream keeps writing into state on an unmounted component.
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  /**
   * THE CANVAS THIS SCREEN IS WRITING INTO. `null` until there is one.
   *
   * 🔴 A REF, NOT STATE, AND THAT IS DELIBERATE ON BOTH COUNTS. Nothing renders from it — the
   * canvas's name is never painted here and neither is its id — so holding it in state would buy
   * a re-render and a dependency on every keystroke of `start`'s `useCallback`. And it has to be
   * readable and writable from INSIDE a turn that is already in flight: the id is minted at the
   * moment the first answer is saved, which is after `start` closed over its dependencies.
   *
   * It is seeded from the route param, so a canvas opened from the Library is appended to rather
   * than duplicated, and cleared when that row turns out to be gone (see the load effect) so the
   * next question mints a fresh canvas instead of writing into a tombstone.
   */
  const writingTo = useRef<string | null>(canvasId);

  /**
   * The row as it stood after the last successful save — HELD BACK until the next question.
   *
   * 🔴 THE SCREEN IS NOT REDRAWN FROM THE DATABASE THE INSTANT A SAVE LANDS, AND THAT IS THE WHOLE
   * REASON THIS REF EXISTS. Swapping the live answer for the stored canvas the moment the write
   * returns would tear down the block the student is reading and fade an identical one in over it —
   * a 220ms flash, mid-sentence, as a reward for a save going well. So the saved canvas waits here
   * and is folded into `stored` at the start of the NEXT turn, when the live answer is being
   * cleared anyway. The two are never on screen together, so nothing is ever drawn twice.
   */
  const savedCanvas = useRef<StoredCanvas | null>(null);

  /** The answer as it streams. 🔴 A REF BESIDE THE STATE because the save needs the finished text
   *  synchronously at the end of the turn, and `reply` inside this closure is the value from the
   *  render that started it — always the empty string. The state is what renders; this is what is
   *  saved, and they are written together so they cannot disagree. */
  const streamed = useRef("");

  // 🔴 ALWAYS NULL, AND SET RATHER THAN OMITTED (owner: "there should not be any canvas titles").
  // The shell's title is shared state that outlives this screen, so not writing it would leave
  // whatever the Library or the Chat put there sitting over a canvas.
  useEffect(() => {
    setHeaderTitle(null);
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);

  // ── Opening an older canvas ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasId) {
      // 🔴 NOT CLEARED TO `null` HERE. Arriving with no `?c=` is how the landing renders, and it is
      // also what an already-minted canvas looks like from the route's point of view — this effect
      // does not re-run on a mint, but it DOES re-run when `uid` resolves a moment after mount.
      // Nulling the id on that pass would silently start a second canvas for the same session.
      setStored(null);
      setStoredMissing(false);
      setStoredLoading(false);
      return;
    }
    let alive = true;
    writingTo.current = canvasId;
    setStored(null);
    setStoredMissing(false);
    setStoredLoading(true);
    setError(null);
    void loadCanvas(uid, canvasId)
      .then((canvas) => {
        if (!alive) return;
        setStored(canvas);
        setStoredMissing(canvas === null);
        // 🔴 A ROW THAT IS GONE MUST NOT BE WRITTEN INTO. `deleted` is not in the write set, so an
        // upsert onto a soft-deleted canvas would leave it deleted — the answer would be stored,
        // confirmed, and invisible in both Libraries. Forgetting the id here is what makes the
        // next question mint a fresh canvas instead. (`saveCanvasTurn` refuses such a row too;
        // this is the half that turns the refusal into working behaviour rather than an error.)
        if (canvas === null) writingTo.current = null;
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        // Not `storedMissing`: the row may well be there. Say which of the two happened.
        setError(cause instanceof Error ? cause.message : "Couldn't open that canvas.");
      })
      .finally(() => {
        if (alive) setStoredLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [canvasId, uid]);

  /**
   * Put a finished turn into `learning_canvases`, and say so if it did not go.
   *
   * 🔴 THE ID DECIDES MINT-OR-APPEND, AND THERE IS ONLY ONE PLACE IT COMES FROM. `writingTo` holds
   * the canvas opened through `?c=<id>`, or the one minted here on the first save; a question asked
   * with neither mints a real uuid v4 (`learning_canvases.id` is a `uuid` column, so a made-up id
   * string is rejected by Postgres outright, not stored as a curiosity).
   *
   * 🔴 A FAILURE IS SAID OUT LOUD AND THE ANSWER IS LEFT ALONE. `saveCanvasTurn` never throws and
   * never touches what is on screen; the text the student is reading is untouched by every branch
   * below. That is the point — the thing being reported is exactly "this is the only copy".
   */
  const persist = useCallback(
    async (answer: string, cited: ChatSource[], asked: string, controller: AbortController) => {
      if (!uid) return;
      const blocks = blocksForAnswer(answer);
      // A turn that produced no text at all. There is nothing on screen either, so there is nothing
      // to save and nothing to report — writing an empty canvas would put a nameless, contentless
      // row in the student's Library for having pressed send.
      if (blocks.length === 0) return;

      const id = writingTo.current ?? mintCanvasId();
      const outcome = await saveCanvasTurn(uid, id, {
        blocks,
        // Only ever used for a canvas that has no name yet — see `CanvasTurn.fallbackTitle`.
        fallbackTitle: asked,
        sources: cited.map((source) => ({ title: source.title, url: source.url })),
      });
      // The student left mid-turn. Their canvas is written either way; there is no surface left to
      // tell, and setting state here would be writing into an unmounted screen.
      if (controller.signal.aborted) return;

      if (outcome.status === "saved") {
        writingTo.current = id;
        // 🔴 THE SAVED CANVAS IS DELIBERATELY *NOT* PARKED FOR THE NEXT TURN. It used to be, so that
        // a finished answer stayed on screen under the following question — which is exactly the
        // chat-log stacking the owner reported. A turn that saved is safe in the Library and does
        // not need the surface held open for it. Only a turn that FAILED to save is parked, below,
        // because for that one the pixels really are the only copy.
        savedCanvas.current = null;
        return;
      }
      if (outcome.status === "unverified") {
        // 🔴 THE ID IS KEPT EVEN THOUGH THE WRITE COULD NOT BE CONFIRMED. A row may well exist under
        // it; minting a second id on the next question would answer an unconfirmed save by
        // definitely creating a duplicate canvas, which is a worse outcome than appending to a row
        // that turns out to be the right one.
        writingTo.current = id;
      }
      // 🔴 A FAILED SAVE MUST STILL LEAVE THE ANSWER ON SCREEN, AND THIS IS THE LINE THAT KEEPS THE
      // PROMISE THE MESSAGE MAKES. `CanvasSaveOutcome` states the duty on the caller in as many
      // words — "Nothing was written. The answer on screen is the only copy and the caller must
      // keep it up" — and this screen was not keeping it. `savedCanvas` was assigned ONLY on the
      // success path, and the next question clears the live answer unconditionally, folding in
      // whatever `savedCanvas` holds. So a student told "Nothing is lost — it is still on screen"
      // watched that answer disappear the moment they asked anything else: the one copy, deleted by
      // the screen that had just promised to hold it.
      //
      // The stand-in is built here rather than by the writer because it is NOT a stored canvas and
      // must not pretend to be one: it carries the id we tried to write under and the blocks that
      // are genuinely on screen, and nothing else. It never reaches the database — it exists so the
      // reading surface can keep showing work whose save did not land, while `setError` below keeps
      // saying so.
      savedCanvas.current = {
        id,
        title: asked,
        level: null,
        // The drafts carry no ids — the writer mints those, and it did not get that far. These are
        // local render keys and are marked as such, so nothing downstream can mistake one for the
        // block id a stored canvas would have.
        blocks: blocks.map((block, index) => ({ ...block, id: `unsaved-${index}` })),
        sources: cited.map((source) => ({ id: source.url, title: source.title, url: source.url })),
        // Both stamped now, and neither is a claim about the database. A row that was never written
        // has no server timestamps; these exist because the reading surface's type asks for them,
        // and "when this appeared on screen" is the only honest answer available.
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setError(outcome.message);
    },
    [uid],
  );

  const start = useCallback(
    async (raw: string) => {
      const asked = raw.trim();
      if (!asked || busy) return;
      if (!uid) {
        setError("Sign in to start a canvas.");
        return;
      }
      setBusy(true);
      setError(null);
      setPhase(null);
      // Cleared on send, not on success: the student's own words are never rendered back to them
      // (owner call — "user prompts aren't supposed to show up as a chat"), so leaving the text
      // sitting in the box would read as though the send had not happened.
      setText("");
      setReply("");
      streamed.current = "";
      setSources([]);
      // 🔴 THE PREVIOUS ANSWER LEAVES THE SURFACE HERE, AND THAT IS THE POINT. This used to do the
      // opposite: it folded the finished turn into `stored` so earlier answers stayed on screen
      // under the new one. That is precisely the stacking the owner reported — "the canvas also
      // does not dissapear and it keeps chat history" — and it is not what the web canvas does.
      // A canvas presents ONE question's work; asking a new question clears the surface for it.
      // Nothing is lost by clearing: the finished turn is already written to
      // `learning_canvases.document` and is one tap away in the Library. A turn whose SAVE failed
      // is the one exception, and it keeps itself on screen — see the failed-save branch, which
      // parks its answer in `savedCanvas` for exactly that reason.
      setStored(savedCanvas.current);
      setStoredMissing(false);
      savedCanvas.current = null;
      setTurnId((previous) => previous + 1);
      const controller = new AbortController();
      abort.current?.abort();
      abort.current = controller;
      // A canvas turn carries no prior history: this surface starts one, it does not continue one.
      const history: ChatMsg[] = [];
      // Attachment is ONE-SHOT, captured here and cleared below — the same rule the Chat composer
      // keeps, so a document handed over for one question does not silently ride the next five.
      const doc = attachedDoc;
      setAttachedDoc(null);
      try {
        const result = await sendChat(uid, history, asked, {
          attachedDoc: doc ?? undefined,
          effort,
          signal: controller.signal,
          onPhase: (next) => setPhase(next),
          onDelta: (delta) => {
            streamed.current += delta;
            setReply(streamed.current);
          },
        });
        if (controller.signal.aborted) return;
        if (result.errorText) {
          setError(result.errorText);
        } else {
          // The streamed text is authoritative while it arrives, but a turn that produced no
          // deltas (a tool-only round) still has its answer in `text`.
          const answer = streamed.current.length > 0 ? streamed.current : result.text ?? "";
          const cited = result.sources ?? [];
          setReply(answer);
          setSources(cited);
          // 🔴 THE CAPTION GOES BEFORE THE SAVE DOES. `phase` still holds the name of the last step
          // `sendChat` reported, and that step has finished — leaving it up while the write runs
          // would caption a canvas save with the name of a model call, which is exactly the
          // "plausible-sounding stage" this screen's header rules out.
          setPhase(null);
          // 🔴 THE SAVE RUNS BEFORE `busy` DROPS, INSIDE THE SAME TURN. It is awaited rather than
          // fired and forgotten: an un-awaited write cannot report a failure without racing the
          // next question, and a failure that arrives after the student has typed again would
          // attach itself to the wrong answer. The answer is already on screen while this runs.
          await persist(answer, cited, asked, controller);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        // Put the question and its attachment back, so a failure costs the student their
        // connection rather than their typing.
        setText(asked);
        setAttachedDoc(doc);
        setError(err instanceof Error ? err.message : "That did not go through. Try again.");
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          setPhase(null);
        }
      }
    },
    [attachedDoc, busy, effort, persist, uid],
  );

  // The system file picker, reading a real PDF / Word / PowerPoint through `api/documents.ts`.
  // A refusal (wrong kind, too big, no longer on the phone) carries its own sentence, which is
  // shown verbatim rather than wrapped in a second one.
  const attachFile = useCallback(async () => {
    if (!uid || attachBusy) return;
    setAttachBusy(true);
    try {
      const doc = await pickAndReadDocument(uid);
      if (doc) setAttachedDoc({ content: doc.text, title: doc.title });
    } catch (cause) {
      Alert.alert(
        "Couldn't add that file",
        cause instanceof DocumentError ? cause.message : "Something went wrong reading it. Try again.",
      );
    } finally {
      setAttachBusy(false);
    }
  }, [attachBusy, uid]);

  const hasAnswer = reply.length > 0;
  // 🔴 A CANVAS STILL BEING FETCHED IS NOT CONTENT. Counting `storedLoading` as content here was
  // the first shape of this line and it put an empty scroll view on screen for the length of the
  // request — indistinguishable from a canvas that really is empty. The fetch is a wait, and every
  // wait on this surface belongs to the centred character.
  const hasContent = hasAnswer || stored !== null || storedMissing;

  // 🔴 A TURN IN FLIGHT OUTRANKS WHATEVER IS ON THE SURFACE — the text DISAPPEARS the moment a new
  // question is sent (owner 2026-08-20: "check the webapp canvas, each new prompt makes the text
  // dissappear"). Verified in the web source rather than taken on trust: `canvas-presence.ts`
  // declares `STANDIN_PRESENCES = ["preparing", "invitation", "quiet"]`, and `preparing` — "a step
  // is genuinely running" — is one of them, so while a turn runs the web canvas paints a STAND-IN
  // in the body INSTEAD of the document.
  //
  // This read `hasContent ? "reading" : ...`, which put content first and left the previous answer
  // sitting on screen underneath a new one. That is what made the surface read as a chat log: the
  // canvas is ONE thing about ONE question, not a transcript of every question asked at it.
  const presence: Presence = busy || storedLoading ? "thinking" : hasContent ? "reading" : "landing";

  // 🔴 PRESENCE AND THE OPEN CANVAS, AND NOTHING ELSE. See the `Presence` doc for why `busy` and
  // the streamed text are not in here.
  const surfaceKey = useMemo(() => `${presence}|${canvasId ?? "-"}`, [canvasId, presence]);

  // 🔴 WHAT THE SURFACE IS ACTUALLY PAINTING, WHICH IS NOT ALWAYS `presence` — AND EVERY FLOATING
  // SIBLING BELOW IS GATED ON THIS ONE, NOT ON `presence` (owner 2026-08-22: two characters on
  // screen at once). `CanvasFade` HOLDS the outgoing subtree for its 160ms fade-out, so for that
  // long the surface is still showing the previous presence while this component's `presence` has
  // already moved on. The dock, the fade band and anything else mounted OUTSIDE the fade would
  // otherwise switch 160ms early and stand next to content that has not left yet:
  //
  //   thinking → reading  the 128pt waiting character is still painted, and the 52pt dock
  //                       character pops in beside it. TWO CHARACTERS, for 160ms. That is the one
  //                       thing this file's "ONE CHARACTER AT A TIME" header promises never
  //                       happens, and it happened on every single answer.
  //   reading → landing   the dock character vanishes instantly while the answer is still fading,
  //                       so the character blinks out rather than leaving with the page.
  //
  // 🔴 IT IS SEEDED FROM `presence`, NOT FROM A CONSTANT. First paint has no fade — see
  // `CanvasFade`'s "NO TRANSITION AT REST" — so a canvas opened straight from the Library must
  // start already agreeing with the surface. `onShown` fires on mount too and would correct it a
  // frame later, but a frame of a wrong dock is still a frame of a wrong dock.
  const [shownPresence, setShownPresence] = useState<Presence>(presence);
  // The key's own shape, read back. Built one line above and parsed here so the two stay adjacent;
  // `presence` never contains "|", so the first field is the whole of it.
  const noteShown = useCallback((key: string) => {
    setShownPresence(key.split("|")[0] as Presence);
  }, []);

  // `phaseLabel` returning "" is a real answer meaning "show nothing" — the writing phase, and a
  // Library recall that found no notes. It is not a missing string to be papered over.
  const label = useMemo(() => {
    if (!phase) return null;
    const line = phaseLabel(phase);
    return line ? line : null;
  }, [phase]);

  // 🔴 DERIVED THROUGH `stateForCanvas`, NEVER A LOCAL `busy ? "thinking" : "idle"` TERNARY. That
  // function is, by its own header, the only Nemesis opinion about bloub, and it lives in
  // `@nemesis/shared` precisely so the phone and the desktop cannot come to different conclusions
  // about what a wait looks like. A ternary here would be one line shorter and would be the drift
  // `lib/nav-destinations.ts` exists to warn about — and it would quietly drop both the `preparing`
  // wait and the `listening` state the shared function already knows about.
  const canvasState = stateForCanvas({ listening, preparing: storedLoading, thinking: busy });

  // 🔴 THE POKE NEVER OUTRANKS A WAIT. `usePoke` hands `canvasState` straight back the moment the
  // system takes the floor, so a tap can never hide `thinking`.
  //
  // 🔴 AND IT OWNS FOUR CHANNELS, NOT ONE — WHICH IS WHY ALL FOUR ARE SPREAD ONTO THE CHARACTER
  // BELOW AND NONE OF THEM IS WRITTEN BY THIS SCREEN. The four gestures reach the character four
  // different ways: `wink` is an engine STATE, `angry` is an EXPRESSION (`colere`), the brow
  // waggle rides the GAZE channel (its script is also the signal to cut brows into the mask at
  // all), and the hop rides MOTION, a transform on the wrapper because leaving the ground is not
  // something the vendored pose model has any vocabulary for. If this screen wrote any of those
  // props itself, the two writers would fight every render.
  //   🔴 FORGETTING ONE IS SILENT, AND IT ALREADY HAPPENED ONCE (owner 2026-08-21: "the character
  //   still does not jump"). Every one of these props is OPTIONAL, so a missing one typechecks
  //   clean and simply never draws: the hop was drawn from the bag, held its 620ms, and never left
  //   the ground because `motion` was not passed here or to `CanvasDock`. There is no compiler
  //   error to catch that — only this comment and the reader.
  const greeter = usePoke(canvasState);

  const pills = useMemo(() => sourcePills(sources), [sources]);
  /** The popup's contents, or null when it is closed. Holding the LIST rather than a boolean means
   *  the sheet keeps showing what it opened with even if a new turn clears `sources` underneath. */
  const [sourcesSheetFor, setSourcesSheetFor] = useState<ChatSource[] | null>(null);

  const dockPaddingBottom = keyboardUp ? space(2) : contentBottom;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
      testID="canvas-surface"
    >
      <CanvasFade contentKey={surfaceKey} onShown={noteShown} testID="canvas-fade">
        {presence === "landing" ? (
          <View style={[styles.centre, { paddingTop: contentTop }]} testID="canvas-home">
            {/* The character stands above the question, where the eye already is — the same
                arrangement `canvas-home.tsx` argues for, and for the same reason: the landing has
                one thing on it, so a corner dock would put the character in an empty corner.

                `paper` is load-bearing rather than cosmetic: the eyes are holes cut in the body, so
                the backing has to be exactly the colour behind the character or the rings that pass
                behind it reappear inside the eyes. */}
            <BloubBot
              state={greeter.state}
              expression={greeter.expression}
              gaze={greeter.gaze}
              motion={greeter.motion}
              size={112}
              paper={c.bg}
              // 🔴 `speedOf(greeter.state)`, NOT `speedOf(canvasState)`. A gesture may run at a
              // different playback rate from the state underneath it, and reading the base state's
              // rate would then play it at the wrong speed. No gesture is retimed today — the one
              // that was, the spin on `swirl` at 0.55, was removed on 2026-08-21 — so this
              // currently resolves to 1 either way. It stays because `SPEED` in stations.ts is a
              // dial the owner has already turned once.
              speed={speedOf(greeter.state)}
              onPoke={greeter.poke}
              style={styles.character}
            />
            <Text style={styles.title}>What are you working on?</Text>
          </View>
        ) : presence === "thinking" ? (
          // Nothing to read yet, so the character has the floor: 128pt, in the middle, with the
          // name of the step that is actually running under it — or nothing at all in the few
          // hundred milliseconds before the first phase arrives, which is a real state and is
          // drawn as the character alone rather than as a guess.
          <View style={[styles.waitFill, { paddingTop: contentTop }]}>
            <CanvasThinkingPreview label={label} paper={c.bg} />
          </View>
        ) : (
          <ScrollView
            // 🔴 THE BOTTOM PADDING TRACKS THE DOCK'S REAL FOOTPRINT, NOT A ROUND NUMBER. It was
            // `space(6)`, which is shorter than the composer alone — so the last lines of an
            // answer scrolled underneath the composer AND underneath the 52pt character parked
            // above it, and the mascot was drawn straight over the prose (observed on device:
            // "cross-section" with its first letters covered). Everything that floats over this
            // scroller has to be counted: the composer's measured height, the safe-area padding
            // beneath it, the gap the dock leaves, the character itself, and one space of air so
            // the final line clears rather than merely touches. `AppDrawer` learned the identical
            // lesson about the old Chat pill — a flat constant undershot the real footprint there
            // too.
            contentContainerStyle={{
              paddingTop: contentTop + space(2),
              paddingBottom: dockPaddingBottom + composerHeight + DOCK_GAP + DOCK_SIZE + space(3),
            }}
            keyboardShouldPersistTaps="handled"
            testID="canvas-reading"
          >
            {/* An older canvas, read back from `learning_canvases.document`. It carries no title
                of its own — see this file's header. */}
            {stored ? (
              <CanvasFadeIn blockKey={stored.id}>
                <CanvasDocument canvas={stored} />
              </CanvasFadeIn>
            ) : null}

            {storedMissing ? (
              <View style={styles.doc}>
                <Text style={styles.notice}>
                  That canvas isn&apos;t here any more. It may have been deleted.
                </Text>
              </View>
            ) : null}

            {/* The ambient line: work happening BESIDE something already on screen. It never
                replaces the reading — the full-surface character is for the moment when there is
                nothing to replace. */}
            {busy && label ? (
              <View style={styles.doc}>
                <CanvasThinkingLine label={label} />
              </View>
            ) : null}

            {hasAnswer ? (
              // 🔴 KEYED ON THE TURN, NOT ON THE TEXT. The block fades in once when the first
              // words land and then grows in place in silence for the rest of the stream.
              <CanvasFadeIn blockKey={`turn-${turnId}`} style={styles.doc} testID="canvas-answer">
                <MessageBody content={reply} styles={markdownStyles} sources={sources} />
                {/* 🔴 ONE PILL, NOT A GRID (owner 2026-08-20: "the sources at the end should be in
                    one singular pill component that users can click to bring a popup"). This drew a
                    wrapping row of a favicon pill PER SOURCE, which on a broad question was ten of
                    them filling half the screen. The web made the same discovery and moved the same
                    way: `canvas-source-pills.tsx` is its superseded shape, and its chat surface
                    collapses to a single "Sources" button showing three stacked favicons. This is
                    that button — and it is the phone's OWN existing one, already shipping on the
                    Chat tab, rather than a second implementation of the same idea. */}
                {pills.length ? (
                  <SourcesPillButton
                    pills={pills}
                    dense
                    onPress={() => setSourcesSheetFor(sources)}
                    testID="canvas-sources"
                  />
                ) : null}
              </CanvasFadeIn>
            ) : null}
          </ScrollView>
        )}
      </CanvasFade>

      {/* 🔴 ONE CHARACTER. It is drawn here only when it is NOT the 128pt figure in the middle of
          the surface above, so the two placements are the same character in two places rather than
          two characters. Absolutely positioned and transparent to touch, so nothing reflows as the
          composer grows and nothing swallows a press meant for the field. */}
      {/* 🔴 THE ANSWER FADES OUT UNDER THE DOCK RATHER THAN BEING SLICED BY IT. The scroller's
          bottom padding already guarantees the LAST line clears the composer and the character, but
          padding only settles where the text ENDS — mid-scroll the prose still ran straight under a
          52pt character, and the character was drawn over a sentence (observed on device: the
          mascot sitting on top of "something up or does something in exchange"). Web has the same
          problem and answers it the same way, with a scrim: `learning-canvas.tsx`'s composer wrapper
          carries `bg-gradient-to-t from-(--ui-bg-editor) via-(--ui-bg-editor)/85 to-transparent`.
          `BottomFadeBlur` is the phone's existing version of exactly that band — chat.tsx has used
          it for this since the composer started floating — so this is reusing the app's answer, not
          inventing a second one. It sits BELOW the dock in z-order so the character stays crisp on
          top of the fade, and it is `pointerEvents="none"` so it cannot eat a press. */}
      {shownPresence === "reading" ? (
        <View
          style={[styles.fadeBand, { bottom: 0 }]}
          pointerEvents="none"
        >
          {/* 🔴 THE TOP OF THE BAND IS THE TOP OF THE COMPOSER, AND THE RAMP CARRIES THE CHARACTER
              (owner 2026-08-21: "the fade to blur is too high up"). This read
              `+ DOCK_GAP + DOCK_SIZE / 2`, which started the band at the CHARACTER'S MIDPOINT —
              40pt clear of the composer — and with the default 12pt ramp that top edge was a
              visible horizontal line most of the way up the character. `BottomFadeBlur`'s own
              constant predicted this exact report: "if the band ever looks too tall again, look
              at the caller's height", after the same complaint was made four times about chat.
              TRIED AND REJECTED: chat's formula unchanged (`composerHeight / 2 + inset`), which
              is the settled answer THERE. It ends inside the composer card, so on this surface it
              would leave the whole 52pt character standing on unfaded prose — the defect the
              band was added for, observed on device with the mascot sitting on top of "something
              up or does something in exchange". The character's opaque `paper` backing hides the
              words directly behind it but does nothing for the ones beside it.
              So: start at the composer's top edge, and spend `CANVAS_FADE_SPAN` easing in rather
              than 12, so the character stands in a gradient instead of on a line. */}
          <BottomFadeBlur
            height={dockPaddingBottom + composerHeight}
            span={CANVAS_FADE_SPAN}
          />
        </View>
      ) : null}

      {/* 🔴 MOUNTED AT SCREEN LEVEL, NOT INSIDE THE SCROLLER. A sheet nested in the ScrollView
          scrolls away with the answer that opened it. Same position the Chat tab mounts its copy. */}
      <SourcesSheet
        visible={sourcesSheetFor !== null}
        onClose={() => setSourcesSheetFor(null)}
        sources={sourcesSheetFor ?? []}
      />

      {shownPresence === "reading" ? (
        <CanvasDock
          state={greeter.state}
          expression={greeter.expression}
          gaze={greeter.gaze}
          motion={greeter.motion}
          composerHeight={composerHeight}
          bottomInset={dockPaddingBottom}
          paper={c.bg}
          onPoke={greeter.poke}
        />
      ) : null}

      <View style={[styles.dock, { paddingBottom: dockPaddingBottom }]}>
        {error ? (
          <Text style={styles.error} testID="canvas-error">
            {error}
          </Text>
        ) : null}
        <CanvasComposer
          value={text}
          onChangeText={setText}
          onSend={() => void start(text)}
          busy={busy}
          effort={effort}
          onEffortChange={setEffort}
          onAttach={() => void attachFile()}
          attachmentTitle={attachedDoc?.title ?? null}
          onClearAttachment={() => setAttachedDoc(null)}
          onListeningChange={setListening}
          onLayoutHeight={setComposerHeight}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    centre: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: space(5) },
    character: { marginBottom: space(5) },
    // 🔴 24/500, THE WEB'S `--canvas-text-title`, AND A NAMED EXEMPTION FROM `theme/tokens.ts`.
    // The phone's `type.h1` is 30/37/700, which is the app-wide ramp; the owner's instruction was
    // that this surface should match the web, and `canvas-metrics.ts` carries the reasoning for
    // the canvas scale as a whole. Changing it back to `type.h1` re-breaks the match.
    title: { fontSize: CANVAS_TEXT.title, lineHeight: 30, fontWeight: "500", color: c.text, textAlign: "center" },
    // The centred wait fills what is left above the composer, and the 70%-of-window block inside
    // it centres against that rather than against the whole screen — otherwise the character sits
    // low, behind the composer, on a short phone.
    waitFill: { flex: 1, justifyContent: "center" },
    doc: { paddingHorizontal: space(4) },
    fadeBand: { position: "absolute", left: 0, right: 0, justifyContent: "flex-end" },
    // 🔴 NO FILL — THE COMPOSER FLOATS ON THE BLUR (owner 2026-08-21: "the composer is supposed to
    // not have the black shading around it, its supposed to only be the copmoser and blur").
    // This carried `backgroundColor: c.bg`, which painted an opaque slab from the composer's top
    // edge to the bottom of the screen. The band behind it is `BottomFadeBlur`, whose whole job is
    // to dissolve the answer gradually — and a solid rectangle drawn on top of a gradient ends it
    // in a hard horizontal line, which is what the owner circled. Dropping the fill lets the blur
    // run the full height, so the prose fades once, continuously, behind a composer that is the
    // only solid thing down here.
    // WHY IT WAS SAFE TO DROP, rather than needing a replacement: the composer card draws its own
    // background, so nothing behind it shows through the field, and the scroller already reserves
    // this whole block's height (see the ScrollView's `paddingBottom`), so no text comes to rest
    // under it. The fill was doing no work that anything else was not already doing.
    dock: { paddingTop: space(2) },
    error: {
      ...type.small,
      color: c.text2,
      marginBottom: space(2),
      paddingHorizontal: space(5),
      textAlign: "center",
    },
    notice: { fontSize: CANVAS_TEXT.body, lineHeight: 24, color: c.text3, textAlign: "center", marginTop: space(10) },
  });
