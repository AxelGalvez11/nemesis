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

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { CanvasBlock } from "@/lib/learn/canvas-model";
import { ACCEPTED_MATERIAL, ASK_PLACEHOLDER, START_WITH_MATERIAL_PLACEHOLDER } from "@/lib/learn/canvas-tasks";
import { cn } from "@/lib/utils";

import { composerControl } from "./canvas-progression";
import { CanvasVoiceBars } from "./canvas-voice-bars";
import { useCanvasDictation } from "./use-canvas-dictation";
import type { ActiveTask } from "./use-canvas-session";

interface CanvasComposerProps {
  selected: readonly CanvasBlock[];
  onClearSelection: () => void;
  /** A question or instruction for Nemesis about the canvas. */
  onAsk: (text: string) => void;
  /** A performance: the learner's answer to whatever is currently being asked. */
  onAnswer: (text: string, via: "typed" | "spoken", tookMs?: number) => void;
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
  /** What the canvas is asking for, or null while reading. */
  task: ActiveTask | null;
  busy: boolean;
  busyLabel?: string;
  /**
   * A learning session is underway.
   *
   * 🔴 REMOVES THE ATTACH CONTROL, NOT THE ABILITY TO ATTACH. Mid-session is not an ingestion
   * state: the learner is producing an answer, and a `+` sitting to the left of the cursor is a
   * second affordance in the one place there should be exactly one. Adding material is still how a
   * canvas starts — the control lives on the home and pre-session composer, where it is the point.
   */
  inSession?: boolean;
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
   * where §15 allows exactly one.
   */
  pendingSources?: readonly { readonly id: string; readonly title: string }[];
  /**
   * This canvas has not begun. Submitting starts it; `null` once it has.
   *
   * 🔴 SEND IS THE TRIGGER, NEVER ATTACH — that is the whole of §2, and it is why this is a
   * separate route rather than something `attachFiles` does on arrival. The learner may add a
   * second file, type an instruction, and only then commit.
   *
   * 🔴 THE CHIP CONFIRMS AN INGEST; IT DOES NOT STAGE ONE, and the difference is worth being
   * exact about. `pendingSources` is `canvas.sources` — the file has already been read by
   * `attachFiles` by the time a chip appears — so the chips carry no remove control, unlike the
   * shared chat composer's, whose files really are staged in component state until submit. What
   * has not happened yet is the canvas BEGINNING. Saying otherwise here would promise an undo
   * this surface does not offer.
   *
   * 🔴 AND IT ACCEPTS AN EMPTY STRING (§3). Sending with material and nothing typed means *"learn
   * this material with me"*; the caller infers it rather than making the learner say it. The
   * refusal that used to sit in `submit()` — `if (!value) return;` — silently threw exactly that
   * case away.
   */
  onStart?: ((text: string) => void) | null;
}

/** Grows to about six lines, then stops. Beyond that the box would eat the question. */
const MAX_COMPOSER_HEIGHT = 160;

export function CanvasComposer({
  selected,
  onClearSelection,
  onAsk,
  onAnswer,
  onFiles,
  onRecord = null,
  task,
  busy,
  busyLabel,
  inSession = false,
  advanceBusy = false,
  pendingSources = [],
  onStart = null,
}: CanvasComposerProps) {
  const [text, setText] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  /** The file input is triggered from a menu item now, so it needs a handle rather than a wrapping
   *  label. It stays `sr-only` rather than `hidden` — a hidden input is out of the accessibility
   *  tree entirely. */
  const filePicker = useRef<HTMLInputElement>(null);
  const addMenu = useRef<HTMLDivElement>(null);
  const dictation = useCanvasDictation();
  /** Set the moment the microphone is used, because §23 reads elapsed time differently for
   *  speech and typing and a mislabelled answer is read against the wrong baseline. */
  const spoke = useRef(false);
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

  // An unanswered prompt makes this the answer surface. Once it is answered the canvas shows
  // feedback, and the composer goes back to being somewhere to ask about that feedback.
  const answering = Boolean(task && !task.answered && task.placeholder);
  const taskId = task?.id ?? null;

  useEffect(() => {
    setText("");
    spoke.current = false;
    typedBefore.current = "";
    startedAt.current = Date.now();
  }, [taskId]);

  useEffect(() => {
    if (!dictation.listening && !dictation.transcript) return;
    spoke.current = true;
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
    element.style.height = "auto";
    const needed = element.scrollHeight;
    element.style.height = `${Math.min(needed, MAX_COMPOSER_HEIGHT)}px`;
    element.style.overflowY = needed > MAX_COMPOSER_HEIGHT ? "auto" : "hidden";
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

  /** Material is waiting and the canvas has not begun — so an empty box is still submittable. */
  const canStartFromAttachment = Boolean(onStart) && pendingSources.length > 0;

  const submit = () => {
    const value = text.trim();
    // 🔴 THE `!value` REFUSAL IS NOW CONDITIONAL, AND THAT ONE CHARACTER IS §3. It used to be
    // unconditional, so "send a file with no accompanying text" delivered the file and then
    // returned before anything began — the canvas sat on its holding screen and the learner's
    // press did nothing they could see. An empty box is a real submission when material is
    // attached and the canvas has not started; everywhere else it is still nothing to send.
    if (busy) return;
    // 🔴 A STAGED SELECTION IS A SUBMISSION, EXACTLY AS A STAGED FILE IS. Without this clause the
    // send button rendered (see `hasSelection`) and pressing it did nothing at all — worse than the
    // missing button it replaced, because a control that visibly does nothing reads as broken
    // rather than absent. The composer asks *"What should Nemesis do with this?"*; sending without
    // typing is the learner answering "the obvious thing", and the caller resolves what that is.
    if (!value && !canStartFromAttachment && selected.length === 0) return;
    setText("");
    // 🔴 The routing that replaces a second composer. Same box, same key, different meaning —
    // decided by whether the canvas is currently asking for something.
    //
    // 🔴 STARTING OUTRANKS BOTH OTHER ROUTES. On a canvas that has not begun there is nothing to
    // answer and nothing to ask ABOUT — `onAsk` there would question a canvas with no content. The
    // caller only passes `onStart` in exactly that state, so this branch cannot capture a genuine
    // answer or a mid-lesson question.
    if (onStart) onStart(value);
    else if (answering) onAnswer(value, spoke.current ? "spoken" : "typed", Date.now() - startedAt.current);
    else onAsk(value);
    spoke.current = false;
    typedBefore.current = "";
  };

  const startDictation = () => {
    typedBefore.current = text;
    dictation.reset();
    dictation.start();
  };

  /** × — throw the capture away and put the composer back as it was. */
  const cancelDictation = () => {
    dictation.stop();
    dictation.reset();
    setText(typedBefore.current);
  };

  /** ✓ — accept what was heard. It lands in the composer as editable text; it does NOT submit.
   *  Speech recognition mishears, and auto-submitting would make a transcription error
   *  indistinguishable from a wrong answer in the evidence. */
  const acceptDictation = () => dictation.stop();

  const listening = dictation.listening;

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
  const control = composerControl({
    hasResponse: Boolean(text.trim()),
    hasAttachment: canStartFromAttachment,
    // A staged passage is something to send, exactly as a staged file is — see `hasSelection`.
    hasSelection: selected.length > 0 && !listening,
  });
  const showSend = control === "send";

  return (
    // The pill FLOATS: no footer container, no top border, canvas visible all around it. The
    // gradient is a scrim so text scrolling underneath does not collide with the input — page
    // colour fading to nothing, which draws no edge of its own.
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4",
        "bg-gradient-to-t from-(--ui-bg-editor) via-(--ui-bg-editor)/85 to-transparent pt-14",
      )}
    >
      <div className="pointer-events-auto w-full max-w-[768px]">
        {/* 🔴 THE ATTACHMENT PREVIEW (§2, §26) — IMMEDIATELY ABOVE THE INPUT, WHICH IS WHERE THE
            BRIEF DRAWS IT. This is the whole replacement for a dedicated "1 source attached →
            Help me learn this" page: the material is visible, it is obviously not gone, and the
            learner may still type an instruction before committing. Nothing has started.

            🔴 NOT SHOWN WHILE DICTATING, like the selection chip below it — the composer becomes a
            waveform in that state and a stack of chips over it is exactly the second card the
            file header says dictation must never grow. */}
        {pendingSources.length > 0 && !listening && (
          <div className="mb-1.5 ml-1 flex flex-wrap items-center gap-1.5">
            {pendingSources.map((source) => (
              <span
                className="flex max-w-[280px] items-center gap-1.5 rounded-full bg-(--ui-bg-elevated) py-1 pl-2.5 pr-3 shadow-sm ring-1 ring-(--ui-stroke-tertiary)"
                key={source.id}
                title={source.title}
              >
                <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="file" size="0.75rem" />
                <span className="truncate text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{source.title}</span>
              </span>
            ))}
          </div>
        )}

        {/* The chip needs its own surface. It sits inside the composer's fade, where the
            gradient is nearly transparent, so without a background it was printed straight
            over the paragraph behind it and neither could be read. */}
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

        <div
          className={cn(
            // 52px tall, 26px radius -- MEASURED off ChatGPT's live composer (was 54/27, close
            // already). One pill; does NOT grow when dictation starts -- the component
            // transforms, it does not become a bigger thing.
            "flex min-h-[52px] items-center gap-0 rounded-[26px] bg-(--ui-bg-elevated) px-[12px]",
            "shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.05)] ring-1 ring-(--ui-stroke-tertiary)",
            selected.length > 0 && !listening && "ring-(--ui-action)/50",
          )}
        >
          {/* Stays put through every state, including dictation: spatial continuity is the
              reason there is one composer at all. Subdued, not moved, while listening.
              🔴 Absent once a session is underway — see `inSession`. */}
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

          {!inSession && (
          <div className="relative shrink-0" ref={addMenu}>
            <button
              aria-expanded={onRecord ? addOpen : undefined}
              aria-haspopup={onRecord ? "menu" : undefined}
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
              // 🔴 WITH NOTHING TO CHOOSE BETWEEN, THERE IS NO MENU. A surface that cannot record
              // opens the file picker on the first press, exactly as it always did — a one-item
              // menu is a second click charged for nothing.
              onClick={() => (onRecord ? setAddOpen((open) => !open) : filePicker.current?.click())}
              title="Add material"
              type="button"
            >
              <Codicon name="add" size="20px" />
            </button>

            {onRecord && addOpen && (
              <div
                className="absolute bottom-[46px] left-0 z-50 w-[220px] overflow-hidden rounded-2xl bg-(--ui-bg-elevated) py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)"
                role="menu"
              >
                <button
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[length:var(--canvas-text-small)] text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary)"
                  onClick={() => { setAddOpen(false); filePicker.current?.click(); }}
                  role="menuitem"
                  type="button"
                >
                  <Codicon className="text-(--ui-text-tertiary)" name="file" size="16px" />
                  Upload material
                </button>
                <button
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[length:var(--canvas-text-small)] text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary)"
                  onClick={() => { setAddOpen(false); onRecord(); }}
                  role="menuitem"
                  type="button"
                >
                  {/* A filled circle, not a microphone. The mic on the right of this composer is
                      dictation; these two must never look like the same offer. */}
                  <Codicon className="text-(--ui-text-tertiary)" name="record" size="16px" />
                  Record a lecture
                </button>
              </div>
            )}
          </div>
          )}

          {listening ? (
            <>
              <div className="ml-[12px] flex min-w-0 flex-1 items-center">
                <CanvasVoiceBars live />
              </div>
              <button
                aria-label="Cancel dictation"
                className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                onClick={cancelDictation}
                title="Cancel dictation"
                type="button"
              >
                <Codicon name="close" size="18px" />
              </button>
              {/* Filled and coloured -- MEASURED, not chosen. ChatGPT's own idle-composer action
                  (Start Voice, since nothing is typed) is a solid coloured circle, never a grey
                  glyph; ours picks up the same principle with the product's own accent instead of
                  copying their exact hue. See the send button below for the other half. */}
              <button
                aria-label="Finish dictation"
                className="ml-[10px] flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-opacity hover:opacity-90"
                onClick={acceptDictation}
                title="Finish dictation"
                type="button"
              >
                <Codicon name="check" size="20px" />
              </button>
            </>
          ) : (
            <>
              <textarea
                // 🔴 `overflow-hidden` HERE AND HEIGHT IN THE EFFECT ABOVE. Without it the browser
                // reserves and paints a scrollbar track inside a one-line control that has nothing
                // to scroll. The effect promotes it to `auto` if the answer ever exceeds the cap.
                className={cn(
                  "min-h-[1.75rem] w-full min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-1",
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
                  inSession ? "ml-[4px]" : "ml-[12px]",
                )}
                disabled={busy}
                onChange={(event) => {
                  setText(event.target.value);
                  typedBefore.current = event.target.value;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                  if (event.key === "Escape" && selected.length > 0) onClearSelection();
                }}
                placeholder={
                  busy
                    ? // Strip any trailing ellipsis the label already carries before adding one --
                      // THINKING_COPY's captions are Runtime's copy and may or may not end in "…"
                      // (see thinking-phases.ts); doubling it up reads as a typo, not as emphasis.
                      `${(busyLabel ?? "Working").replace(/…$/, "")}…`
                    : selected.length > 0
                      ? "What should Nemesis do with this?"
                      : // Material is staged and nothing has started — say that sending with
                        // nothing typed is a real option, because §3 makes it one.
                        canStartFromAttachment
                        ? START_WITH_MATERIAL_PLACEHOLDER
                        : answering
                          ? (task?.placeholder ?? ASK_PLACEHOLDER)
                          : ASK_PLACEHOLDER
                }
                ref={input}
                rows={1}
                value={text}
              />

              {dictation.supported && (
                <button
                  aria-label={answering ? "Answer out loud" : "Dictate"}
                  className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                  disabled={busy}
                  onClick={startDictation}
                  title={answering ? "Answer out loud" : "Dictate"}
                  type="button"
                >
                  <Codicon name="mic" size="20px" />
                </button>
              )}

              {/* 🔴 FILLED AND COLOURED, NOT A GREY GLYPH -- MEASURED, not chosen. A grey arrow
                  reads as disabled even when it isn't; ChatGPT's own idle-composer action button
                  is never grey, it's a solid coloured circle (theirs is Start Voice, since ours
                  has no equivalent, but the principle -- the primary action always looks live --
                  carries over with the product's own accent). `disabled:opacity-40` still dims it
                  when there is truly nothing to send, so the two real states (nothing typed vs.
                  ready to send) stay visibly different without a colour swap between them. */}
              {showSend && (
                <button
                  aria-label={answering ? "Submit answer" : "Send"}
                  className="ml-[8px] flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-opacity hover:opacity-90 disabled:opacity-40"
                  disabled={busy}
                  onClick={submit}
                  type="button"
                >
                  {/* 🔴 `spinning` IS NOT OPTIONAL ON A LOADING GLYPH. Without the modifier the
                      codicon renders a static broken circle — it had been sitting there perfectly
                      still through every wait, reading as a decorative icon or a rendering fault
                      rather than as activity. Fixing it is a BUG FIX, not a decision that a spinner
                      is what thinking looks like in Nemesis; see canvas-thinking.tsx. */}
                  <Codicon name={busy ? "loading" : "arrow-up"} size="20px" spinning={busy} />
                </button>
              )}

            </>
          )}
        </div>

        {dictation.error && !listening && (
          <p className="mt-2 pl-4 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{dictation.error}</p>
        )}
      </div>
    </div>
  );
}
