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

import { BloubBot } from "@/components/bloub/bloub-bot";
import { stateForCanvas } from "@/lib/character/stations";
import { usePoke } from "@/components/bloub/use-poke";
import { Codicon } from "@/components/desktop-ui/codicon";
import { useTheme } from "@/components/theme-provider";
import { ACCEPTED_MATERIAL } from "@/lib/learn/canvas-tasks";
import { ComposerSend } from "./composer-controls";
import { CanvasRecorder } from "./canvas-recorder";
import { CanvasVoiceBars } from "./canvas-voice-bars";
import { putPending } from "./pending-attachment";
import { RecordingRecoveryNotice } from "./recording-recovery-notice";
import { useCanvasDictation } from "./use-canvas-dictation";

/**
 * How long the composer takes to reach the bottom, and therefore how long the send waits.
 *
 * 🔴 SHORT ENOUGH TO READ AS A RESPONSE, NOT AS A DELAY. This sits in front of a navigation the
 * learner asked for, so every millisecond here is latency they did not ask for.
 *
 * 🔴 320, UP FROM 260 (owner 2026-08-20: *"The chat composer needs to drop smoother"*). At 260 the
 * composer covered most of a screen height in a quarter of a second, which is quick enough to read
 * as a JUMP with a blur rather than as a thing travelling. The extra 60ms is under the threshold
 * where a transition starts to feel like waiting, and it is what the arriving header now waits for.
 */
const DOCK_MS = 320;

/** The clearance under the canvas composer: `bottom-0` plus `pb-4`. Written in px because every
 *  rem in this app is 1.125x its number (`html{font-size:112.5%}`), and this is measured against
 *  a real rectangle. */
const CANVAS_COMPOSER_INSET = 16;

export function CanvasHome({ accessToken = null, userId }: { accessToken?: string | null; userId: string | null }) {
  const router = useRouter();
  // The character's look is a device preference, the same as the theme and the scale.
  const { accent } = useTheme();
  const [text, setText] = useState("");
  /**
   * Material the learner has picked but not sent.
   *
   * 🔴🔴 REPORTED 2026-08-21: *"it still will automatically send the attachment and not attach to
   * the chat composer so that i can add more."* Picking a file used to `putPending` and navigate in
   * the same breath, so one PDF WAS the whole instruction: no second file, no "focus on chapter 4",
   * no chance to change your mind. A learner with three lecture PDFs had to open three canvases.
   *
   * 🔴 STAGED, NOT ATTACHED. Nothing is uploaded, parsed or paid for until Start — extraction is
   * the expensive step, and a file sitting in a chip has not begun it. Removing one is free, which
   * is the whole reason a chip beats a progress bar here.
   */
  const [staged, setStaged] = useState<File[]>([]);
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
  const filePicker = useRef<HTMLInputElement>(null);
  const composerBox = useRef<HTMLDivElement>(null);
  /** The send is on its way out: the greeting fades and the composer travels down. */
  const [departing, setDeparting] = useState(false);

  // 🔴 IT DOES NOT LEAVE WITH THE GREETING ANY MORE (owner 2026-08-20: "when the chat composer
  // animates downward the blob should also just stay centered with thinking animations"). It
  // used to fade on the same curve as the question, on the reasoning that it belonged to the
  // block with no counterpart on the canvas. Watching the real transition says otherwise: the
  // send is the moment the character has the most to say, and fading it out left the composer
  // travelling alone while a SECOND character faded in on the far side. It stays put and starts
  // thinking instead, so one character carries the whole handoff.
  const greeter = usePoke(stateForCanvas({ thinking: departing, preparing: false, listening }));
  /** How far down, in px. Measured at the moment of the send; see `start`. */
  const [lift, setLift] = useState(0);

  // 🔴 THE MENU'S STATE, ITS REF AND ITS DISMISS EFFECT WENT WITH THE MENU. Two document-level
  // listeners kept alive for a control that no longer exists is the dead-lane shape this repo
  // keeps finding; `+` now opens the file picker directly and there is nothing to dismiss.

  // Dictation writes into the same box typing does — the composer has one value, whatever produced
  // it. Keyed on both flags so the final transcript still lands after recognition stops.
  useEffect(() => {
    if (!dictation.listening && !dictation.transcript) return;
    setText([typedBefore.current, dictation.transcript].filter(Boolean).join(" ").trimStart());
  }, [dictation.listening, dictation.transcript]);

  /**
   * Send, and let the composer travel to where it is about to be.
   *
   * 🔴🔴 THE MOVE IS THE RECEIPT. Owner call, 2026-08-20: "since user prompts aren't supposed to
   * show up as a chat" there is nothing else to acknowledge a send with. Pressing send on the front
   * door used to swap one route for another instantly, and because the learner's own words are
   * never rendered, the only evidence anything happened was the next screen arriving seconds later.
   *
   * 🔴 MEASURED, NOT GUESSED. The distance is read off the composer's real rectangle against the
   * real viewport, because the front door centres its block with `my-auto` — a value that depends
   * on the greeting's height, the window's height, and whether the Library list below it is long
   * enough to push things. Any hard-coded translate would be right at exactly one window size.
   *
   * 🔴 THE NAVIGATION IS DELAYED BY THE LENGTH OF THE MOVE, AND THAT IS THE WHOLE TRICK. The canvas
   * mounts with its composer already docked at the bottom, so if this one arrives there first the
   * two line up and the swap is invisible. Pushing immediately would play the move against a page
   * that had already been replaced.
   */
  const start = () => {
    const topic = text.trim();
    // 🔴 THE HANDOVER HAPPENS HERE NOW, NOT WHEN THE FILE WAS PICKED. `putPending` is a module-level
    // stash the canvas claims once, so the files ride across the navigation without a query string —
    // which is what lets the topic keep using one.
    if (staged.length > 0) putPending(staged);
    // A canvas is addressed by query string, and a brand-new one has no id yet — the canvas
    // surface mints it. The opening instruction rides along so the learner does not have to
    // retype what they already said.
    //
    // 🔴 `?new=1` WHEN THERE IS MATERIAL BUT NO TOPIC. Bare `/learn` renders this page, so files
    // staged without a word typed would have been stashed for a canvas that never mounted — and
    // `takePending` clears as it reads, so they would have been silently lost on the next visit.
    const href = topic
      ? `/learn?ask=${encodeURIComponent(topic)}`
      : staged.length > 0
        ? "/learn?new=1"
        : "/learn";
    const box = composerBox.current;
    // 🔴 REDUCED MOTION SKIPS THE TRAVEL, NOT THE SEND. Someone who asked the system to stop moving
    // gets the canvas immediately; they must not get a slower version of the same animation.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!box || still) {
      router.push(href);
      return;
    }
    const rect = box.getBoundingClientRect();
    // Where the canvas composer sits: `bottom-0` with `pb-4`, so 16px of clearance under it.
    const target = window.innerHeight - CANVAS_COMPOSER_INSET - rect.height;
    setLift(Math.max(0, Math.round(target - rect.top)));
    setDeparting(true);
    window.setTimeout(() => router.push(href), DOCK_MS);
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
  const stageFiles = (files: FileList | readonly File[]) => {
    const picked = Array.from(files);
    if (picked.length === 0) return;
    setStaged((current) => {
      // 🔴 DEDUPED BY NAME AND SIZE, because the two ways in overlap. A learner who drops a file and
      // then picks the same one from the dialog has not asked for it twice, and ingesting a lecture
      // deck twice is the most expensive mistake this screen can make.
      const seen = new Set(current.map((file) => `${file.name}:${file.size}`));
      return [...current, ...picked.filter((file) => !seen.has(`${file.name}:${file.size}`))];
    });
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
        stageFiles(event.dataTransfer.files);
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
          {/* 🔴 THE GREETING LEAVES FIRST, AND FASTER THAN THE COMPOSER TRAVELS. It is the one
              thing on this page with no counterpart on the canvas, so carrying it down would mean
              animating it out at the far end instead. Fading it here makes the composer the only
              thing that survives the transition, which is exactly what the learner should be
              following with their eye. */}
          {/* 🔴 A GREETER, NOT THE DOCK. Everywhere else the character is parked lower-left
              above a composer pinned to the foot of the page; this composer is centred in normal
              flow, so a corner dock would put it in an empty corner far from the only thing on
              screen. It stands above the question instead, which is where the eye already is.

              🔴 AND IT LEAVES WITH THE GREETING, on the same curve. It belongs to the block that
              has no counterpart on the canvas; carrying it through the transition would leave it
              hanging over a composer that has already travelled, and it would then have to be
              animated out at the far end instead.

              This is also the one place the entrance turn belongs — the eyes go right round the
              body and come back, which is a real arrival and costs a beat. It is off everywhere
              else precisely because it would then happen on every appearance. */}
          {/* 🔴 THE HOP GETS ITS OWN ELEMENT HERE TOO, AND FOR THE SAME REASON AS IN `BloubDock`:
              the wrapper above already carries the greeting's own margin and its departure, so a
              jump written onto it would have to share a transform with the transition. Nested
              elements multiply, so each keeps one job. See `use-poke.ts` for what a poke draws. */}
          <div className="mb-5">
            <div className={greeter.motion === "jump" ? "bloub-jump" : undefined}>
              <BloubBot
                color={accent}
                entrance
                onPoke={greeter.poke}
                size={64}
                state={greeter.state}
                track
              />
            </div>
          </div>
          <h1
            className="text-[length:var(--canvas-text-title)] font-medium tracking-[-0.01em] text-(--ui-text-primary)"
            style={{
              opacity: departing ? 0 : 1,
              transition: `opacity ${Math.round(DOCK_MS * 0.55)}ms ease-out`,
            }}
          >
            What are you working on?
          </h1>
          <div
            className="mt-9 flex w-full flex-col items-center"
            ref={composerBox}
            style={{
              // 🔴 `transform`, NOT A LAYOUT PROPERTY. Animating margin or top would reflow the
              // Library list underneath on every frame of the move; a transform is composited and
              // touches nothing else on the page.
              transform: departing ? `translateY(${lift}px)` : undefined,
              // 🔴 A LONGER TAIL THAN THE OLD CURVE. `0.22, 0.61, 0.36, 1` decelerates but still
              // arrives briskly; this one spends more of its time slowing down, so the composer
              // settles into place instead of stopping there. Same family the app's sheets use.
              transition: departing ? `transform ${DOCK_MS}ms cubic-bezier(0.32, 0.72, 0, 1)` : undefined,
            }}
          >
        {/* 🔴 THE RECORDER REPLACES THE COMPOSER, IT DOES NOT SIT BESIDE IT. While a lecture is
            being captured there is exactly one thing to do; leaving the text box live underneath
            offers a second. Same position, same width. */}
        {/* 🔴🔴 THE CHIPS SIT ABOVE THE PILL, NOT INSIDE IT. Owner, 2026-08-20: *"i dont want the
            attachments to be above the composer"* — which was about the canvas session's composer,
            where a file row pushed the text box down the screen every time one landed. This is the
            front door, the pill is already centred in open space, and a row that grows here pushes
            nothing: the block is centred as a whole. Putting them inside a 52px pill would shrink
            the text field to nothing at two files.

            🔴 AND THEY ONLY EXIST WHILE SOMETHING IS STAGED, so the resting front door is byte for
            byte what it was — one greeting, one composer, one line of help. */}
        {!recording && staged.length > 0 && (
          <div className="pointer-events-auto mb-2 flex w-full max-w-[var(--composer-max-width)] flex-wrap gap-1.5">
            {staged.map((file) => (
              <span
                className="flex items-center gap-1.5 rounded-full bg-(--ui-bg-elevated) py-1 pl-3 pr-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-tertiary)"
                key={`${file.name}:${file.size}`}
              >
                <Codicon name="file" size="14px" />
                {/* A long filename must not stretch the row off the column. */}
                <span className="max-w-[220px] truncate">{file.name}</span>
                <button
                  aria-label={`Remove ${file.name}`}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-(--ui-text-quaternary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                  onClick={() =>
                    setStaged((current) =>
                      current.filter((entry) => entry.name !== file.name || entry.size !== file.size),
                    )
                  }
                  title="Remove"
                  type="button"
                >
                  <Codicon name="close" size="12px" />
                </button>
              </span>
            ))}
          </div>
        )}
        {recording ? (
          <div className="pointer-events-auto w-full max-w-[var(--composer-max-width)]">
            <CanvasRecorder
              // No canvas exists yet on the front door, so a finished recording STARTS one — the
              // identical thing dropping a file here does, through the identical door.
              attach={async (files) => { stageFiles(files); setRecording(false); }}
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
              if (event.target.files?.length) stageFiles(event.target.files);
              event.target.value = "";
            }}
            ref={filePicker}
            tabIndex={-1}
            type="file"
          />
          {/* 🔴 THE MENU IS GONE BECAUSE IT HAD ONE ITEM LEFT. Owner call, 2026-08-20: "remove the
              'record a lecture' option or just hide it." §L used to list the front door's five
              behaviours as "type a topic · ask a question · upload material · dictate · record", and
              upload and record shared this menu so a recording would not be confused with the
              dictation mic on the right. With record withdrawn there is nothing to choose between,
              and `canvas-composer.tsx` already states the rule for that case: "a one-item menu is a
              second click charged for nothing." So `+` is the file picker, exactly as it is in the
              canvas composer when it is given no `onRecord`.

              🔴 THE RECORDER ITSELF IS UNTOUCHED. `CanvasRecorder` and its close handler are still
              below; only the way in is withdrawn, so re-offering it is restoring a control rather
              than rebuilding a feature. */}
          <button
            aria-label="Upload material"
            className="flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--ui-action)"
            onClick={() => filePicker.current?.click()}
            title="Upload material"
            type="button"
          >
            <Codicon name="add" size="var(--composer-icon)" />
          </button>
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
              {/* 🔴 MATERIAL ALONE IS ENOUGH TO SEND. Requiring text would make a staged file
                  unsendable, which is the old behaviour with an extra step rather than a fix. */}
              <ComposerSend disabled={!text.trim() && staged.length === 0} label="Start" onClick={start} />
            </>
          )}
        </div>
        )}
        {/* 🔴 A DENIED MICROPHONE HAS TO SAY SO. Without this the mic button is pressed, nothing
            starts, and nothing appears — indistinguishable from a broken control. Observed exactly
            that while verifying: `SpeechRecognition` exists, so the button renders, but the capture
            never begins and the learner is told nothing. The session composer already prints this;
            the front door was the surface missing it. */}
{/* 🔴 THE GAP BETWEEN STOPPING AND THE WORDS ARRIVING HAS TO BE VISIBLE. On the browser
            lane there is none — it writes as it hears — but where Nemesis falls back to recording
            and sending, the microphone goes quiet and nothing appears for a second or two. Silence
            there reads as a control that ate the sentence. */}
        {dictation.transcribing && (
          <p className="mt-2 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">Turning that into words…</p>
        )}
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
            onRecovered={(file) => stageFiles([file])}
            uid={userId}
          />
        </div>
      </div>

    </main>
  );
}
