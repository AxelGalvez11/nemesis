"use client";

// The ONE interaction surface on the canvas.
//
// 🔴 THERE IS NO SECOND ANSWER BOX, and adding one is the mistake this file exists to prevent.
// Asking a question, answering a retrieval prompt, dictating that answer, giving a learning
// instruction and attaching material all happen here. The canvas around it can turn into a
// lesson, a question, a correction or a diagram; the place you interact with Nemesis does not
// move. That spatial constancy is the point — the recall stage used to grow its own textarea
// with its own microphone and its own submit button, which meant two composers on one screen
// and a learner having to work out which one was for them.
//
// What it is FOR comes from the teaching policy, not from the learner: `task` carries the
// active prompt, so the placeholder says "Answer…" for a one-word retrieval and "Explain it in
// your own words…" for an explanation. There is deliberately no mode selector — the canvas
// already knows which cognitive state it is in, and asking the learner to say it again would
// be asking them to do the system's job.
//
// Dictation TRANSFORMS this component in place: same pill, same size, same position, the input
// replaced by a live waveform and the send button by cancel/accept. No modal, no second card,
// no dimmed page.
//
// 🔴 SIZING: MEASURED WHERE NOTED, JUDGEMENT EVERYWHERE ELSE (compact-UI pass, owner spec,
// 2026-08-12). The in-app browser pane's own attempt to measure chatgpt.com hit a 401 from
// OpenAI's anonymous-session backend (sandboxed, no login) and was reported rather than faked.
// The owner then unblocked a second path — their own logged-in Chrome, read-only, navigate and
// inspect only, nothing clicked or typed into their account — and these values are real,
// `getBoundingClientRect()`/`getComputedStyle()` reads off ChatGPT's live composer:
//   pill height 52px, radius 28px (26px used here — half of 52, a true stadium cap, 2px off
//     their measured number and not visible at this scale), icon buttons 36×36px with 20px
//     (24px for the primary action) icons, input text 16px / 26px line-height.
// Padding, gap and our own spacing rhythm are still this file's judgement, not measured off
// theirs — ChatGPT's composer is a denser multi-row layout ours does not share the shape of, so
// matching its every internal margin would be copying a number, not a proportion.
//
// 🔴 THE INPUT TEXT SIZE IS WRITTEN `text-[16px]`, NOT A SCALE TOKEN — MEASURED AND STRUCTURAL,
// NOT A JUDGEMENT CALL. `apps/web`'s root is 112.5% (`html{font-size:112.5%}`), so `1rem` here
// renders at 18px, not 16 — the literal px value is the only way to land on the number that
// matters. ChatGPT's own measured input is also exactly 16px, which is not a coincidence: iOS
// Safari zooms the whole viewport in on focus for any text input under 16px, and there is no way
// back out of that zoom that reads as intentional. Even if a future remeasurement ever came back
// lower, this constraint would still win — do not "fix" this number down to match it, and do not
// silently swap it back to `1rem` for consistency with the rest of this file, which would
// reintroduce the zoom by way of looking like a tidy-up.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { DEFAULT_ANSWER_MODALITY, nextAnswerModality } from "@/lib/learn/answer-modality";
import type { CanvasBlock, LearnerInputModality } from "@/lib/learn/canvas-model";
import { endsPushToTalk, isTypingTarget, startsPushToTalk } from "@/lib/learn/canvas-hotkeys";
import {
  ACCEPTED_MATERIAL,
  ASK_PLACEHOLDER,
  CLARIFY_PLACEHOLDER,
  START_WITH_MATERIAL_PLACEHOLDER,
} from "@/lib/learn/canvas-tasks";
import { CAPABILITY_COPY, type ComposerCapability } from "@/lib/learn/composer-capability";
import { continueList, pastedTextFile } from "@/lib/learn/composer-text";
import type { ComposerIntent } from "@/lib/learn/composer-intent";
import { cn } from "@/lib/utils";
import { subscribeMicLevel } from "@/lib/workspace/mic-level";

import { composerControl } from "./canvas-progression";
import { CanvasVoiceBars } from "./canvas-voice-bars";
import { useCanvasDictation } from "./use-canvas-dictation";
import { useVoiceConversation } from "./use-voice-conversation";
import type { ResponseAudio } from "./use-response-audio";

/** An inert player for surfaces that mount the composer without one (previews), and for the
 *  FRONT DOOR, where no reply ever plays — the auto-send starts the canvas and the canvas
 *  speaks. Exported for canvas-home for exactly that reason. Never plays, so the voice loop
 *  simply treats every turn as a quiet one. */
export const IDLE_REPLY_AUDIO = {
  complete: false,
  currentTime: 0,
  failure: null,
  playing: false,
  reach: 0,
  status: "idle",
  stop: () => {},
} as const;
import { AddMenuRow, ADD_MENU, useMenuSide } from "./add-menu-row";
import { backspaceClearsCapability, CapabilityChip } from "./capability-chip";
import { AttachmentCard, AttachmentRow, type AttachmentState } from "./attachment-card";
import { ComposerSend } from "./composer-controls";

interface CanvasComposerProps {
  selected: readonly CanvasBlock[];
  onClearSelection: () => void;
  /** A question or instruction for Nemesis about the canvas. */
  onAsk: (text: string, capability: ComposerCapability | null) => void;
  /** A performance: the learner's answer to whatever is currently being asked. */
  onAnswer: (text: string, via: LearnerInputModality, tookMs?: number) => void;
  /** Adding material belongs here as well as in the sources panel: it is the one control the
   *  learner reaches for mid-lesson, and hunting for it inside a drawer is friction. */
  onFiles: (files: FileList | File[]) => void;
  /**
   * Start recording a lecture. Absent means this surface cannot record, and the `+` stays the plain
   * file control it has always been.
   *
   * 🔴 IT LIVES UNDER `+`, NOT AS A SECOND MICROPHONE. The mic beside the text is DICTATION —
   * speaking instead of typing, an answer or a question. Recording is capturing a lecture, which is
   * MATERIAL, and `+` is already labelled "Add material". Two mic glyphs side by side would make the
   * learner guess which one keeps their lecture, and §L groups the five composer behaviours exactly
   * this way: upload and record are both ways of bringing material in.
   */
  onRecord?: (() => void) | null;
  /**
   * Which one-shot capabilities this surface offers under `+`. Empty means none, and the `+` menu
   * is whatever it was without them.
   *
   * 🔴 A CAPABILITY IS NOT A MODE, AND §38 TURNS ON THAT DISTINCTION. The owner amended §38 on
   * 2026-08-23 to permit exactly this: "One-shot composer capabilities may explicitly declare user
   * intent or attach resources to the next submission… These capabilities clear after submission
   * and must not become persistent teaching modes." `capability` is therefore parent-owned and
   * cleared by `submit`; this component never holds it across a send. See composer-capability.ts.
   */
  capabilities?: readonly ComposerCapability[];
  /** The capability attached to the NEXT submission, or null. Parent-owned; see `capabilities`. */
  capability?: ComposerCapability | null;
  /** Select or clear the capability. Called with null by the chip's ×. */
  onCapability?: (capability: ComposerCapability | null) => void;
  /**
   * 🔴🔴🔴 WHAT SUBMITTING MEANS RIGHT NOW. ONE VALUE, DECIDED BY THE CALLER, NEVER RE-DERIVED HERE.
   *
   * This replaces `task: ActiveTask | null` plus the presence of `onStart` plus `inSession` — three
   * props that each independently implied a meaning, ordered by an `if` chain in `submit()`:
   *
   *     if (onStart) onStart(value);
   *     else if (answering) onAnswer(value, …);
   *     else onAsk(value);
   *
   * whose own comment claimed *"the caller only passes `onStart` in exactly that state, so this
   * branch cannot capture a genuine answer"*. The caller was quietly breaking that invariant on
   * every canvas that had material attached and had never had send pressed, which is most of them:
   * a real question was on screen, `Submit answer` was on the button, and the answer went to
   * `begin()` — a model call, a re-titled canvas, a different question, and no evidence row.
   *
   * Now there is one union that cannot hold two meanings and this component switches on it. See
   * composer-intent.ts for the full account and for why `answer` outranks `start`.
   */
  intent: ComposerIntent;
  /** The answer's player, watched by the voice conversation so the mic re-opens when the spoken
   *  reply finishes. The SAME controller the header's transport bar drives — pausing or scrubbing
   *  there and the loop here read one state. */
  voiceReplyAudio?: ResponseAudio;
  /** A voice conversation began on the FRONT DOOR and this canvas is its continuation: the loop
   *  is adopted mid-turn (see useVoiceConversation.adopt) so the stop pill and the lamp are up
   *  from the first frame and the microphone re-arms once the spoken reply finishes. */
  voiceArrival?: boolean;
  /** Reports the voice conversation starting and ending, so the canvas can force replies spoken
   *  for the session (see `alwaysSpeak` in use-canvas-voice.ts). */
  onVoiceConversation?: (active: boolean) => void;
  /**
   * Nemesis asked the learner a question about what to build, and they typed rather than tapped.
   *
   * 🔴🔴 REQUIRED, NOT OPTIONAL, AND THAT IS THE POINT. An optional handler would let a call site
   * mount this component with a clarification live and no route for it, and the submission would
   * fall through to `onAsk` — a brand new conversational turn, the pending question still on
   * screen, and the learner's answer read as a fresh question. Presence is not meaning (see
   * `onStart`); this is required so the compiler asks every caller where a clarification goes.
   */
  onClarify: (text: string) => void;
  busy: boolean;
  /* 🔴 `listenSignal` WAS HERE AND IS GONE, 2026-08-25. It was a nonce the voice hook bumped once
     Nemesis stopped speaking, so the microphone opened by itself after a question. The owner
     removed the menu row that turned that on — *"remove … the 'open mic after each question'
     option"* — which left nothing that could ever bump it. The prop, its effect and the preference
     behind it went together rather than staying as a path with no way in. Dictation itself is
     untouched: the microphone button in this composer, hold-space-to-talk and the transcript
     handling are all unchanged. */
  /**
   * The Canvas is showing something the learner is meant to READ, and pressing on is the next
   * move. `null` when there is nothing to advance past.
   *
   * 🔴 A POSITIVE SIGNAL, NEVER `!answering`. The negation of "a question is being asked" also
   * covers the landing page, a plain document with no task, and the empty state — a `✓` on any of
   * those is a control wired to nothing, which is worse than no control. Only the caller knows
   * whether the policy is presenting something acknowledgeable, so only the caller may say so.
   *
   * 🔴 AND PRESSING IT WRITES NO LEARNER EVIDENCE (interaction-model §I, acceptance N1). `✓` means
   * exactly "I am finished inspecting this state" — never "I understand this", never "I know
   * this". It is progression telemetry. The proof is the evidence table measured ACROSS the press,
   * not this comment and not the handler.
   */
  /**
   * Advancing is momentarily refused — the evidence from the last answer is still being written.
   *
   * 🔴 THE CONTROL STAYS, AND SAYS SO. `acknowledge()` returns early while recording, so a `✓`
   * wired straight to it would be a dead press: nothing happens, nothing explains why. Now that
   * the composer is the ONLY way forward, a dead press is the learner's whole path blocked.
   */
  advanceBusy?: boolean;
  /**
   * Material attached to a canvas that has not begun yet.
   *
   * 🔴 THE PREVIEW THE UX BRIEF DRAWS (§2), AND ITS OWN ACCEPTANCE CRITERION (§26, *"attachment
   * preview visible before send"*). The brief's sketch puts the chip immediately above the input:
   *
   *     [ Diabetes lecture.pdf ]
   *     Focus on the mechanisms and make sure I actually understand them.
   *     +                                                          mic  ↑
   *
   * 🔴 IT IS ALSO THE PROOF THAT ATTACHING DID NOT LAUNCH ANYTHING. §2: *"Attaching a source must
   * not auto-launch a workflow. Send is what creates and enters the Canvas session."* Before this,
   * a canvas with material sat on a dedicated screen reading "1 source attached" above a *"Help me
   * learn this"* button — a whole page to say what a chip says in a line, and a second control
   * where §15 allows exactly one. What confirms the ingest now is the Sources panel, which lists
   * every source with its host and a link that opens it.
   */
  /**
   * How many sources this canvas holds. A COUNT, because that is the only thing left to ask.
   *
   * 🔴 IT USED TO BE THE SOURCES THEMSELVES — `{id, title, sourceUrl}` — because this component
   * drew them as chips. It does not any more (owner 2026-08-21, see the render), and a list passed
   * to something that only measures its length is an invitation to start drawing it again. What
   * this decides is whether SEND means something with an empty box; nothing here needs a title.
   */
  attachedCount?: number;
  /**
   * Files the learner PICKED since their last send — names straight off the picker, not sources.
   *
   * 🔴🔴 THIS IS THE ATTACHMENT PREVIEW COMING BACK, WITH THE LIE REMOVED. The chips deleted on
   * 2026-08-21 (owner: "sources are still appearing on the chat composer which i dont want") died
   * of their data source: fed `canvas.sources`, they chipped pages the MACHINE grounded itself
   * with as though the learner had attached them. On 2026-08-23 the same owner, pointing at
   * ChatGPT's composer with two PDFs on it: "nemesis should also be able to attach attachments to
   * the chat composer like in this image before sending." Both are right, about different data.
   *
   * 🔴 SO THIS LIST IS FED BY THE PICK, NEVER BY THE CANVAS. `learning-canvas.tsx` records the
   * file names at the moment the learner chooses them and clears them on the next send. A
   * grounding page, a promoted web result, a source restored on reload — none of those pass
   * through the picker, so none of them can EVER appear here. The failure mode that killed the
   * old chips is unrepresentable, not discouraged.
   *
   * 🔴🔴 THE ✕ IS BACK, AND SO IS A STATE PER CARD (owner, 2026-08-31: *"the attachments attach to
   * composer before sending, that way user can see that the chat is processing it too and can
   * remove attachment if necessary"*). This comment used to read "NO ✕, DELIBERATELY — attach
   * ingests immediately, an ✕ would promise an un-ingest nothing can perform", and that reasoning
   * was sound about the OLD behaviour rather than about the right behaviour. What changed is one
   * level up: material now stages in the composer and is committed to the canvas by SEND, exactly
   * as it already worked on the front door. So there is nothing to un-ingest, and removing a card
   * means the obvious thing — this message goes without that file.
   *
   * `state` is that file's own progress: reading, ready, or failed. One line per card, because a
   * single composer-wide caption becomes a lie the moment one of three finishes.
   */
  recentAttachments?: readonly {
    readonly id: string;
    readonly title: string;
    readonly state?: AttachmentState;
    /** How much of that card's arc to draw, 0 to 1. See `lib/workspace/read-progress.ts`. */
    readonly progress?: number;
  }[];
  /** Drop this file from the message being written. Absent for a surface with nothing staged. */
  onRemoveAttachment?: (id: string) => void;
  /** Read it again, after a failure. Shown only on a failed card — see `AttachmentCard`. */
  onRetryAttachment?: (id: string) => void;
  /**
   * This canvas has not begun. Submitting starts it; `null` once it has.
   *
   * 🔴 SEND IS THE TRIGGER, NEVER ATTACH — that is the whole of §2, and it is why this is a
   * separate route rather than something `attachFiles` does on arrival. The learner may add a
   * second file, type an instruction, and only then commit.
   *
   * 🔴 ATTACHING HAS ALREADY HAPPENED BY THE TIME `attachedCount` IS NON-ZERO — `attachFiles` has
   * read the file and it is in `canvas.sources`. What has not happened is the canvas BEGINNING.
   * This surface offers no undo of the ingest, which is why nothing here draws a remove control
   * (and why the chips that used to imply one are gone).
   *
   * 🔴 AND IT ACCEPTS AN EMPTY STRING (§3). Sending with material and nothing typed means *"learn
   * this material with me"*; the caller infers it rather than making the learner say it. The
   * refusal that used to sit in `submit()` — `if (!value) return;` — silently threw exactly that
   * case away.
   */
  onStart: (text: string, capability: ComposerCapability | null) => void;
}

/** Grows to about six lines, then stops. Beyond that the box would eat the question. */
const MAX_COMPOSER_HEIGHT = 160;

export function CanvasComposer({
  onClarify,
  selected,
  onClearSelection,
  onAsk,
  onAnswer,
  onFiles,
  onRemoveAttachment,
  onRetryAttachment,
  capabilities = [],
  capability = null,
  onCapability,
  onRecord = null,
  intent,
  voiceArrival = false,
  voiceReplyAudio,
  onVoiceConversation,
  busy,
  advanceBusy = false,
  attachedCount = 0,
  recentAttachments = [],
  onStart,
}: CanvasComposerProps) {
  const [text, setText] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const addSide = useMenuSide(addOpen, "above");
  /* 🔴 THE `ink` REF WENT WITH THE PAGE (owner 2026-08-26, "remove pencil mode for now"). It held
   * the learner's scratch work above the prompt-changed effect so that reopening the sheet did not
   * lose several minutes of working out. With no door there is nothing to reopen. Restoring the
   * page restores this ref, and the reason it sat ABOVE the effect below rather than inside it. */
  const input = useRef<HTMLTextAreaElement>(null);
  /** Where the caret must land after a list continuation rewrites the text.
   *
   *  🔴 A REF AND A LAYOUT EFFECT, BECAUSE THE BOX IS CONTROLLED. Calling
   *  `setSelectionRange` beside `setText` sets it on the value React is about to
   *  replace, so the caret snapped back to the end of the line on every
   *  continuation. It has to be applied after the commit that carries the new
   *  text, and before the browser paints, or the caret is visibly seen moving. */
  const pendingCaret = useRef<number | null>(null);
  /** The file input is triggered from a menu item now, so it needs a handle rather than a wrapping
   *  label. It stays `sr-only` rather than `hidden` — a hidden input is out of the accessibility
   *  tree entirely. */
  const filePicker = useRef<HTMLInputElement>(null);
  const addMenu = useRef<HTMLDivElement>(null);
  const dictation = useCanvasDictation();
  /** How the answer in the box was produced, because §23 reads elapsed time differently for
   *  speech and typing and a mislabelled answer is read against the wrong baseline. Every change
   *  goes through `nextAnswerModality` — a capture that set this and was then thrown away has to
   *  take it back, and doing that by hand is exactly what was missed. */
  const inputModality = useRef<LearnerInputModality>(DEFAULT_ANSWER_MODALITY);
  /** 🔴 `useCallback([])` SO THIS IS SAFE TO PUT IN AN EFFECT'S DEPS. It closes over nothing that
   *  changes — a ref and a pure import — so a stale closure and a fresh one are the same function.
   *  Without a stable identity, anyone "completing" the deps of the prompt-changed effect below
   *  would make it re-run on EVERY render, and that effect calls `setText("")`: the learner's
   *  answer would vanish as they typed it. Stable identity makes the obvious edit harmless. */
  const modalityEvent = useCallback((event: Parameters<typeof nextAnswerModality>[1]) => {
    inputModality.current = nextAnswerModality(inputModality.current, event);
  }, []);
  /** When the current prompt appeared, for response latency. Reset per prompt, not per render. */
  const startedAt = useRef(Date.now());

  // The menu closes on a press anywhere else and on Escape. Without the first, a learner who
  // changed their mind has to find the `+` again to dismiss it; without the second it is a trap for
  // anyone on a keyboard.
  useEffect(() => {
    if (!addOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!addMenu.current?.contains(event.target as Node)) setAddOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setAddOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [addOpen]);
  /** Text typed before dictation started, so switching between talking and the keyboard
   *  mid-answer throws away neither half. */
  const typedBefore = useRef("");

  // 🔴 READ OFF THE INTENT, NEVER RE-DERIVED. `Boolean(task && !task.answered && task.placeholder)`
  // used to live here, which meant two files each deciding whether a task was answerable — and the
  // one that mattered for ROUTING was neither of them, it was whether `onStart` happened to be
  // non-null. There is one decision now and it was made before this component rendered.
  const taskId = intent.kind === "answer" ? intent.task.id : null;
  /* 🔴🔴 THERE IS NO `inSession`, AND THE COMPOSER HAS NO MODES (owner 2026-08-26: *"remove the
   * 'answer state', the canvas is supposed to be a conversation"*).
   *
   * It was `intent.kind === "answer" && intent.sink === "policy"`, and three things branched on it:
   * the `+` was removed, the page-to-work-on button was ADDED, and the placeholder and send label
   * changed to "Type your answer…" / "Submit answer". Each had a reason. Together they turned a
   * conversation into a form the moment Nemesis asked anything, and a learner who wanted to attach
   * a file or change the subject found the control for it had gone.
   *
   * 🔴 THE ROUTING IS UNTOUCHED, AND THAT DISTINCTION IS THE WHOLE OF THIS CHANGE. `intent` still
   * decides what a submission MEANS — an answer still reaches the judge and still lands in
   * `learner_evidence` — see `composer-intent.ts`, whose header documents the defect that ordering
   * exists to prevent. What is gone is the composer LOOKING different while that is true. A mode
   * is a claim about what you may do; the intent is a fact about what you are doing. */

  useEffect(() => {
    setText("");
    modalityEvent({ kind: "prompt_changed" });
    typedBefore.current = "";
    startedAt.current = Date.now();
    // 🔴 THIS EFFECT STILL KEYS ON `taskId`, WHICH IS THE POINT OF KEEPING IT. The composer clears
    // its text and restarts its timing whenever the thing being asked changes, and that is true
    // whether or not the composer looks any different while it is true — see the note on the
    // missing `inSession` above. The page to work on used to be deliberately NOT closed here; that
    // rationale now lives with the page, in written-work-sheet.tsx.
  }, [taskId]);

  useEffect(() => {
    if (!dictation.listening && !dictation.transcript) return;
    modalityEvent({ kind: "captured", via: "spoken" });
    setText([typedBefore.current, dictation.transcript].filter(Boolean).join(" ").trimStart());
  }, [dictation.listening, dictation.transcript]);

  // ── One line until the answer genuinely needs two ───────────────────────────
  //
  // 🔴 DRIVEN BY THE VALUE, NOT BY THE KEYSTROKE. Resizing inside `onChange` misses every way the
  // text changes without one — submitting (which clears it), dictation writing a transcript,
  // switching prompts — so the box kept the height of the answer before last and sat there
  // several lines tall with nothing in it.
  //
  // 🔴 AND `overflow` IS PART OF THE MEASUREMENT, NOT DECORATION. A textarea that may scroll
  // reserves the scrollbar's width and paints its track, which is the grey stripe down the inside
  // of the pill: permanently visible, on a control that is one line tall and has nothing to
  // scroll. Hidden while the text fits, `auto` only once it genuinely exceeds the cap, so nothing
  // is ever unreachable.
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    // 🔴 EMPTY MEANS NO INLINE HEIGHT AT ALL, NOT A MEASUREMENT OF NOTHING. Measuring here can
    // run while the surface is still settling — hydration recovery re-mounts this tree before
    // flex has given the box its width — and a zero-width textarea reports its PLACEHOLDER
    // wrapped into a column, so an empty one-line box was stamped `height: 160px` and stayed a
    // tall blank pill until the first keystroke re-measured it (owner screenshot, 2026-08-23).
    // An empty box needs no measurement: clearing the style hands height back to the CSS
    // min-height, which is one line by construction.
    if (!text) {
      element.style.height = "";
      element.style.overflowY = "hidden";
      return;
    }
    element.style.height = "auto";
    const needed = element.scrollHeight;
    element.style.height = `${Math.min(needed, MAX_COMPOSER_HEIGHT)}px`;
    element.style.overflowY = needed > MAX_COMPOSER_HEIGHT ? "auto" : "hidden";
    // 🔴 `dictation.listening` IS A DEPENDENCY BECAUSE THE TEXTAREA LEAVES THE TREE WHILE IT IS
    // TRUE. The waveform takes the input's place during dictation, so every transcript update ran
    // this effect against `input.current === null` and did nothing — and when the ✓ brought the
    // textarea back, `text` had already settled, nothing re-ran, and a five-line dictated answer
    // sat in a one-line box (owner report, 2026-08-23: "the chat composer does not get bigger as
    // the more dictated words there are"). Keying on the flag re-measures at the remount. (The
    // `listening` alias below this effect is not usable here — a const in its temporal dead zone.)
  }, [text, dictation.listening]);

  useLayoutEffect(() => {
    const at = pendingCaret.current;
    if (at === null) return;
    pendingCaret.current = null;
    input.current?.setSelectionRange(at, at);
  }, [text]);

  // Summonable from anywhere: "/" focuses the bar unless the learner is already typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Material is waiting and the canvas has not begun — so an empty box is still submittable.
   *
   *  🔴 `intent.kind === "start"`, NOT `Boolean(onStart)`. The handler is always passed now; whether
   *  it is the RIGHT one is the intent's decision, and asking "were we given a function?" is exactly
   *  the reasoning that routed answers into `begin()`. */
  // 🔴 `!capability` IS THE ARGUMENT-DROP FIX'S OTHER HALF. An empty send is a real submission
  // when material is staged — but it carries no words, and a staged capability is a declaration
  // ABOUT words. Allowing it would force `beginOrAnswer`'s empty branch to silently drop the
  // declaration, which is the exact defect the whole plumbing exists to end. Refusing the send
  // keeps the placeholder's question ("What do you want to learn?") one that has to be answered.
  const canStartFromAttachment = intent.kind === "start" && attachedCount > 0 && !capability;

  /**
   * Everything `+` can do here, in menu order.
   *
   * 🔴🔴 THE LIST IS THE COUNT, WHICH IS THE ONLY WAY THE ONE-OFFER SHORTCUT STAYS CORRECT. `+`
   * opens a menu when it has a choice to present and performs the action directly when it does
   * not — a one-item menu is a second click charged for nothing. That shortcut used to be spelled
   * `onRecord ? openMenu() : filePicker.click()`, which hard-codes the assumption that the single
   * remaining offer is always upload. Add a capability under a flag and that assumption is false in
   * a way nothing catches: the button opens a file dialog and the offer it was supposed to run is
   * unreachable, with no error. Running `offers[0].run()` cannot make that mistake, because the
   * thing it runs is the thing the list contains.
   */
  const addOffers = useMemo(() => {
    const offers: Array<{ detail?: string; icon: string; key: string; label: string; run: () => void; tint?: string }> = [
      // 🔴 EVERY ROW CARRIES ITS DETAIL NOW. The two built-in offers had none, so the menu mixed
      // one-line rows with two-line ones and read as two lists that happened to share a box. With
      // label and detail on one line (see `AddMenuRow`) a missing detail is simply a shorter row.
      {
        detail: "From your computer",
        icon: "file",
        key: "upload",
        label: "Upload material",
        run: () => filePicker.current?.click(),
      },
    ];
    if (onRecord) {
      offers.push({ detail: "Capture it as it happens", icon: "record", key: "record", label: "Record a lecture", run: onRecord });
    }
    for (const offered of capabilities) {
      const copy = CAPABILITY_COPY[offered];
      offers.push({
        detail: copy.detail,
        icon: copy.icon,
        key: offered,
        label: copy.label,
        tint: copy.tint,
        // 🔴 SELECTING IS ALL IT DOES. It stages a declaration on the next submission; it starts
        // nothing, calls no model, and changes nothing on the page. That is what keeps it a
        // capability rather than the mode selector §38 bans.
        run: () => onCapability?.(offered),
      });
    }
    return offers;
  }, [capabilities, onCapability, onRecord]);

  /**
   * Material in this message that is not ready to be learned from yet.
   *
   * 🔴🔴 THE SAME RULE THE FRONT DOOR ALREADY HOLDS (#967, owner: *"block the send button until it
   * process everything all the documents… to assure quality"*). His argument carries here
   * unchanged: a file that failed to read would otherwise ride along in silence and the reply
   * comes back thinner than the learner's material with nothing saying why.
   *
   * 🔴 THIS DOES NOT CONTRADICT #888. That ruling was *"attaching a document mid chat should not
   * immediately make the chat go into processing mode"* — the CANVAS must not be taken over, the
   * character must not walk to the middle, the page must not blank. None of that happens: the
   * canvas carries on, and the only thing that waits is the one control whose press would send an
   * unread document.
   */
  // 🔴🔴 A FAILED FILE NO LONGER HOLDS THE SEND HOSTAGE. This gate used to be "any card reading OR
  // failed", so one unreadable file in a batch of fifty made Send dead for good, with the card to
  // remove hidden somewhere along a scroller. Owner, 2026-09-03: *"there should be no problem with
  // any of them."* A file still being read is a real wait, and the only one: the send would
  // otherwise go out without material the learner can see on the cards. A file that failed is
  // reported in red on its own card, is left OUT of the send by `commitStaged`, and stays in the
  // composer so it can be retried or removed. Nothing unread ever rides a turn.
  const materialNotReady = recentAttachments.some((file) => file.state === "reading");
  const someFailed = recentAttachments.some((file) => file.state === "failed");
  const sendLabel = materialNotReady
    ? "Reading your document…"
    : someFailed
      ? "Send (a document that couldn't be read stays behind)"
      : "Send";

  const submit = () => {
    const value = text.trim();
    // 🔴 THE `!value` REFUSAL IS NOW CONDITIONAL, AND THAT ONE CHARACTER IS §3. It used to be
    // unconditional, so "send a file with no accompanying text" delivered the file and then
    // returned before anything began — the canvas sat on its holding screen and the learner's
    // press did nothing they could see. An empty box is a real submission when material is
    // attached and the canvas has not started; everywhere else it is still nothing to send.
    if (busy) return;
    // 🔴 THE KEY OBEYS THE SAME GATE AS THE BUTTON. Enter reaches `submit` without passing the
    // control's `disabled`, so a check that lived only there would leave the commonest route open.
    if (materialNotReady) return;
    // 🔴 A STAGED SELECTION IS A SUBMISSION, EXACTLY AS A STAGED FILE IS. Without this clause the
    // send button rendered (see `hasSelection`) and pressing it did nothing at all — worse than the
    // missing button it replaced, because a control that visibly does nothing reads as broken
    // rather than absent. The composer asks *"What should Nemesis do with this?"*; sending without
    // typing is the learner answering "the obvious thing", and the caller resolves what that is.
    if (!value && !canStartFromAttachment && selected.length === 0) return;
    setText("");
    // 🔴 AND THE TRANSCRIPT IS SPENT WITH IT (owner 2026-08-31: *"once it sends things, the chat
    // composer should be empty until they continue speaking"*). `dictation.stop()` keeps its words,
    // which is ✓'s contract, where the learner reviews before sending. So a voice turn's auto-send
    // flipped `listening` with the transcript still full, and the sync effect above wrote the whole
    // sent turn straight back into the box this line had just cleared; it sat there, looking
    // editable, for the length of the spoken reply. Worse, that same stray run fired `captured via
    // "spoken"` AFTER `submitted`, so the NEXT answer was filed as speech even when typed — judged
    // under the speech-leniency instruction and timed on the speech clock (the exact defect
    // answer-modality.ts exists to prevent). One reset, in the same batch as the clear: the effect
    // re-runs against an empty transcript and does neither. The held verdict never reaches this
    // line, so a graded answer's words still stay in the box.
    if (dictation.transcript) dictation.reset();
    // 🔴🔴 ONE SWITCH ON ONE VALUE. Same box, same key, different meaning — and the meaning was
    // decided once, by `composerIntent`, from the live surface rather than from which handlers this
    // component happens to hold.
    //
    // 🔴 DO NOT REINTRODUCE `if (onStart) … else if (answering) …`. That ordering is the defect:
    // `onStart` was non-null on every canvas whose stored state had not advanced, which includes
    // every canvas with a question staged on attached material, and it silently outranked a real
    // answer to a real question. `answer-is-not-a-start.test.ts` fails if the precedence returns.
    // 🔴🔴 THE CAPABILITY RIDES THE SAME PIPELINE AS THE TEXT — IT IS NOT A SECOND PATH.
    // Owner, 2026-08-23: "The button shouldn't become a separate execution path; it should add
    // structured intent to the same submission pipeline everything else already uses."
    //
    // 🔴 AND `answer` CARRIES NONE. A capability is offered only outside a session (see the `+`
    // menu's guard), so this branch cannot normally hold one — but a stale selection surviving into
    // an answer would attach a curriculum request to a learner's answer to a question, which is the
    // class of defect `composer-intent.ts` exists to end. Stated here rather than assumed.
    // A held voice conversation resumes on the learner's own send — see use-voice-conversation.ts.
    voiceLoop.noteSent();
    if (intent.kind === "answer") onAnswer(value, inputModality.current, Date.now() - startedAt.current);
    // 🔴🔴 BEFORE `onAsk`, AND WITHOUT THIS LINE THE CARD IS DECORATION. `onAsk` opens a fresh
    // conversational turn: the learner's "academic" would be read as a new question, the pending
    // card would still be on screen, and the turn it was holding would never finish. The intent
    // already knows which of the two this is — the composer must not re-derive it.
    else if (intent.kind === "clarify") onClarify(value);
    else if (intent.kind === "start") onStart(value, capability);
    else onAsk(value, capability);
    // 🔴 ONE-SHOT, ALWAYS. A capability that survived its own submission would be a persistent mode,
    // whatever it was called, and §38 would be right to ban it. See `clearsOnSubmit`.
    if (capability) onCapability?.(null);
    modalityEvent({ kind: "submitted" });
    typedBefore.current = "";
  };

  const startDictation = () => {
    typedBefore.current = text;
    dictation.reset();
    dictation.start();
  };

  /** × — throw the capture away and put the composer back as it was. 🔴 INCLUDING THE MODALITY:
   *  without the discard the flag stayed "spoken", so a learner who spoke, changed their mind and
   *  then TYPED had a typed answer graded under the speech-leniency instruction and stored against
   *  the wrong response-time baseline. See answer-modality.ts. */
  const cancelDictation = () => {
    dictation.stop();
    dictation.reset();
    modalityEvent({ kind: "capture_discarded" });
    setText(typedBefore.current);
  };

  /** ✓ — accept what was heard. It lands in the composer as editable text; it does NOT submit.
   *  Speech recognition mishears, and auto-submitting would make a transcription error
   *  indistinguishable from a wrong answer in the evidence. */
  const acceptDictation = () => dictation.stop();

  const listening = dictation.listening;


  // ── Hold space to talk ──────────────────────────────────────────────────────
  //
  // 🔴 SPACE IS THE MOST DANGEROUS KEY TO CLAIM. It types a character, it scrolls the page, and it
  // activates whatever button has focus — including the Continue the learner just pressed with the
  // mouse. Every one of those is prevented here rather than hoped away: the decision refuses inside
  // any text field (canvas-hotkeys.ts), and the default is stopped on the way down AND on the way
  // up, because a button's `click` is synthesised from keyup.
  //
  // 🔴🔴 RELEASE IS TRACKED BY WHO STARTED IT. Without `heldByKey`, letting go of space would also
  // close a microphone the learner had opened with the button and was still talking into. The flag
  // is the difference between "stop the thing this key started" and "stop dictation".
  //
  // 🔴🔴 AND KEYUP IS NOT GUARANTEED TO ARRIVE. Hold space, press Cmd-Tab, and the window loses
  // focus mid-hold: no keyup is ever delivered and the microphone stays open indefinitely. That is
  // the one failure here that costs money and privacy rather than a click, so blur and a hidden tab
  // release it exactly as letting go does.
  //
  // 🔴 RELEASING DOES NOT SUBMIT. `dictation.stop()` is what ✓ does: the transcript lands in the
  // composer as editable text. Speech recognition mishears, and auto-submitting would make a
  // transcription error indistinguishable from a wrong answer in the evidence.
  const heldByKey = useRef(false);
  useEffect(() => {
    const release = () => {
      if (!heldByKey.current) return;
      heldByKey.current = false;
      dictation.stop();
    };
    const onDown = (event: KeyboardEvent) => {
      if (!startsPushToTalk(event, {
        // 🔴 ALWAYS FALSE NOW: the page to work on has no door (see the note by the send button).
        // The parameter stays on `startsPushToTalk` because that pure function still documents the
        // rule — you must not start dictating over a page somebody is writing on — and the rule has
        // to survive the door coming back.
        drawing: false,
        listening,
        supported: dictation.supported,
        typing: isTypingTarget(document.activeElement),
      })) return;
      event.preventDefault();
      heldByKey.current = true;
      startDictation();
    };
    const onUp = (event: KeyboardEvent) => {
      if (!endsPushToTalk(event) || !heldByKey.current) return;
      event.preventDefault();
      release();
    };
    const onHidden = () => { if (document.visibilityState === "hidden") release(); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onHidden);
      // 🔴 AND ON UNMOUNT TOO. The composer disappears while a recording is running and while the
      // canvas reloads; a microphone opened by a key hold must not outlive the surface it was
      // opened for.
      release();
    };
    // `startDictation` is deliberately not a dependency, the same choice the voice-mode effect
    // above makes: it is redefined every render, and depending on it would rebind four listeners
    // on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation.supported, dictation.stop, listening]);

  // ── §I: the composer is the only progression control ────────────────────────
  //
  //   exposition   empty composer  ->  ✓            response begins  ->  send
  //   production   empty composer  ->  NO CONTROL   response exists  ->  send
  //
  // 🔴 THERE IS NEVER BOTH A `✓` AND A SEND. One location, one primary action, decided by state.
  //
  // 🔴 AND IN A PRODUCTION STATE THE CONTROL IS ABSENT, NOT DISABLED. It used to render disabled
  // whenever nothing was typed. Disabled and absent look similar and mean different things: N3's
  // proof is *the absence*, because a greyed control still advertises that pressing on is an
  // option, and the whole point of a required demonstration is that bypassing it is not one.
  // Integration measures the element, not its `disabled` attribute.
  // 🔴 ONE VALUE, NOT TWO BOOLEANS — see canvas-progression.ts. A pair of flags can be true at
  // once; this cannot, so "never both" is a property of the type rather than of remembering.
  // 🔴 THE `✓` LEFT THIS COMPONENT (owner, §38/§39). Moving on is now a `Continue` rendered below
  // the material that asks to be read — a passage or a correction — because §38 says there is ONE
  // button and §39 says what triggers it is the COGNITIVE MODE the policy declares, not anything
  // the composer can see. What is left here is what the composer was always for: sending.
  // The turn-based voice conversation (owner 2026-08-30: *"the send button should function like
  // in chatgpt becoming the voice button… it should work like claude where its not real time
  // voice but just quick tts and stt"*). The loop lives in use-voice-conversation.ts; what this
  // component contributes is the same dictation instance (one microphone), the same submit (one
  // pipeline), and the buttons below.
  const voiceLoop = useVoiceConversation({
    busy,
    dictation,
    onActiveChange: onVoiceConversation,
    replyAudio: voiceReplyAudio ?? IDLE_REPLY_AUDIO,
    submit: () => {
      // 🔴 A GRADED ANSWER IS NEVER AUTO-SENT. Recognition mishears, and a misheard answer
      // written into the evidence is indistinguishable from a wrong one — the same rule that
      // keeps `acceptDictation` from submitting. The words stay in the box; the learner sends.
      if (intent.kind === "answer") return "held";
      if (busy) return "retry";
      const value = text.trim();
      if (!value && !canStartFromAttachment && selected.length === 0) return "retry";
      submit();
      return "sent";
    },
  });

  // A conversation that began on the front door arrives with its first turn already in flight.
  // Adopt exactly once: the loop enters at "waiting", the slot shows Stop, the lamp lights, and
  // the reply speaks before the microphone opens (the canvas set the packet fact itself — see
  // learning-canvas's spokenArrival).
  const adoptedArrival = useRef(false);
  useEffect(() => {
    if (!voiceArrival || adoptedArrival.current) return;
    adoptedArrival.current = true;
    voiceLoop.adopt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceArrival]);

  const control = composerControl({
    hasResponse: Boolean(text.trim()),
    hasAttachment: canStartFromAttachment,
    // A staged passage is something to send, exactly as a staged file is — see `hasSelection`.
    hasSelection: selected.length > 0 && !listening,
  });
  const showSend = control === "send";

  return (
    <>
      {/* The pill FLOATS: no footer container, no top border, canvas visible all around it. The
          gradient is a scrim so text scrolling underneath does not collide with the input — page
          colour fading to nothing, which draws no edge of its own.
          🔴 THIS ONE STAYS, UNLIKE THE MASTHEAD'S. The top gradient was removed the same day
          because it reached 24px into the column's resting position and dissolved the top of the
          question; this one sits under the content rather than over its resting place, and what it
          prevents — a paragraph printing through the input — has no other fix that does not draw a
          hard line across the page. If it turns out to be eating descenders too, it goes the same
          way. */}
      <div
        className={cn(
          // 🔴 24px OFF THE BOTTOM, MEASURED, NOT `pb-4`. This app's root is 112.5%, so `pb-4` is 18px
          // here against the reference's 24. Read in the owner's own account 2026-08-31: the composer
          // form's bottom edge sits 24px above the viewport floor.
          "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[24px]",
          "bg-gradient-to-t from-(--ui-bg-editor) via-(--ui-bg-editor)/85 to-transparent pt-14",
        )}
      >
        {/* 🔴 THE ID IS LOAD-BEARING, NOT A HOOK FOR STYLING. `CharacterDock` measures this box
            and floats clear of its TOP edge, so the character holds its place while the
            composer grows downward as an answer is typed. Renaming it fails quietly — the
            dock falls back to a fixed offset and the character starts overlapping it. */}
        <div className="pointer-events-auto w-full max-w-[var(--composer-max-width)]" id="canvas-composer">
        {/* 🔴 THE PAGE TAKES THE COMPOSER'S WHOLE PLACE, THE SAME AS DICTATION'S `listening` BRANCH
            DOES FURTHER DOWN — see written-work-sheet.tsx's file header. Nothing below this
            branches on `drawing`; the sheet is a full substitute for the chips-and-pill content,
            not a layer over it, so there is still exactly one place you interact with Nemesis.

            🔴 AND ITS SUBMISSION IS THE SAME SUBMISSION. It calls `onAnswer` with the modality and
            the elapsed time this component already tracks for typed and spoken answers, so written
            work is not a second route into the evidence log; it is a third way of producing the
            one answer the one send path already carries. */}
        <>
        {/* 🔴🔴 THE SOURCE CHIPS ARE GONE FROM HERE. THE SOURCES PANEL IS WHERE SOURCES LIVE.
            Owner, 2026-08-21: *"sources are still appearing on the chat composer which i dont want.
            the sources should appear in the sources."* This is the second time the composer has had
            to give them up: on 2026-08-20 the same chips moved from a row ABOVE the composer to a
            row INSIDE it, which was the wrong reading of *"i dont want the attachments to be above
            the chat composer at all"*.

            🔴 AND WHAT MADE IT WRONG IS WHAT THE CHIPS CAME TO MEAN. They were authored as an
            attachment PREVIEW — the file you just picked, still visible, not yet committed — and
            they were fed `canvas.sources`, which is every source the canvas holds. Once a topic
            with no material grounds itself by searching the web (`ground()` in use-canvas-session),
            the machine's own reading list appeared over the learner's composer as though they had
            attached it. Measured by the owner, on the turn that produced this note: asking to learn
            a language put two marketing pages for a language app in the box.

            A source panel that lists everything is honest about what it is. A composer chip claims
            "this is what your next message is carrying", which for a page nobody chose is a lie.
            `canvas-controls.tsx` already draws every source, with its host, its excerpt count and a
            link that opens it, which is strictly more than these chips ever showed.

            🔴 THE BEHAVIOUR STAYS. `canStartFromAttachment` still makes an empty box submittable
            when material is waiting, because that is about what SEND means, not about what is
            drawn. Only the display went.

            🔴 2026-08-23: THE DISPLAY IS BACK, FED DIFFERENTLY — see `recentAttachments`. Chips now
            draw only files the learner picked this turn, so the machine's reading list can never
            reappear over the composer. */}
        {selected.length > 0 && !listening && (
          <div className="mb-1.5 ml-1 flex w-fit max-w-full items-center gap-2 rounded-full bg-(--ui-bg-elevated) py-1 pl-3 pr-2 shadow-sm ring-1 ring-(--ui-stroke-tertiary)">
            {/* 🔴 THE CHIP HAS TO SAY WHAT IT IS. It used to print the quoted words and nothing
                else, so it read as a stray fragment of the page floating over the composer — the
                owner's words were *"a bubble which I don't understand the function of"*. A quoted
                string is not self-describing: it looks identical whether it is something you are
                about to act on, something Nemesis just said, or a leftover. One word of label and
                a mark that means "quotation" turn it into an object with a purpose. */}
            <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="quote" size="0.6875rem" />
            <span className="shrink-0 text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
              {selected.length === 1 ? "Selected" : `${selected.length} selected`}
            </span>
            <span className="truncate text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
              {selected.length === 1
                ? `“${selected[0]?.content.slice(0, 60) ?? ""}${(selected[0]?.content.length ?? 0) > 60 ? "…" : ""}”`
                : ""}
            </span>
            <button
              aria-label="Clear selection"
              className="shrink-0 text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
              onClick={onClearSelection}
              type="button"
            >
              <Codicon name="close" size="0.6875rem" />
            </button>
          </div>
        )}

        {/* 🔴 THE BOX IS ONE CAPSULE AGAIN. It grew a second radius (20px) on 2026-08-20 for the
            row of source chips it carried inside it; the chips are gone (see above), so the only
            thing that changes its height now is the text the learner is typing, and a growing
            textarea does not want a different corner. */}
        <div
          className={cn(
            "relative flex flex-col bg-(--composer-fill)",
            // 🔴 THE TOKEN, NOT A LITERAL — THE FRONT DOOR FLIES ITS COMPOSER INTO THIS ONE'S PLACE.
            // These two pills are the same object to a learner: the front door's composer travels
            // down and the route swaps under it, so any difference between the two shapes is a pop
            // at the exact instant the swap happens. This was `rounded-[26px]` against the front
            // door's `--composer-radius` of 28px, and the row below was `px-[12px]` against a
            // `--composer-pad-x` of 8px — a 2px corner and a 4px control shift, arriving together.
            // The tokens carry the measured values (see globals.css, which records that 8px is what
            // the reference measures); a literal here is a copy that drifts and never fails a test.
            "rounded-[var(--composer-radius)]",
            "shadow-[var(--composer-edge)]",
            selected.length > 0 && !listening && "ring-(--ui-action)/50",
          )}
        >
          {/* 🔴 THE SESSION'S LAMP — candidate C from /dev-preview/voice-glow, shipped subtle
              (owner 2026-08-31: *"C but make the reactivity be subtle?"*). Mounted for the WHOLE
              conversation, not just while listening: the meter closes while the reply speaks, so
              without the steady floor the halo would black out mid-turn and read as the feature
              dying. Never mounted for plain dictation or typing. */}
          {voiceLoop.active && <VoiceSessionGlow />}
          {/* 🔴🔴 THE ATTACHMENTS LIVE INSIDE THE BOX NOW (owner 2026-08-26: *"attaching docs to the
              chat doesnt match chatgpt either"*, and on 2026-08-20: *"i dont want the attachments
              to be above the chat composer at all"*). They had drifted back out to a detached row
              of pills floating over the composer — the exact thing objected to, and the exact thing
              the reference does not do. A staged file belongs to the message being written, so it
              sits in the same container as the words. See `attachment-card.tsx` for the measured
              geometry; the pill this replaces was ~30px tall with a 12px name and no type line. */}
          {recentAttachments.length > 0 && !listening && (
            <AttachmentRow>
              {recentAttachments.map((file) => (
                <AttachmentCard
                  className="max-w-[260px] shrink-0"
                  key={file.id}
                  name={file.title}
                  {...(onRemoveAttachment ? { onRemove: () => onRemoveAttachment(file.id) } : {})}
                  {...(onRetryAttachment ? { onRetry: () => onRetryAttachment(file.id) } : {})}
                  progress={file.progress ?? 0}
                  state={file.state ?? "ready"}
                />
              ))}
            </AttachmentRow>
          )}
          {/* The input row, on the same tokens the front door's composer uses. */}
          {/* 🔴🔴 `items-end`, NOT `items-center` — THE CONTROLS STAY ON THE FLOOR OF THE BOX
              (owner 2026-08-31: *"when the chat composer expands because of the lot of text… the
              composer buttons stay fixed to, like, the bottom, like in ChatGPT"*). Centred, every
              button drifted down the pill as the text grew, so the send target moved while
              somebody was still typing toward it. Bottom-aligned they are where they were when
              the box was one line, whatever it becomes.
              🔴 AND ONE LINE STILL LOOKS EXACTLY AS IT DID, WHICH IS WHY THE TEXTAREA'S PADDING
              MOVED WITH THIS. 8px above and below a 36px control is the 52px
              `--composer-min-height`; the textarea's own one-line height is tuned to that same
              36px below, so at one line bottom-aligning and centring are the same picture and
              only the grown box differs. */}
          <div className="flex min-h-[var(--composer-min-height)] items-end gap-0 px-[var(--composer-pad-x)] py-[8px]">
            {/* Stays put through every state, including dictation: spatial continuity is the
                reason there is one composer at all. Subdued, not moved, while listening.
                🔴 ALWAYS PRESENT since 2026-08-26: it used to vanish once the policy was
                waiting on an answer, which took away the only way to attach anything mid-lesson. */}
            {/* 🔴 ONE INPUT, TRIGGERED FROM TWO PLACES. `sr-only`, NOT `hidden` — a hidden input is
                out of the tab order and out of the accessibility tree. It sits outside the
                conditional below so that a menu closing mid-pick cannot unmount the element the
                browser is holding a file dialog open against. */}
            {/* 🔴 `.xlsx,.csv` ADDED — THE COMPOSER WAS THE ONLY DOOR REFUSING SPREADSHEETS. The
                Sources panel (`canvas-controls.tsx`) and the front door (`canvas-home.tsx`) both
                accepted them; this list did not, so a learner was told by one control that their
                spreadsheet was unsupported and by another that it was fine. §2 names a spreadsheet
                explicitly among what the composer must take, and §15's one-component rule makes a
                per-door capability list exactly the kind of drift it exists to prevent.
                `canvas-shell.test.ts` now pins the three lists equal. */}
            <input
              accept={ACCEPTED_MATERIAL}
              className="sr-only"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) onFiles(event.target.files);
                event.target.value = "";
              }}
              ref={filePicker}
              tabIndex={-1}
              type="file"
            />

            {(
            // 🔴🔴 NOT `relative` — THE MENU HANGS OFF THE COMPOSER, NOT OFF THIS BUTTON. A fixed
            // offset from the `+` was measured when this box was one 52px row, and the box grows: at
            // three lines of typing, `bottom-[46px]` put the menu straight over the learner's own
            // words. The card above is `relative`, so with nothing positioned in between, `bottom-full`
            // means "clear of the whole pill" at every height it can take. The front door carries the
            // same change with `top-full`; see its note for the report that found this.
            <div className="shrink-0" ref={addMenu}>
              <button
                aria-expanded={addOffers.length > 1 ? addOpen : undefined}
                aria-haspopup={addOffers.length > 1 ? "menu" : undefined}
                aria-label="Add material"
                className={cn(
                  // 36×36, MEASURED -- ChatGPT's "Add files and more" button is the same box size
                  // every icon button on their composer uses, ours included now.
                  "flex h-[36px] w-[36px] items-center justify-center rounded-full transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--ui-action)",
                  listening
                    ? "text-(--ui-text-quaternary)"
                    : "text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)",
                )}
                // 🔴 WITH NOTHING TO CHOOSE BETWEEN, THERE IS NO MENU — a one-item menu is a second
                // click charged for nothing. 🔴 AND THE SHORTCUT RUNS THE LIST'S OWN ONE ITEM,
                // never a hard-coded action. This was `onRecord ? menu : filePicker.click()`, which
                // assumes the single remaining offer is always upload — add an offer under any flag
                // and that assumption fails silently, with the button opening the wrong thing and
                // the real offer unreachable.
                onClick={() => (addOffers.length > 1 ? setAddOpen((open) => !open) : addOffers[0]?.run())}
                title="Add material"
                type="button"
              >
                <Codicon name="add" size="20px" />
              </button>

              {addOffers.length > 1 && addOpen && (
                <div
                  // 🔴 ABOVE BY PREFERENCE — this composer sits on the floor of the window, so
                  // below is almost never the answer. It still flips and caps itself, because a
                  // short window with a grown composer can leave too little room on either side.
                  className={cn("absolute left-0", addSide.side === "below" ? "top-full mt-[8px]" : "bottom-full mb-[8px]", ADD_MENU)}
                  ref={addSide.ref}
                  style={{ maxHeight: addSide.maxHeight }}
                  // 🔴 A SENTINEL FOR THE CHARACTER'S DOCK, PRESENT ONLY WHILE THE MENU IS OPEN.
                  // The popover is absolutely positioned, so `#canvas-composer`'s bounding box —
                  // the one CharacterDock measures to float clear of — cannot see it, and the
                  // character sat on top of the open menu (owner report, 2026-08-23). The dock
                  // measures the union of the composer and this element; agreed with the mascot
                  // lane 2026-08-23, and renaming it re-creates the clash silently.
                  data-canvas-composer-popover=""
                  role="menu"
                >
                  {/* One row per offer, from the same list the shortcut runs. The record row keeps
                      a filled circle, not a microphone — the mic on the right of this composer is
                      dictation, and the two must never look like the same offer. */}
                  {addOffers.map((offer) => (
                    <AddMenuRow
                      detail={offer.detail}
                      icon={offer.icon}
                      key={offer.key}
                      label={offer.label}
                      onClick={() => { setAddOpen(false); offer.run(); }}
                      tint={offer.tint}
                    />
                  ))}
                </div>
              )}
            </div>
            )}

            {/* 🔴 THE CAPABILITY SITS IN THE INPUT ROW ITSELF, LIKE THE REFERENCE COMPOSER'S OWN
                TOOL LABEL — the owner asked for exactly this composition (2026-08-23, screenshots):
                icon and name inline where the text starts, with the words flowing after them. It
                declares what THIS submission is, so it lives where the submission is typed — the
                chips row above is for material. One-shot by construction — `submit` clears it — so
                it can never harden into a mode indicator.

                🔴 THE ✕ IS GONE AND BACKSPACE REPLACES IT (owner, 2026-09-01, with the reference on
                screen). The old note here defended the ✕ because "a hover-only dismiss does not
                exist on touch" — true of a hover-only ✕, and beside the point: the reference has no
                dismiss control at all. It makes the chip a character in the line and lets the
                delete key do what the delete key does. `ml-[8px]` plus the chip's own 4px of
                padding puts the icon at the 12px the words start at, so the line begins in the same
                place whether or not anything is staged. */}
            {capability && !listening && (
              // 🔴 `mr-[8px]`, AND WITHOUT IT THE GAP WAS EXACTLY ZERO. Measured on
              // /dev-preview/course, 2026-09-03: the chip's right edge and the textarea's left
              // edge both sat at x=497.83, so "Course" and "What do you want to learn?" ran
              // together with only the chip's own 4px inset between them. Owner the same day:
              // *"there's also a problem with the spacing when it's supposed to be in the chat
              // composer."* 8px each side matches the gap the chip already keeps from the +.
              <CapabilityChip capability={capability} className="ml-[8px] mr-[8px]" />
            )}

            {listening ? (
              <>
                {/* 🔴 IN A VOICE CONVERSATION THE WORDS THEMSELVES ARE THE FEEDBACK (owner
                    2026-08-31, testing the reference: *"do the transcribed words appear on the
                    chat bar and then get sent...?"*). The bar shows what is being heard, live, in
                    the reference's own treatment for transcribed words: lighter and italic. The
                    waveform stays the DICTATION treatment, where the learner reviews before
                    sending and the meter is the reassurance; here the reassurance is the words.
                    Bottom-anchored and clipped so a long thought shows its most recent lines. */}
                {voiceLoop.active ? (
                  <div className="ml-[12px] flex max-h-[78px] min-w-0 flex-1 items-end self-center overflow-hidden">
                    {text.trim() ? (
                      <p className="w-full text-[length:var(--canvas-text-body)] italic leading-[26px] [color:color-mix(in_srgb,var(--ui-text-primary)_72%,transparent)]">
                        {text}
                      </p>
                    ) : (
                      <p className="w-full text-[length:var(--canvas-text-body)] leading-[26px] text-(--ui-text-quaternary)">Listening…</p>
                    )}
                  </div>
                ) : (
                <div className="ml-[12px] flex min-w-0 flex-1 items-center">
                  <CanvasVoiceBars live />
                </div>
                )}
                {/* 🔴 IN A VOICE CONVERSATION THE ONLY CONTROL IS STOP — measured on claude.ai
                    2026-08-30: while listening, their composer offers exactly one way out. The
                    dictation pair (cancel / finish) belongs to dictation, where the learner
                    reviews the words before sending; a conversation sends itself. */}
                {voiceLoop.active ? null : (
                <button
                  aria-label="Cancel dictation"
                  className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                  onClick={cancelDictation}
                  title="Cancel dictation"
                  type="button"
                >
                  <Codicon name="close" size="18px" />
                </button>
                )}
                {/* Filled and coloured -- MEASURED, not chosen. ChatGPT's own idle-composer action
                    (Start Voice, since nothing is typed) is a solid coloured circle, never a grey
                    glyph; ours picks up the same principle with the product's own accent instead of
                    copying their exact hue. See the send button below for the other half. */}
                {voiceLoop.active ? (
                  <VoiceStopButton onClick={voiceLoop.end} />
                ) : (
                <button
                  aria-label="Finish dictation"
                  className="ml-[10px] flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-opacity hover:opacity-90"
                  onClick={acceptDictation}
                  title="Finish dictation"
                  type="button"
                >
                  <Codicon name="check" size="20px" />
                </button>
                )}
              </>
            ) : (
              <>
                <textarea
                  // 🔴 `overflow-hidden` HERE AND HEIGHT IN THE EFFECT ABOVE. Without it the browser
                  // reserves and paints a scrollbar track inside a one-line control that has nothing
                  // to scroll. The effect promotes it to `auto` if the answer ever exceeds the cap.
                  className={cn(
                    // 🔴 5px, SO ONE LINE IS 36px — THE HEIGHT OF THE BUTTONS BESIDE IT. 26px of line
                    // plus 5 above and below is exactly the control box, which is what makes the
                    // bottom alignment above invisible until the box actually grows. `py-1` (4.5px
                    // at this root size) left it 35px and shifted the words half a pixel.
                    "min-h-[1.75rem] w-full min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-[5px]",
                    // §46.3-exempt: iOS Safari zooms the viewport on focus below 16px
                    // 16px, not a scale token -- see the file header. The value is a platform
                    // threshold, not a typographic choice, so it must not move when the scale does.
                    // MEASURED: ChatGPT's own input is also exactly 16px/26px line-height.
                    "text-[16px] leading-[26px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)",
                    // 🔴 HEIGHT ONLY, AND SHORT ENOUGH TO BE INVISIBLE AS A DELAY. `transition-all`
                    // here would animate colour and opacity on every keystroke and make typing feel
                    // syrupy; a long duration would let the caret outrun the box on the wrap. 90ms is
                    // below the threshold where a size change reads as motion, so the growth looks
                    // like the box was always that size rather than like an animation the learner has
                    // to wait out. `motion-reduce` drops it entirely.
                    "transition-[height] duration-90 ease-out motion-reduce:transition-none",
                    // The attach control used to supply this gap. Without it the text would start
                    // hard against the pill's edge.
                    // The chip ends with the reference's own 4px of padding, so the caret needs no
                    // second gap after it; with nothing staged the words keep their 12px.
                    capability ? "ml-0" : "ml-[12px]",
                  )}
                  disabled={busy}
                  onChange={(event) => {
                    setText(event.target.value);
                    typedBefore.current = event.target.value;
                    // Emptying the box by hand throws the capture away as surely as ✕ does. 🔴 THIS
                    // ALONE NEVER FIXED THE LEAK: `onChange` does not fire when `cancelDictation`
                    // calls `setText`, so cancelling and then typing never passed through here.
                    if (!event.target.value) modalityEvent({ kind: "capture_discarded" });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                    // 🔴 SHIFT+ENTER IS WHERE A LIST CONTINUES, BECAUSE IT IS WHERE A NEWLINE
                    // HAPPENS. Enter sends on this composer, so the newline key is the shifted one,
                    // and a learner writing a list presses it between items (owner 2026-08-31:
                    // the composer should carry "the markdown style formats… numbered or bullet
                    // lists"). `continueList` returns null for prose and for a selection, so the
                    // ordinary newline is untouched — this only ever adds the marker somebody was
                    // already going to type.
                    if (event.key === "Enter" && event.shiftKey) {
                      const field = event.currentTarget;
                      const next = continueList(field.value, field.selectionStart, field.selectionEnd);
                      if (next) {
                        event.preventDefault();
                        pendingCaret.current = next.caret;
                        setText(next.text);
                        typedBefore.current = next.text;
                      }
                    }
                    if (event.key === "Escape" && selected.length > 0) onClearSelection();
                    // 🔴 BACKSPACE AT THE HEAD OF THE LINE TAKES THE CAPABILITY OFF IT — the
                    // reference's own gesture, and the reason its pill needs no ✕ (owner,
                    // 2026-09-01: *"user should be able to backspace to delete the mode"*).
                    // `preventDefault` so one keypress cannot also eat a character of a sentence
                    // the learner walked the caret back through.
                    if (capability && backspaceClearsCapability(event)) {
                      event.preventDefault();
                      onCapability?.(null);
                    }
                  }}
                  // 🔴 A PASTED DOCUMENT BECOMES MATERIAL, NOT A WALL OF TEXT IN THE PILL (owner
                  // 2026-08-31). It goes through `onFiles`, the same door a real upload uses, so it
                  // is filed and read like any other source rather than being a second kind of
                  // attachment. A paste that still fits the box is left completely alone, and a
                  // clipboard carrying real files is the file lane's business, not this one.
                  onPaste={(event) => {
                    if (event.clipboardData.files.length > 0) return;
                    const file = pastedTextFile(event.clipboardData.getData("text/plain"));
                    if (!file) return;
                    event.preventDefault();
                    onFiles([file]);
                  }}
                  placeholder={
                    // 🔴 THE PLACEHOLDER NO LONGER ANNOUNCES THE WAIT (owner 2026-08-30: match
                    // ChatGPT's thinking presentation). Measured that day: the reference keeps its
                    // resting prompt while it works — the one "Thinking" on screen is the caption
                    // shimmering in the thread, and a second copy down here said it twice.
                    capability
                        ? // The chip names the capability; the placeholder asks the one question
                          // that capability needs answered. 🔴 KEYED OFF THE CAPABILITY, NOT OFF
                          // `=== "course"`, because the named form silently sent every other
                          // capability down the generic branch — which is how Deep research came to
                          // show a Deep research chip above a box reading "Ask Nemesis…".
                          CAPABILITY_COPY[capability].prompt
                        : selected.length > 0
                        ? "What should Nemesis do with this?"
                        : // Material is staged and nothing has started — say that sending with
                          // nothing typed is a real option, because §3 makes it one.
                          canStartFromAttachment
                          ? START_WITH_MATERIAL_PLACEHOLDER
                          : // 🔴 THE PLACEHOLDER NO LONGER SWAPS TO THE TASK'S. It read
                            // `intent.task.placeholder || ASK_PLACEHOLDER`, which put "Type your
                            // answer…" in the box the moment the policy staged anything — the most
                            // visible half of the mode the owner removed on 2026-08-26. The question
                            // is already on the page in words; the box does not need to restate that
                            // it is the place you reply, because it is the only place.
                             // 🔴 IT SAYS WHAT SENDING DOES RIGHT NOW. The card above already asks
                              // the question, so repeating it here would be the same sentence twice;
                              // what the learner cannot see is that this box is wired to it.
                              intent.kind === "clarify"
                              ? CLARIFY_PLACEHOLDER
                              : ASK_PLACEHOLDER
                  }
                  ref={input}
                  rows={1}
                  value={text}
                />

                {dictation.supported && (
                  <button
                    aria-label="Dictate"
                    className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                    disabled={busy}
                    onClick={startDictation}
                    title="Dictate"
                    type="button"
                  >
                    <Codicon name="mic" size="20px" />
                  </button>
                )}

                {/* 🔴🔴 THERE IS NO PAGE-TO-WORK-ON BUTTON (owner 2026-08-26: *"remove pencil mode
                    for now"*). It sat here, opened `WrittenWorkSheet` over the canvas's free space,
                    and handed its reading to the same `onAnswer` every typed and spoken answer uses.
                    "for now" is the owner's own word: the sheet, `use-written-work-capture.ts`,
                    `lib/handwriting/*` and `written-response.ts` are all untouched and none of it is
                    deleted. What is gone is the door. Putting it back is this button and the
                    `{drawing && …}` branch above the pill, nothing else. */}

                {/* 🔴 FILLED AND COLOURED, NOT A GREY GLYPH -- MEASURED, not chosen. A grey arrow
                    reads as disabled even when it isn't; ChatGPT's own idle-composer action button
                    is never grey, it's a solid coloured circle (theirs is Start Voice, since ours
                    has no equivalent, but the principle -- the primary action always looks live --
                    carries over with the product's own accent). `disabled:opacity-40` still dims it
                    when there is truly nothing to send, so the two real states (nothing typed vs.
                    ready to send) stay visibly different without a colour swap between them. */}
                {/* 🔴 ALWAYS PRESENT, DIMMED WHEN EMPTY. `showSend` used to remove it from the DOM, so the
                    pill changed shape on the first keystroke. See `ComposerSend`. */}
                {/* 🔴 THE SEND SLOT IS THE VOICE DOOR WHILE THE BOX IS EMPTY (owner 2026-08-30:
                    *"the send button should function like in chatgpt becoming the voice button
                    until text is manually [typed]"* — and claude.ai measured the same evening does
                    exactly this: bars in the send slot, arrow the moment words exist). Same
                    circle, same accent, so the pill keeps its shape on the first keystroke — the
                    rule the comment above this slot has always stated. While the conversation
                    runs, the slot is its stop. */}
                {voiceLoop.active ? (
                  <VoiceStopButton className="ml-[8px]" onClick={voiceLoop.end} />
                ) : !showSend && !busy && voiceLoop.offered ? (
                  <button
                    aria-label="Start a voice conversation"
                    className="ml-[8px] flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-opacity hover:opacity-90"
                    onClick={() => {
                      // A conversation begins from an empty box; this button only exists then. But
                      // `typedBefore` survives a cancelled dictation, and the sync effect would
                      // stitch those thrown-away words into the first spoken turn's box.
                      typedBefore.current = "";
                      voiceLoop.begin();
                    }}
                    title="Start a voice conversation"
                    type="button"
                  >
                    <VoiceBarsGlyph />
                  </button>
                ) : (
                <ComposerSend
                  busy={busy}
                  disabled={!showSend || materialNotReady}
                  label={sendLabel}
                  onClick={submit}
                />
                )}

              </>
            )}
          </div>
        </div>

{/* 🔴 THE GAP BETWEEN STOPPING AND THE WORDS ARRIVING HAS TO BE VISIBLE. On the browser
            lane there is none — it writes as it hears — but where Nemesis falls back to recording
            and sending, the microphone goes quiet and nothing appears for a second or two. Silence
            there reads as a control that ate the sentence. */}
        {dictation.transcribing && (
          <p className="mt-2 pl-4 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">Turning that into words…</p>
        )}
        {dictation.error && !listening && (
          <p className="mt-2 pl-4 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{dictation.error}</p>
        )}
        </>
        </div>
      </div>
    </>
  );
}

/** The voice door's bars — drawn, not imported, like every house mark. Static: the LIVE waveform
 *  belongs to CanvasVoiceBars while listening; a button glyph that wiggled would claim a
 *  microphone that is not open. */
export function VoiceBarsGlyph() {
  return (
    <svg aria-hidden fill="currentColor" height="18" viewBox="0 0 18 18" width="18">
      <rect height="6" rx="1" width="2" x="2" y="6" />
      <rect height="12" rx="1" width="2" x="6" y="3" />
      <rect height="8" rx="1" width="2" x="10" y="5" />
      <rect height="4" rx="1" width="2" x="14" y="7" />
    </svg>
  );
}

/** The conversation's one way out, wherever the loop currently is (listening, waiting, spoken). */
export function VoiceStopButton({ className, onClick }: { className?: string; onClick: () => void }) {
  return (
    <button
      aria-label="End the voice conversation"
      className={cn(
        "flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-opacity hover:opacity-90",
        className,
      )}
      onClick={onClick}
      title="End the voice conversation"
      type="button"
    >
      <Codicon name="primitive-square" size="16px" />
    </button>
  );
}

/** The conversation's lamp: candidate C ("Alive") from /dev-preview/voice-glow, shipped subtle
 *  on the owner's pick (2026-08-31: *"C but make the reactivity be subtle?"*).
 *
 *  🔴 OPACITY IS THE ONLY THING THAT MOVES. The two-layer shadow (a tight rim and a wide
 *  bloom, both `--ui-action` so the lamp follows the mascot) is written ONCE at mount and never
 *  touched again; the per-frame work is one compositor-cheap opacity write on one layer. No
 *  reflow, no shadow re-rasterisation — the mockup animated blur and spread, and this
 *  deliberately does not.
 *
 *  🔴 SUBTLE IS A RANGE, NOT AN ADJECTIVE: 0.35 at the quiet floor, 0.70 flat out. The
 *  floor is what says "the channel is open" while the reply speaks (the meter is closed then and
 *  the level reads 0); a voice lifts it by at most half again. Attack fast, release slow — the
 *  asymmetry every audio meter uses — so a word lights it and a pause breathes out instead of
 *  flickering.
 *
 *  🔴 THE LEVEL IS BORROWED, NEVER CAPTURED. `subscribeMicLevel` is the channel the
 *  dictation waveform already reads, published by the meter the dictation hook already opens. A
 *  `getUserMedia` here would be a second permission surface spent on a decoration — the exact
 *  thing lib/workspace/mic-level.ts exists to forbid. */
export function VoiceSessionGlow() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = layer.current;
    if (el) {
      el.style.boxShadow = [
        "0 0 3px 1px color-mix(in srgb, var(--ui-action) 45%, transparent)",
        "0 0 18px 4px color-mix(in srgb, var(--ui-action) 28%, transparent)",
      ].join(", ");
    }
    let target = 0;
    let shown = 0;
    const off = subscribeMicLevel((level) => {
      target = level;
    });
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      shown = target >= shown ? shown + (target - shown) * Math.min(1, dt * 9) : Math.max(target, shown - dt * 1.1);
      const live = layer.current;
      if (live) live.style.opacity = String(0.35 + shown * 0.35);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[var(--composer-radius)] opacity-[0.35]" ref={layer} />;
}
