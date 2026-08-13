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
// 🔴 THE INPUT TEXT SIZE IS WRITTEN `text-[16px]`, NOT `text-[1rem]` — MEASURED AND STRUCTURAL,
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
import { ASK_PLACEHOLDER } from "@/lib/learn/canvas-tasks";
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
  onAdvance?: (() => void) | null;
  /**
   * Advancing is momentarily refused — the evidence from the last answer is still being written.
   *
   * 🔴 THE CONTROL STAYS, AND SAYS SO. `acknowledge()` returns early while recording, so a `✓`
   * wired straight to it would be a dead press: nothing happens, nothing explains why. Now that
   * the composer is the ONLY way forward, a dead press is the learner's whole path blocked.
   */
  advanceBusy?: boolean;
}

/** Grows to about six lines, then stops. Beyond that the box would eat the question. */
const MAX_COMPOSER_HEIGHT = 160;

export function CanvasComposer({
  selected,
  onClearSelection,
  onAsk,
  onAnswer,
  onFiles,
  task,
  busy,
  busyLabel,
  inSession = false,
  onAdvance = null,
  advanceBusy = false,
}: CanvasComposerProps) {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const dictation = useCanvasDictation();
  /** Set the moment the microphone is used, because §23 reads elapsed time differently for
   *  speech and typing and a mislabelled answer is read against the wrong baseline. */
  const spoke = useRef(false);
  /** When the current prompt appeared, for response latency. Reset per prompt, not per render. */
  const startedAt = useRef(Date.now());
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

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    // 🔴 The routing that replaces a second composer. Same box, same key, different meaning —
    // decided by whether the canvas is currently asking for something.
    if (answering) onAnswer(value, spoke.current ? "spoken" : "typed", Date.now() - startedAt.current);
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
  const control = composerControl({
    // 🔴 `!answering` IS A BELT-AND-BRACES SECOND GUARD, NOT THE TEST. The caller already refuses
    // to pass `onAdvance` during a demonstration (that is where the decision lives, with its own
    // test). This repeats it locally because the cost of the two disagreeing is that retrieval
    // becomes skippable, which is silent — every screen still looks right.
    advanceAvailable: Boolean(onAdvance) && !answering,
    hasResponse: Boolean(text.trim()),
  });
  const showAdvance = control === "advance";
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
      <div className="pointer-events-auto w-full max-w-[770px]">
        {/* The chip needs its own surface. It sits inside the composer's fade, where the
            gradient is nearly transparent, so without a background it was printed straight
            over the paragraph behind it and neither could be read. */}
        {selected.length > 0 && !listening && (
          <div className="mb-1.5 ml-1 flex w-fit max-w-full items-center gap-2 rounded-full bg-(--ui-bg-elevated) py-1 pl-3 pr-2 shadow-sm ring-1 ring-(--ui-stroke-tertiary)">
            <span className="truncate text-[0.75rem] text-(--ui-text-tertiary)">
              {selected.length === 1
                ? `“${selected[0]?.content.slice(0, 60) ?? ""}${(selected[0]?.content.length ?? 0) > 60 ? "…" : ""}”`
                : `${selected.length} sections selected`}
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
          {!inSession && (
          <label
            aria-label="Add material"
            className={cn(
              // 36×36, MEASURED -- ChatGPT's "Add files and more" button is the same box size
              // every icon button on their composer uses, ours included now.
              "flex h-[36px] w-[36px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--ui-action)",
              listening
                ? "text-(--ui-text-quaternary)"
                : "text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)",
            )}
            title="Add material"
          >
            <Codicon name="add" size="20px" />
            {/* 🔴 `sr-only`, NOT `hidden`. A hidden input is out of the tab order and out of the
                accessibility tree, so the label around it becomes unreachable by keyboard. */}
            <input
              accept=".pdf,.docx,.pptx,.md,.txt,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.heic"
              className="sr-only"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) onFiles(event.target.files);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
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
                  // 16px, not 1rem -- see the file header. MEASURED: ChatGPT's own input is also
                  // exactly 16px/26px line-height.
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

              {/* 🔴 THE SAME SLOT THE SEND BUTTON USES, AND NEVER BOTH AT ONCE. Same size, same
                  position, same accent — what changes is the glyph and what it means. `✓` reads as
                  "I have finished with this", which is why §I insists it is not an agreement
                  control: it carries no claim about understanding and writes nothing.

                  It is styled like the primary action rather than as a quiet glyph because it IS
                  the primary action in this state — a grey tick would read as disabled on the one
                  control the learner needs. */}
              {showAdvance && (
                <button
                  aria-label="I've finished with this"
                  className="ml-[8px] flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-opacity hover:opacity-90 disabled:opacity-40"
                  disabled={busy || advanceBusy}
                  onClick={() => onAdvance?.()}
                  title="I've finished with this"
                  type="button"
                >
                  {/* 🔴 ONE LINE ON PURPOSE. `canvas-motion.test.ts` checks line by line that a
                      `loading` glyph carries `spinning`, and splitting this across lines hid it
                      from that check — which is how a frozen glyph got shipped the first time. */}
                  <Codicon name={busy || advanceBusy ? "loading" : "check"} size="20px" spinning={busy || advanceBusy} />
                </button>
              )}
            </>
          )}
        </div>

        {dictation.error && !listening && (
          <p className="mt-2 pl-4 text-[0.75rem] text-(--ui-text-tertiary)">{dictation.error}</p>
        )}
      </div>
    </div>
  );
}
