"use client";

// The app's landing surface: a question, a composer, and nothing else.
//
// 🔴 NOT A DASHBOARD. No "Good afternoon", no streak, no "4 sessions today", no cards due. The
// first thing someone sees is the place they type, because the product's whole claim is that
// they should not have to decide which tool they want before they can start. Type, upload or
// record — all three create a Canvas session, and that is the only entry path there is.
//
// 🔴 AND NOT A FILE BROWSER EITHER (owner 2026-08-14, marking a screenshot green above the
// composer and red below it). This surface used to list every canvas the learner had ever made,
// under the reasoning that their durable collection IS their canvases so the landing page should
// be that collection. Two attempts at it — a list below a fold, then a list lifted onto the first
// screen — were both answering the wrong question. A landing page that shows a learner their
// backlog invites them to browse it; the point of the product is that they arrive with something
// to learn and start immediately.
//
// So what remains is what the owner circled: the question, the composer, and the one line saying
// what the composer accepts. Everything else was removed rather than rearranged.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Codicon } from "@/components/desktop-ui/codicon";
import { ACCEPTED_MATERIAL } from "@/lib/learn/canvas-tasks";
import { ComposerSend } from "./composer-controls";
import { CanvasRecorder } from "./canvas-recorder";
import { CanvasVoiceBars } from "./canvas-voice-bars";
import { putPending } from "./pending-attachment";
import { RecordingRecoveryNotice } from "./recording-recovery-notice";
import { useCanvasDictation } from "./use-canvas-dictation";

export function CanvasHome({ accessToken = null, userId }: { accessToken?: string | null; userId: string | null }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  /** The whole page is a drop target, not just the composer — the copy has always said "drop a
   *  file in", and a learner dragging a PDF aims at the page, not at a 28px control. */
  const [draggingOver, setDraggingOver] = useState(false);
  const dictation = useCanvasDictation();
  /** Text typed before dictation started, so switching between talking and the keyboard
   *  mid-sentence throws away neither half. Same contract as the session composer. */
  const typedBefore = useRef("");
  const listening = dictation.listening;
  /** Record mode on the front door. A lecture recorded here has no canvas yet, so it starts one —
   *  the same thing dropping a file here does. */
  const [recording, setRecording] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);
  const addMenu = useRef<HTMLDivElement>(null);

  // Closes on a press elsewhere and on Escape — without the second it is a trap for a keyboard.
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

  // Dictation writes into the same box typing does — the composer has one value, whatever produced
  // it. Keyed on both flags so the final transcript still lands after recognition stops.
  useEffect(() => {
    if (!dictation.listening && !dictation.transcript) return;
    setText([typedBefore.current, dictation.transcript].filter(Boolean).join(" ").trimStart());
  }, [dictation.listening, dictation.transcript]);

  const start = () => {
    const topic = text.trim();
    // A canvas is addressed by query string, and a brand-new one has no id yet — the canvas
    // surface mints it. The opening instruction rides along so the learner does not have to
    // retype what they already said.
    router.push(topic ? `/learn?ask=${encodeURIComponent(topic)}` : "/learn");
  };

  /**
   * Material dropped or picked on the front door.
   *
   * 🔴 THIS REPLACES A CONTROL THAT DID NOTHING. The `+` here was labelled "Add material" and its
   * handler was `router.push("/learn")` — the page it was already on. It rendered, it hovered, it
   * accepted the click, and nothing happened. Upload was still reachable one step in (start a
   * canvas, then attach), so nothing was lost; the front door simply lied about having it.
   *
   * `?new=1` is what makes the canvas surface mount instead of this page. It carries no id, so
   * `useCanvasSession(null)` mints a fresh canvas, and the files are claimed once it exists.
   */
  const startWithFiles = (files: FileList | readonly File[]) => {
    if (Array.from(files).length === 0) return;
    putPending(files);
    router.push("/learn?new=1");
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

  /** ✓ — accept what was heard. It lands in the composer as editable text and does NOT start a
   *  canvas: speech recognition mishears, and auto-submitting would open a canvas on a topic the
   *  learner never said. */
  const acceptDictation = () => dictation.stop();

  return (
    <main
      className="relative h-full min-h-0 bg-(--ui-bg-editor)"
      onDragLeave={(event) => {
        // 🔴 GUARDED BY `currentTarget`. Dragging across a child fires dragleave on the parent, so
        // an unguarded handler flickers the highlight off and on for the whole traversal.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDraggingOver(false);
      }}
      onDragOver={(event) => {
        // Only a file drag. Dragging selected TEXT across the page must not offer to ingest it.
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDraggingOver(true);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDraggingOver(false);
        startWithFiles(event.dataTransfer.files);
      }}
      style={{ ["--canvas-column" as string]: "680px" }}
    >
      {/* A ring on the surface, not a modal over it: the page stays readable underneath, and
          nothing has to be dismissed if the learner changes their mind mid-drag. */}
      {draggingOver && (
        <div className="pointer-events-none absolute inset-3 z-50 rounded-2xl ring-2 ring-(--ui-action)" />
      )}
      {/* 🔴 ONE SCREEN, AND THE CANVASES ARE ON IT (owner 2026-08-14: "remove the scrolldown to see
          canvases list"). This was a full-viewport first screen with the learner's own canvases
          underneath, so their work was invisible until they scrolled — and the previous pass tried
          to fix that by leaving a 56px sliver peeking, which is a hint about scrolling drawn in
          layout rather than written in words. The honest fix was to stop hiding them.
          🔴 THE COMPOSER IS IN NORMAL FLOW NOW, AND THE DOCKING MACHINERY IS GONE WITH IT. It was
          absolutely positioned and morphed between two positions as the page scrolled; with
          nothing below the fold there is no scroll to track, no second position to morph to, and
          no `--first-screen-lift` for the two of them to share. A moving part that exists to
          manage a problem the page no longer has is just a moving part.
          🔴 THE BLOCK IS CENTRED, NOT PUSHED DOWN FROM THE TOP (owner 2026-08-15: "composer is not
          centered"). It was `pt-[18vh]`, which is not a centring rule — it is a fixed fraction of
          the viewport, so the greeting and composer sat wherever 18% happened to land and the space
          left underneath was whatever remained. Measured against the reference at the same width:
          it balances its block almost exactly, 264.9px above and 264.1px below — 1 : 1.00. Ours was
          130.9 above and 417.6 below, 1 : 3.19, so the whole composition hung in the upper third
          with a void beneath it. `18vh` also could not be right at two viewport heights at once.
          🔴 `my-auto`, NOT `justify-center`. Auto margins centre while there is free space and
          collapse to zero when there is not, so a short viewport scrolls from the true top of the
          greeting. `justify-center` on a scroll container centres past the top edge instead, and
          the overflowing part becomes unreachable — the greeting would be the part it ate. */}
      <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-12" ref={scroller}>
        <section className="my-auto flex w-full flex-col items-center">
          <h1 className="text-[length:var(--canvas-text-title)] font-medium tracking-[-0.01em] text-(--ui-text-primary)">
            What are you working on?
          </h1>
          <div className="mt-9 flex w-full flex-col items-center">
        {/* 🔴 THE RECORDER REPLACES THE COMPOSER, IT DOES NOT SIT BESIDE IT. While a lecture is
            being captured there is exactly one thing to do; leaving the text box live underneath
            offers a second. Same position, same width. */}
        {recording ? (
          <div className="pointer-events-auto w-full max-w-[var(--composer-max-width)]">
            <CanvasRecorder
              // No canvas exists yet on the front door, so a finished recording STARTS one — the
              // identical thing dropping a file here does, through the identical door.
              attach={async (files) => { startWithFiles(files); }}
              onClose={() => setRecording(false)}
            />
          </div>
        ) : (
        // Was 770 × 54 at radius 27, hand-tuned within 2px of the reference's 768 × 52 at 28.
        // Reading the tokens instead is what keeps it aligned with the Library frame below it.
        <div className="pointer-events-auto flex w-full max-w-[var(--composer-max-width)] min-h-[var(--composer-min-height)] items-center gap-0 rounded-[var(--composer-radius)] bg-(--ui-bg-elevated) px-[var(--composer-pad-x)] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.05)] ring-1 ring-(--ui-stroke-tertiary)">
          {/* 🔴 A REAL FILE INPUT, NOT A BUTTON THAT ROUTES. `sr-only`, never `hidden`: a hidden
              input leaves the tab order and the accessibility tree, which makes the label wrapping
              it unreachable by keyboard — the same rule the session composer's attach control
              carries, for the same reason. */}
          <input
            accept={ACCEPTED_MATERIAL}
            className="sr-only"
            multiple
            onChange={(event) => {
              if (event.target.files?.length) startWithFiles(event.target.files);
              event.target.value = "";
            }}
            ref={filePicker}
            tabIndex={-1}
            type="file"
          />
          {/* 🔴 UPLOAD AND RECORD SIT TOGETHER, BECAUSE A RECORDING IS MATERIAL. §L lists the front
              door's five behaviours as "type a topic · ask a question · upload material · dictate ·
              record", and the mic to the right of this box is DICTATION — speaking instead of
              typing. Putting record beside it would give the learner two microphones and no way to
              tell which one keeps their lecture. */}
          <div className="relative shrink-0" ref={addMenu}>
            <button
              aria-expanded={addOpen}
              aria-haspopup="menu"
              aria-label="Add material"
              className="flex size-[var(--composer-control)] items-center justify-center rounded-full text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--ui-action)"
              onClick={() => setAddOpen((open) => !open)}
              title="Add material"
              type="button"
            >
              <Codicon name="add" size="var(--composer-icon)" />
            </button>
            {addOpen && (
              <div
                className="absolute bottom-[40px] left-0 z-50 w-[220px] overflow-hidden rounded-2xl bg-(--ui-bg-elevated) py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)"
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
                  onClick={() => { setAddOpen(false); setRecording(true); }}
                  role="menuitem"
                  type="button"
                >
                  <Codicon className="text-(--ui-text-tertiary)" name="record" size="16px" />
                  Record a lecture
                </button>
              </div>
            )}
          </div>
          {listening ? (
            <>
              <div className="ml-[12px] flex min-w-0 flex-1 items-center">
                <CanvasVoiceBars live />
              </div>
              <button
                aria-label="Cancel dictation"
                className="flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                onClick={cancelDictation}
                title="Cancel dictation"
                type="button"
              >
                <Codicon name="close" size="var(--composer-icon)" />
              </button>
              <button
                aria-label="Finish dictation"
                className="ml-[10px] flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-opacity hover:opacity-90"
                onClick={acceptDictation}
                title="Finish dictation"
                type="button"
              >
                <Codicon name="check" size="var(--composer-icon)" />
              </button>
            </>
          ) : (
            <>
              <input
                // §46.3-exempt: iOS Safari zooms the viewport on focus below 16px
                // 🔴 A LITERAL, NOT `--canvas-text-body`, EVEN THOUGH THAT TOKEN IS ALSO 16px TODAY.
                // The two agree by coincidence, not by contract: the token is a typographic choice
                // and may be retuned, while 16 here is a hard platform threshold — below it iOS
                // Safari zooms the whole viewport in on focus and there is no way back out that
                // reads as intentional. Binding this to the scale would make a future type tweak
                // silently break input focus on every iPhone. The session composer carries the same
                // literal for the same reason.
                // 8px after the control, matching the reference's gap — it was 12, which pushed the
                // caret 4px further from the `+` than the `+` sits from the pill's own edge.
                className="ml-[var(--composer-pad-x)] min-w-0 flex-1 bg-transparent text-[16px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
                onChange={(event) => {
                  setText(event.target.value);
                  typedBefore.current = event.target.value;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    start();
                  }
                }}
                placeholder="Ask Nemesis…"
                value={text}
              />
              {dictation.supported && (
                <button
                  aria-label="Dictate"
                  className="flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                  onClick={startDictation}
                  title="Dictate"
                  type="button"
                >
                  <Codicon name="mic" size="var(--composer-icon)" />
                </button>
              )}
              {/* 🔴 THE SAME CONTROL AS THE SESSION COMPOSER'S, not a second one that looks similar.
                  This was a plain transparent circle while the canvas's was a filled accent one, so
                  the primary action changed appearance between the front door and the room behind
                  it. See `ComposerSend`. */}
              <ComposerSend disabled={!text.trim()} label="Start" onClick={start} />
            </>
          )}
        </div>
        )}
        {/* 🔴 A DENIED MICROPHONE HAS TO SAY SO. Without this the mic button is pressed, nothing
            starts, and nothing appears — indistinguishable from a broken control. Observed exactly
            that while verifying: `SpeechRecognition` exists, so the button renders, but the capture
            never begins and the learner is told nothing. The session composer already prints this;
            the front door was the surface missing it. */}
        {dictation.error && !listening && (
          <p className="mt-2 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{dictation.error}</p>
        )}
          </div>
          <p className="mt-6 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
            {/* 🔴 THIS NO LONGER PROMISES RECORDING, BECAUSE THIS SURFACE CANNOT DO IT. The line
                used to read "Type it, drop a file in, or record a lecture." Recording is started by
                `RecordWorkspace`, which is hosted only on /sessions and /notebooks — the Canvas has
                no path to it. `recording-recovery-notice.tsx` sits on this very page and says so in
                its own header: it can only offer back a capture that already happened.

                Two of those three were also untrue until this pass: the `+` did nothing and there
                was no dictation. Those are now real, so the copy describes four things this
                composer genuinely does. Wording is my call; the constraint is that it not name a
                capability the front door does not have. */}
            Type a topic, ask a question, dictate it, or drop your material in.
          </p>
        </section>

      </div>

      {/* An interrupted recording is offered back here, above the composer — the one place the
          learner is guaranteed to look, so recovery is never something they have to find. It
          renders nothing at all when there is no crashed session, which is almost always. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-4 pt-4">
        <div className="pointer-events-auto">
          {/* 🔴 A RECOVERED LECTURE NOW LANDS ON A CANVAS, NOT IN A SESSIONS CHAT. This notice only
              ever renders here, and it used to file what it recovered as a new Sessions
              conversation — a surface the sidebar does not list. Starting a canvas from the
              transcript is the same thing dropping a file on this page does. */}
          <RecordingRecoveryNotice
            accessToken={accessToken}
            onRecovered={(file) => startWithFiles([file])}
            uid={userId}
          />
        </div>
      </div>

    </main>
  );
}
