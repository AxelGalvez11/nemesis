"use client";

import {
  IconMessage,
  IconThumbDown,
  IconThumbDownFilled,
  IconThumbUp,
  IconThumbUpFilled,
} from "@tabler/icons-react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/desktop-ui/dialog";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { parseRevisedCard, reviseCardMessages } from "@/lib/workspace/study-ai-extras";
import { postChatCompletion } from "@/lib/workspace/chat-api";
import { activeClozeNumber, hasCloze, renderCloze } from "@/lib/workspace/study-cloze";
import { lastSeenAt, type StudyCard, type StudyDeck, type StudyScheduleSnapshot, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { buildReviewQueue, minutesUntilNext } from "@/lib/workspace/study-review-queue";
import { describeDelay, elapsedDaysBetween, previewAnswers, type StudyGrade } from "@/lib/workspace/study-scheduler";
import { cn } from "@/lib/utils";

import { OcclusionCardView } from "./occlusion-card";
import type { StudyReviewSettings } from "./study-chrome";

/**
 * The four buttons.
 *
 * 🔴🔴 THE HINT USED TO READ "1 · soon", "3 · normal" — WORDS ABOUT A FEELING, NOT A SCHEDULE, and
 * that is how a learner ends up surprised. Owner, 2026-08-30: *"just saying good and it disappears
 * for, like, three days. That's too much."* There was no way to find that out except by pressing it
 * and losing the card. Anki has printed the real interval above every button since forever, so now
 * the label is computed per card from the same function that does the scheduling — see
 * `previewAnswers` in study-scheduler.ts. The number under the button IS what pressing it does.
 */
const GRADES: { grade: StudyGrade; label: string; variant: "outline" | "secondary" }[] = [
  { grade: "again", label: "Again", variant: "outline" },
  { grade: "hard", label: "Hard", variant: "secondary" },
  { grade: "good", label: "Good", variant: "secondary" },
  { grade: "easy", label: "Easy", variant: "secondary" },
];

const GRADE_KEYS: Record<string, StudyGrade> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };

interface ReviewSessionProps {
  cards: StudyCard[];
  deck: StudyDeck | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: StudyReviewSettings;
  /**
   * Which shell this review is wearing.
   *
   * 🔴🔴 ONE REVIEW SCREEN, TWO SHELLS — NEVER TWO SCREENS. The Study tab opens this as a
   * full-screen dialog, which is what it has always been. The canvas opens it inside `StudyPanel`
   * beside the conversation (owner 2026-08-30), and a panel that carried its own dialog would be a
   * dialog inside a dialog: two focus traps, two Escape handlers and two close buttons. `bare`
   * therefore drops the `Dialog` wrapper and nothing else — every pixel below is shared by
   * construction rather than by two teams remembering to match, which is the same rule
   * `deck-review.tsx` was built on.
   */
  surface?: "dialog" | "bare";
  /**
   * Gemini's player rather than Anki's: one Track learning switch, and two buttons when it is on.
   * True from the canvas (deck-review.tsx); the Study tab leaves it false and keeps the four grades.
   */
  simple?: boolean;
}

export function ReviewSession({ cards, deck, open, onOpenChange, settings, surface = "dialog", simple = false }: ReviewSessionProps) {
  const bare = surface === "bare";
  /**
   * 🔴🔴 TWO BUTTONS ON THE CANVAS, FOUR IN THE STUDY TAB, AND ONE TOGGLE THAT TURNS GRADING OFF.
   *
   * Owner, 2026-09-07: *"simplify the options to two buttons for flashcard rather than 4 … Gemini
   * allows users to do learn mode and also a mode to just scroll thru cards"*, and then: make it one
   * for one. Driven in his own Gemini deck the same night: the player carries a single **Track
   * learning** switch. Off, there is a card, "1 of 24" and a next arrow, and nothing is recorded.
   * On, the footer is Undo, a red cross and a green tick, and two counters ride the progress bar.
   *
   * 🔴 THE FOUR GRADES ARE NOT DELETED, AND DELETING THEM WOULD BE THE WRONG READ. This screen is
   * shared: the Study tab opens it as the place real spaced repetition happens, and it prints the
   * actual next-review date under each button because of the owner's own report on 2026-08-30
   * (*"just saying good and it disappears for, like, three days"*). A deck you made on the canvas
   * two minutes ago is not that; it is a thing to run through. So `simple` decides, one component
   * still, and the scheduler underneath is the same one either way: ✗ writes `again`, ✓ writes
   * `good`, which are two of the four it already understands.
   */
  const [tracking, setTracking] = useState(true);
  const [tally, setTally] = useState({ got: 0, missed: 0 });
  const [browseAt, setBrowseAt] = useState(0);
  /**
   * 🔴🔴 THE HOTKEYS MUST NOT REACH ACROSS A NON-MODAL PANEL. In the dialog the review owns the
   * screen, so a bare `window` listener is safe. Docked beside a live canvas it is not: Space,
   * 1-4 and Z would grade a card while the learner is working next to it. The listener therefore
   * only acts when focus is inside this subtree, or nowhere in particular (`body`, the state
   * right after the panel opens). Typing is already excluded by the field check below, which is
   * what protects the composer specifically.
   */
  const scope = useRef<HTMLDivElement>(null);
  // 🔴🔴 THREE CONTROLS LEFT THIS ROW ON 2026-08-26, AND THEIR STORE WRITES LEFT WITH THEM. Owner:
  // *"remove the [have] nemesis explain this card… and remove the flag function for cards. Pretty
  // much just hide it. And also the suspend card, which is… the three dots icon inside the
  // flashcards."* `setCardFlag` and `setCardSuspended` are still in `study-cloud-store` and still
  // reachable from the Study browser, which is where a learner manages a collection rather than
  // works through one. What is gone is the reviewing screen offering them: a person mid-recall has
  // one job, and every control that is not "did I know this" is a decision taken during it.
  //
  // 🔴 THE EXPLAIN PANEL IS PARKED, NOT DELETED. `explain-chat.tsx` stays, `study-artifact-dialogs`
  // still mounts it, and `reviseCardMessages` / `parseRevisedCard` are still live HERE, because the
  // thumbs-down rewrite runs on them. Only the door from this screen is gone.
  const { gradeCard, undoGrade, updateCard, rateCard, userId } = useCloudStudy();
  const previewMode = useWorkspacePreview();
  /**
   * 🔴🔴 THE SITTING NO LONGER TRACKS WHICH CARDS IT HAS SEEN, AND REMOVING THAT WAS THE POINT.
   * Until 2026-08-30 this component kept `passedIds`, `retryIds` and a per-card pass counter, and
   * `study-session-steps.ts` used them to SIMULATE Anki's learning steps inside one sitting: a new
   * card was requeued at the back twice and only the graduating press was ever written down. That
   * was a stand-in for steps, and it had the defect the owner found — the card came back "a few
   * cards later" rather than in ten minutes, and once it graduated it left for days.
   *
   * Real steps live in the card now (`state`, `remainingSteps`, and a `dueAt` that can hold
   * minutes), so the queue is simply "what is due", and a card returns because its time came. Two
   * mechanisms for one behaviour is how they drift; there is one, and it is the stored one.
   */
  const [priorityId, setPriorityId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGrade, setLastGrade] = useState<{ cardId: string; snapshot: StudyScheduleSnapshot } | null>(null);
  // 🔴🔴 THERE IS NO CARD EDITOR, AND ITS ABSENCE IS THE FEATURE (owner 2026-08-24:
  // "I don't really want the user to be able to edit them", and on the plan: "no card
  // editing anywhere, including the old tab"). What used to sit here was an inline
  // front/back/tags form reachable from the ⋯ menu. It is gone.
  //
  // 🔴 BUT THE REASON PEOPLE EDIT A CARD IS THAT THE CARD IS WRONG, and taking the
  // editor away without answering that leaves a student stuck with a bad card and no
  // move except suspending it. So the editor is REPLACED, not merely removed: one
  // press of "This card is wrong" rewrites it. The learner never types.
  //
  // The rewrite reuses the Explain panel's own path (`reviseCardMessages` →
  // `parseRevisedCard` → `updateCard`) with an EMPTY transcript, which that prompt
  // already reads as "(none — improve accuracy and clarity)". One mechanism, two
  // doors, so a fix to either lands on both.
  const [rewriting, setRewriting] = useState(false);
  /**
   * When the card currently on screen was first shown, so the grade can record how long it took.
   *
   * 🔴 NOTHING SCHEDULES ON THIS. Neither Anki nor FSRS uses answer latency to pick an interval;
   * hesitation is meant to be reported by pressing Hard. It is recorded because the question of
   * whether latency predicts anything cannot be answered on data nobody collected, and our review
   * logs are useful today only because they have existed since July. See `study-scheduler.ts`.
   *
   * 🔴 A REF, NOT STATE. Setting state on every card change would re-render the card the moment it
   * appears, and this value is never rendered.
   */
  const shownAt = useRef<number | null>(null);
  // The Explain side chat: transcripts cache per card for the sitting, so
  // reopening a card never bills twice; the panel itself lives to the RIGHT
  // of the card (owner 2026-08-04) and streams into explain-chat.tsx.

  useEffect(() => {
    if (open && bare) scope.current?.focus({ preventScroll: true });
  }, [bare, open]);

  useEffect(() => {
    if (!open) return;
    setPriorityId(null);
    setRevealed(false);
    setBrowseAt(0);
    setTally({ got: 0, missed: 0 });
    setError(null);
    setLastGrade(null);
    setRewriting(false);
  }, [open, deck?.id]);

  // 🔴 RE-RUN ON A TIMER, BECAUSE THE QUEUE IS NOW TIME-DEPENDENT. A card due in one minute has to
  // arrive on its own; without this the screen would sit on "You're caught up" until something else
  // forced a render. Thirty seconds is well under the shortest step.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setTick((count) => count + 1), 30_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const queue = useMemo(
    () => buildReviewQueue({ cards, deckId: deck?.id ?? null, priorityId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the clock, deliberately
    [cards, deck?.id, priorityId, tick],
  );
  /**
   * The whole deck in its stored order: what BROWSING walks through.
   *
   * 🔴 BROWSING IS NOT A QUEUE, WHICH IS WHY IT IS A SEPARATE LIST. The review queue answers "what
   * is due"; a learner scrolling their own deck expects card 1, card 2, card 3, all of them, in
   * order, including the ones that are not due for a week. Feeding the queue a browse index would
   * have meant teaching the scheduler about a mode that does not schedule anything.
   */
  const deckCards = useMemo(() => cards.filter((card) => card.deckId === deck?.id && !card.suspended), [cards, deck?.id]);
  const browsing = simple && !tracking;
  const current = browsing ? (deckCards[Math.min(browseAt, Math.max(0, deckCards.length - 1))] ?? null) : (queue[0] ?? null);

  // 🔴 KEYED ON THE CARD, NOT ON THE REVEAL. The clock has to start when the QUESTION appears —
  // that is the whole interval a latency signal would be about — and a card re-queued after
  // "Again" is a fresh look at the same id, which is why the reveal flag is a dependency too.
  const currentId = current?.id ?? null;
  useEffect(() => {
    shownAt.current = currentId ? Date.now() : null;
    // 🔴 AND SO IS THE ANSWER. `grade()` and `undo()` each clear this on their own way out, which
    // covered every route a learner had until the card could also change underneath them — a
    // re-sorted queue, a card arriving from its learning step. Anchoring it to the card itself
    // means a new front can never appear with the previous card's answer already showing.
    setRevealed(false);
  }, [currentId]);

  /** Anki's three counters, read off each card's own state rather than inferred from what this
   *  sitting happens to remember. */
  const bucketOf = (card: StudyCard) => (card.state === "learning" || card.state === "relearning" ? "learn" : card.state === "new" ? "new" : "due");
  /**
   * 🔴🔴 COUNTED FROM THE DECK, NOT FROM THE QUEUE, AND THAT DISTINCTION ONLY APPEARED ON SCREEN.
   * The queue holds what is due THIS INSTANT. A card sitting out a ten-minute learning step is not
   * in it, so counting the queue made the card vanish from all three numbers the moment it was
   * graded — the screen said less work remained than actually did, and the learner could reasonably
   * close the deck on unfinished cards.
   *
   * A card in a learning step counts as learning whether or not its minute has come, which is what
   * Anki's middle number has always meant. New and due still require the card to actually be due,
   * because a review card scheduled for next week is not work left today.
   */
  const remaining = useMemo(() => {
    const at = Date.now();
    let newCount = 0;
    let learnCount = 0;
    let dueCount = 0;
    for (const card of cards) {
      if (card.deckId !== deck?.id || card.suspended) continue;
      const bucket = bucketOf(card);
      if (bucket === "learn") learnCount += 1;
      else if (new Date(card.dueAt).getTime() > at) continue;
      else if (bucket === "new") newCount += 1;
      else dueCount += 1;
    }
    return { dueCount, learnCount, newCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the clock, deliberately
  }, [cards, deck?.id, tick]);
  const currentBucket = current ? bucketOf(current) : null;

  /**
   * What each button would do to THIS card, in words.
   *
   * 🔴 COMPUTED FROM THE SCHEDULER ITSELF, never from a parallel table of guesses. If the two could
   * disagree the button would be a lie, and it is the kind of lie nobody reports because it looks
   * like the scheduler being strange rather than the label being wrong.
   */
  /** Minutes until a card still in its steps returns, or null when nothing is pending. */
  const waitingMinutes = useMemo(
    () => minutesUntilNext(cards, deck?.id ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the clock, deliberately
    [cards, deck?.id, tick],
  );

  const previews = useMemo(
    () => (current ? previewAnswers(current, elapsedDaysBetween(lastSeenAt(current), new Date())) : null),
    [current],
  );

  // Occlusion cards render their image with masks; the payload is only ever
  // non-null when it validated, so anything malformed falls back to text.
  const occlusionPayload = current?.cardType === "image_occlusion" ? current.payload : null;
  // Cloze cards transform in place: the active blank is masked until revealed.
  // Auto-detect covers cards typed as basic that still contain {{cN::…}}.
  const clozeCard = current ? current.cardType === "cloze" || hasCloze(current.front) : false;
  const frontText = current && clozeCard
    ? renderCloze(current.front, activeClozeNumber(current.front, current.repetitions), revealed)
    : current?.front ?? "";
  const showBack = Boolean(current) && revealed && ((!clozeCard && !occlusionPayload) || Boolean(current?.back.trim()));

  /**
   * The two buttons, written down as two of the four grades the scheduler already knows.
   *
   * 🔴 IT IS THE SAME SCHEDULER. ✗ is `again` and ✓ is `good`, so a deck run through on the canvas
   * and a deck reviewed in the Study tab move through exactly the same FSRS state. Inventing a
   * separate "canvas progress" would be the second copy of the scheduler this repo has a standing
   * rule against.
   */
  async function mark(knewIt: boolean) {
    setTally((count) => (knewIt ? { ...count, got: count.got + 1 } : { ...count, missed: count.missed + 1 }));
    await grade(knewIt ? "good" : "again");
  }

  async function grade(value: StudyGrade) {
    if (!current || saving) return;
    const graded = current;
    setSaving(true);
    setError(null);
    try {
      // 🔴🔴 EVERY PRESS IS WRITTEN NOW. It used to be that only the press which GRADUATED a card
      // reached the scheduler, because the steps were simulated in this component and writing the
      // in-between presses would have inflated the schedule. The steps are real and stored, so a
      // press inside a step is a real review with a real ten-minute due date — and holding it back
      // would mean closing the tab lost your place in the card.
      //
      // 🔴 THE WHOLE PRE-PRESS STATE RIDES IN THE SNAPSHOT, memory AND step position. Undo has to
      // put back a card the scheduler has already moved; leaving out the stability would restore
      // the old due date while keeping the memory of a review that no longer happened, and every
      // later interval would compound the error.
      const snapshot: StudyScheduleSnapshot = {
        difficulty: graded.difficulty,
        dueAt: graded.dueAt,
        intervalDays: graded.intervalDays,
        lapses: graded.lapses,
        lastReviewedAt: graded.lastReviewedAt,
        remainingSteps: graded.remainingSteps,
        repetitions: graded.repetitions,
        stability: graded.stability,
        state: graded.state,
      };
      await gradeCard(graded.id, value, shownAt.current === null ? undefined : Date.now() - shownAt.current);
      setLastGrade({ cardId: graded.id, snapshot });
      setPriorityId((id) => (id === graded.id ? null : id));
      setRevealed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the review.");
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!lastGrade || saving) return;
    const { cardId, snapshot } = lastGrade;
    setSaving(true);
    setError(null);
    try {
      await undoGrade(cardId, snapshot);
      // 🔴 THE UNDONE CARD JUMPS THE QUEUE. Its restored due date may be days away, so without this
      // the card the learner just asked to re-grade would vanish instead of coming back.
      setPriorityId(cardId);
      setLastGrade(null);
      setRevealed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't undo the review.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Thumbs up or thumbs down on how well this card was WRITTEN.
   *
   * 🔴 THIS IS THE ONLY THING A LEARNER MAY TELL US ABOUT A CARD (owner 2026-08-25: "I don't
   * want users to edit flashcards, really… Mainly just a thumbs up or a thumbs down if a card
   * was badly generated"). It is deliberately not a grade: `grade()` says what the learner
   * remembered, this says what Nemesis got wrong, and conflating them would poison the
   * scheduler with opinions about prose.
   *
   * 🔴 THUMBS DOWN ALSO REPAIRS THE CARD, because a complaint with no consequence is a
   * suggestion box. The rewrite is the path that used to sit behind a menu item reading "This
   * card is wrong" — same call, same prompt, one fewer decision for the learner to make. Voting
   * it back off does not un-rewrite anything; the better card is kept.
   *
   * 🔴 OCCLUSION CARDS RECORD THE VOTE AND SKIP THE REWRITE, not silently mangled. Their
   * content is a masked image plus coordinates, and `parseRevisedCard` returns front/back TEXT
   * — applying it would blank the labels and leave the image orphaned.
   */
  async function rate(value: 1 | -1) {
    if (!current || saving || rewriting) return;
    const card = current;
    const clearing = card.quality === value;
    setError(null);
    try {
      await rateCard(card.id, value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save that.");
      return;
    }
    if (value === -1 && !clearing && card.cardType !== "image_occlusion") await rewriteCurrent();
  }

  /**
   * Rewrite the card in front of the learner.
   *
   * 🔴 ONE DOOR SINCE 2026-09-01, AND THE PARAMETER STAYS. The note box was cut from the recall
   * row (see its tombstone there); thumbs-down is the only caller now and passes nothing. The
   * `instruction` argument is kept because it costs nothing and because restoring the box should be
   * a button and a textarea rather than a rebuild of this function.
   *
   * 🔴 TWO DOORS, ONE MECHANISM (historic). Thumbs-down calls this with no note ("this is bad, you work out
   * why"); the note box calls it with one ("the answer is wrong, it is the neutral axis"). A second
   * rewrite path for the second door is how the two would start disagreeing about what a revision
   * does, so there is one, and the note is a parameter.
   */
  async function rewriteCurrent(instruction?: string) {
    if (!current || saving || rewriting) return;
    if (!userId || previewMode) {
      setError("Sign in to have Nemesis rewrite a card.");
      return;
    }
    setRewriting(true);
    setError(null);
    try {
      const reply = await postChatCompletion(
        userId,
        reviseCardMessages({ back: current.back, front: current.front, note: instruction, transcript: "" }),
        { decision: { model: "deepseek-chat", route: "conversation", searchWeb: false } },
      );
      const revised = reply.text ? parseRevisedCard(reply.text) : null;
      if (!revised) {
        setError(reply.errorText ?? "Couldn't rewrite this card. Try again.");
        return;
      }
      await updateCard({ back: revised.back, cardType: current.cardType, flag: current.flag, front: revised.front, id: current.id, tags: current.tags });
      // Back to the question side: the card the learner is looking at just changed
      // underneath them, and showing the new answer they never tried to recall would
      // spend the retrieval for nothing.
      setRevealed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't rewrite this card.");
    } finally {
      setRewriting(false);
    }
  }

  // Keyboard review: Space/Enter reveals then grades Good, 1-4 grade, Z undoes.
  // Re-subscribed every render so the closures stay fresh.
  useEffect(() => {
    if (!open || rewriting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      // 🔴 SCOPED WHEN DOCKED. See `scope` above: a non-modal panel must not grade a card because
      // somebody pressed Space while reading the canvas beside it.
      //
      // 🔴 `instanceof Node` IS NOT BELT AND BRACES, IT IS THE FIX FOR A REAL THROW. `event.target`
      // is an EventTarget, not necessarily a Node: a keydown dispatched on `window` has `window` as
      // its target, which is truthy and makes `Node.contains()` raise a TypeError that kills the
      // whole handler. Found on screen driving this panel, not in review.
      const inside = target instanceof Node && scope.current?.contains(target);
      if (bare && scope.current && !inside && target !== document.body) return;
      if (!current) return;
      /**
       * 🔴🔴 BROWSING NEVER WRITES A GRADE, INCLUDING FROM THE KEYBOARD. This is the half of the
       * Track learning switch that is easy to forget and impossible to see: with the switch off
       * there is no grading button on screen, but Space, Enter and 1-4 would still have scheduled
       * the card. A learner flicking through their own deck would have been silently rescheduling
       * every card they looked at. Arrows walk the deck instead.
       */
      if (browsing) {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setBrowseAt((at) => Math.min(deckCards.length - 1, at + 1));
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setBrowseAt((at) => Math.max(0, at - 1));
          return;
        }
        if (event.key === " " || event.key === "Enter" || event.code === "Space") {
          event.preventDefault();
          setRevealed((was) => !was);
        }
        return;
      }
      if (event.key === " " || event.key === "Enter" || event.code === "Space") {
        event.preventDefault();
        if (revealed) void (simple ? mark(true) : grade("good"));
        else setRevealed(true);
        return;
      }
      const byDigit = GRADE_KEYS[event.key] ?? (event.code.startsWith("Digit") ? GRADE_KEYS[event.code.slice(5)] : undefined);
      if (byDigit && revealed && !simple) {
        event.preventDefault();
        void grade(byDigit);
        return;
      }
      // 🔴 `F` WENT WITH THE FLAG BUTTON. A hotkey for a control that is not on screen is a hidden
      // feature, and this one wrote to the card silently.
      if (event.key === "z" || event.key === "Z" || event.code === "KeyZ") {
        event.preventDefault();
        void undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // 🔴 ONE BODY, TWO SHELLS. Everything below this line is shared verbatim between the Study tab's
  // full-screen dialog and the canvas's docked panel; only the wrapper differs. Writing it twice is
  // how the two surfaces would start disagreeing about what a review looks like.
  const body = (
    <>
      {current ? (
          <div className="mx-auto grid min-h-0 w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] gap-4 pt-1">
            {/* 🔴 NO DECK NAME ACROSS THE TOP (owner 2026-08-25: "in the flashcards, it had this
                title called nemesis flashcards, and I don't really need that there. And kinda
                just need the minimalist approach of Anki"). The name it printed came from
                `canvas-deliverables.ts`, which used to append " · flashcards" to the canvas
                title and fall back to "Nemesis canvas" — so an untitled canvas produced a deck
                announcing itself as "Nemesis canvas · flashcards" over every card in it.
                Both halves are fixed: the generated name is now just the topic, and the review
                screen does not print a name at all. The learner opened this deck; they know
                which one it is. `DialogTitle` above still carries it for screen readers, where
                a nameless dialog is a real loss rather than clutter. */}
            <div className={cn("flex items-center justify-end", !bare && "pr-10")}>
              {/* 🔴 GEMINI'S TWO TALLIES, MEASURED IN HIS DECK: a red pill and a green pill riding the
                  top of the player. They count this sitting, not the card's history. */}
              {simple && tracking && (
                <div className="mr-auto flex items-center gap-[6px] text-xs font-medium tabular-nums" data-testid="review-tally">
                  <span className="flex items-center gap-[4px] rounded-full bg-red-500/15 px-[8px] py-[2px] text-red-500">
                    <X className="size-[12px]" />
                    {tally.missed}
                  </span>
                  <span className="flex items-center gap-[4px] rounded-full bg-emerald-500/15 px-[8px] py-[2px] text-emerald-500">
                    <Check className="size-[12px]" />
                    {tally.got}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1">
                {lastGrade && !simple && (
                  <Button className="text-xs" disabled={saving} onClick={() => void undo()} size="sm" title="Undo last grade (Z)" variant="ghost">
                    Undo
                  </Button>
                )}
                {/* The card-quality vote. Two icons, no menu: a complaint buried one click deep
                    is a complaint nobody files, and this is the only channel a learner has. */}
                <Button
                  aria-label="This card is well made"
                  aria-pressed={current.quality === 1}
                  data-testid="rate-card-up"
                  disabled={rewriting}
                  onClick={() => void rate(1)}
                  size="icon-xs"
                  title="Good card"
                  variant="ghost"
                >
                  {current.quality === 1 ? <IconThumbUpFilled className="text-(--ui-learner)" /> : <IconThumbUp />}
                </Button>
                <Button
                  aria-label="This card was badly made"
                  aria-pressed={current.quality === -1}
                  data-testid="rate-card-down"
                  disabled={rewriting}
                  onClick={() => void rate(-1)}
                  size="icon-xs"
                  title={
                    current.cardType === "image_occlusion"
                      ? "Badly made card"
                      : rewriting
                        ? "Rewriting…"
                        : "Badly made card. Nemesis will rewrite it"
                  }
                  variant="ghost"
                >
                  {current.quality === -1 ? <IconThumbDownFilled className="text-(--ui-learner)" /> : <IconThumbDown />}
                </Button>
                {/* 🪦 THE ASK-FOR-A-CHANGE BUBBLE, CUT 2026-09-01: *"for flashcards, I want you to
                    remove the chat icon because I don't think that's necessary at all. Maybe just a
                    thumbs up or thumbs down."*

                    🔴 THAT IS A RETURN TO HIS FIRST POSITION, NOT A NEW ONE. The quote this file
                    already carries above `vote` reads *"want users to edit flashcards, really…
                    Mainly just a thumbs up or a thumbs down if a card"*. The bubble came in on
                    2026-08-30 from *"what happens when a user asks for an adjustment on one?"*, and
                    two days of using it answered that question differently: the ask was worth
                    building and not worth keeping on the recall screen.

                    🔴 NOTHING WAS LOST BUT THE DOOR. Thumbs-down still rewrites the card — see
                    `vote`, which calls `rewriteCurrent()` with no instruction — so a wrong card is
                    still reported and still repaired. What is gone is saying HOW in words, which is
                    the refinement, not the mechanism. `rewriteCurrent` keeps its `instruction`
                    parameter, so restoring this is a button and a textarea, not a feature.

                    🔴 AND THE ROW'S OWN RULE REASSERTS ITSELF, the one written directly below: every
                    control here is a decision ABOUT the card taken in the moment the learner is
                    meant to be recalling it. This was the one exception. There are none now. */}
                {/* 🔴🔴 THE ROW ENDS HERE: TWO THUMBS AND ONE ASK, AND NOTHING ELSE. Three controls were cut on
                    2026-08-26 on the owner's instruction, and each had a defensible reason to exist:
                    ✨ opened a side chat that explained the card, 🚩 flagged it a colour, and ⋯ held
                    "Suspend card".

                    🔴 WHAT THEY HAD IN COMMON IS THE ARGUMENT FOR CUTTING THEM. Every one of them is
                    a decision ABOUT the card, taken in the one moment the learner is supposed to be
                    trying to remember what is on it. The vote below is the exception because it is
                    the same gesture as the recall itself ("this card is bad") and because a
                    complaint with nowhere to go is a complaint nobody files.

                    🔴 DO NOT RE-ADD ONE BECAUSE IT SEEMS HARMLESS. The Study browser manages a
                    collection; this screen works through one. That is the line. */}
              </div>
            </div>
            {/* The Explain side chat rides to the RIGHT of the card (owner
                2026-08-04) — the card column narrows instead of the panel
                covering it; on small screens the panel stacks below. */}
            {/* 🔴 ONE COLUMN, ALWAYS. This used to narrow to make room for the Explain panel on the
                right; that panel's door is gone (see the toolbar above), so the card gets the width
                back on every screen. */}
            <div className="grid min-h-0 grid-cols-1 gap-4">
              <section className={cn("grid min-h-0 place-items-start overflow-y-auto bg-background px-4 py-12 text-center", settings.flashcardOutline && "rounded-3xl border border-(--ui-stroke-secondary) shadow-sm")}>
                <div className={cn("mx-auto w-full max-w-5xl", settings.flipAnimation && "animate-in fade-in-0 duration-300")}>
                  {occlusionPayload ? (
                    <OcclusionCardView payload={occlusionPayload} revealed={revealed} />
                  ) : (
                    <AssistantMarkdown className="text-base font-medium leading-7" htmlSubSup obsidianUnderline singleDollarMath text={frontText} />
                  )}
                  {showBack && (
                    <div className={cn("mt-8 border-t border-(--ui-stroke-secondary) pt-8", settings.flipAnimation && "animate-in fade-in-0 slide-in-from-bottom-1 duration-300")}>
                      <AssistantMarkdown className="text-base leading-7 text-foreground" htmlSubSup obsidianUnderline singleDollarMath text={current.back} />
                    </div>
                  )}
                </div>
              </section>
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
            {/* A rewrite is a model call, so it takes seconds. Saying so beats a menu
                item that closed and apparently did nothing. */}
            {rewriting && (
              <p className="rounded-lg bg-(--ui-bg-quaternary) px-3 py-2 text-xs text-(--ui-text-secondary)" role="status">
                Rewriting this card…
              </p>
            )}
            <div className="grid justify-items-center gap-3">
              {/* 🔴 THE STUDY TAB'S THREE BUCKET COUNTS ARE ANKI'S; the canvas gets Gemini's two
                  tallies instead, and browsing gets neither because nothing is being counted. */}
              {!simple && (
                <div className="flex items-center justify-center gap-4 text-xs font-medium tabular-nums" data-testid="review-counts" title="New · Learning · Due left in this session">
                  <span className={cn("text-sky-500", currentBucket === "new" && "underline underline-offset-4")}>{remaining.newCount}</span>
                  <span className={cn("text-amber-500", currentBucket === "learn" && "underline underline-offset-4")}>{remaining.learnCount}</span>
                  <span className={cn("text-emerald-500", currentBucket === "due" && "underline underline-offset-4")}>{remaining.dueCount}</span>
                </div>
              )}
              {!revealed ? (
                <Button className="bg-foreground text-background hover:bg-foreground/90" onClick={() => setRevealed(true)} size="lg" title="Show answer (Space)" variant="ghost">Show answer</Button>
              ) : simple && tracking ? (
                /* Gemini's footer, driven in his own deck: Undo on the left, a red cross and a green
                   tick in the middle, the switch on the right. */
                <div className="flex w-full items-center justify-center gap-4" data-testid="review-two-buttons">
                  <button
                    aria-label="I did not know this"
                    className="flex size-[44px] items-center justify-center rounded-full border border-red-500/60 text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                    data-testid="mark-missed"
                    disabled={saving}
                    onClick={() => void mark(false)}
                    type="button"
                  >
                    <X className="size-[20px]" />
                  </button>
                  <button
                    aria-label="I knew this"
                    className="flex size-[44px] items-center justify-center rounded-full border border-emerald-500/60 text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
                    data-testid="mark-got"
                    disabled={saving}
                    onClick={() => void mark(true)}
                    type="button"
                  >
                    <Check className="size-[20px]" />
                  </button>
                </div>
              ) : simple ? null : (
                <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
                  {GRADES.map(({ grade: value, label, variant }) => (
                    <Button className="h-auto flex-col gap-0.5 bg-background py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" data-testid={`grade-${value}`} disabled={saving} key={value} onClick={() => void grade(value)} variant={variant}>
                      <span>{label}</span>
                      {/* The real interval, from the real scheduler. Anki puts it here too. */}
                      <span className="text-[0.625rem] font-normal tabular-nums opacity-70">
                        {previews ? describeDelay(previews[value]) : ""}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
              {/* The switch itself, and the browse arrows it reveals. */}
              {simple && (
                <div className="flex w-full items-center justify-between pt-[4px]" data-testid="review-track-row">
                  {browsing ? (
                    <div className="flex items-center gap-[10px] text-xs tabular-nums text-(--ui-text-tertiary)">
                      <button
                        aria-label="Previous card"
                        className="flex size-[32px] items-center justify-center rounded-full text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) disabled:opacity-30"
                        disabled={browseAt === 0}
                        onClick={() => setBrowseAt((at) => Math.max(0, at - 1))}
                        type="button"
                      >
                        <ChevronLeft className="size-[16px]" />
                      </button>
                      <span data-testid="browse-position">{Math.min(browseAt + 1, deckCards.length)} of {deckCards.length}</span>
                      <button
                        aria-label="Next card"
                        className="flex size-[32px] items-center justify-center rounded-full text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) disabled:opacity-30"
                        disabled={browseAt >= deckCards.length - 1}
                        onClick={() => setBrowseAt((at) => Math.min(deckCards.length - 1, at + 1))}
                        type="button"
                      >
                        <ChevronRight className="size-[16px]" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs tabular-nums text-(--ui-text-tertiary)">
                      {lastGrade ? (
                        <button className="rounded-[8px] px-[8px] py-[4px] transition-colors hover:bg-(--ui-control-hover-background)" data-testid="simple-undo" disabled={saving} onClick={() => void undo()} type="button">
                          Undo
                        </button>
                      ) : null}
                    </span>
                  )}
                  {/* 🔴 A BUTTON WITH `role="switch"`, NOT A CHECKBOX, AND THE REASON IS A GUARD THAT
                      WAS RIGHT. `cards-are-output-only.test.ts` bans every `<input>` on this screen,
                      because the owner has twice said a learner may never type into a card. A hidden
                      checkbox behind a toggle is not a card editor, but it IS an input on the review
                      screen, and a guard that has to learn exceptions stops being a guard. A switch
                      needs no input element anyway. */}
                  <button
                    aria-checked={tracking}
                    className="flex cursor-pointer items-center gap-[8px] text-xs text-(--ui-text-secondary)"
                    data-testid="track-learning"
                    onClick={() => {
                      setTracking((was) => !was);
                      setRevealed(false);
                    }}
                    role="switch"
                    type="button"
                  >
                    Track learning
                    <span aria-hidden className={cn("relative h-[18px] w-[32px] rounded-full transition-colors", tracking ? "bg-(--ui-action)" : "bg-(--ui-bg-quaternary)")}>
                      <span className={cn("absolute left-[2px] top-[2px] size-[14px] rounded-full bg-white transition-transform", tracking && "translate-x-[14px]")} />
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid min-h-56 place-items-center bg-background p-8 text-center">
            <div>
              {/* 🔴 "CAUGHT UP" IS NOT TRUE WHILE A CARD IS MID-STEP, and saying it anyway is how a
                  learner closes the tab on unfinished work. If something is still walking its
                  learning steps, say when it comes back instead. */}
              <p className="text-sm font-semibold">{waitingMinutes === null ? "You’re caught up" : "Nothing due right now"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {waitingMinutes === null
                  ? "The next review will appear when a card is due."
                  : `The next card comes back in ${waitingMinutes} minute${waitingMinutes === 1 ? "" : "s"}.`}
              </p>
              <Button className="mt-5 bg-background" onClick={() => onOpenChange(false)} variant="outline">Done</Button>
            </div>
          </div>
        )}
    </>
  );

  // Docked beside the conversation: no dialog, no second Escape handler, no second close button —
  // `StudyPanel` owns all three. `tabIndex` is what makes the container focusable so the review
  // hotkeys work the moment the panel opens, without the learner having to click a card first.
  if (bare) {
    return (
      <div
        className="review-stage flex h-full min-h-0 flex-col px-4 py-3 outline-none"
        data-testid="review-bare"
        ref={scope}
        tabIndex={-1}
      >
        {open ? body : null}
      </div>
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="review-stage left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-none border-0 px-7 py-6" showCloseButton>
        <DialogTitle className="sr-only">{deck?.name ?? "Flashcard review"}</DialogTitle>
        <DialogDescription className="sr-only">Review the front of the card, reveal its answer, then grade your recall.</DialogDescription>
        {body}
      </DialogContent>
    </Dialog>
  );
}
