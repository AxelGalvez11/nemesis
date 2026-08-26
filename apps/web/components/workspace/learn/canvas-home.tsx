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

import { NemesisAvatar } from "@/components/avatar/nemesis-avatar";
import { DOCK_CENTRE_SCALE, DOCK_SIZE, centreStation } from "@/components/character/character-dock";
import { stateForCanvas } from "@/lib/character/stations";
import { usePoke } from "@/components/character/use-poke";
import { Codicon } from "@/components/desktop-ui/codicon";
import { useTheme } from "@/components/theme-provider";
import { ACCEPTED_MATERIAL } from "@/lib/learn/canvas-tasks";
import { CAPABILITY_COPY, COMPOSER_CAPABILITIES, type ComposerCapability } from "@/lib/learn/composer-capability";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import { AddMenuRow, ADD_MENU } from "./add-menu-row";
import { AttachmentCard, AttachmentRow } from "./attachment-card";
import { ComposerSend } from "./composer-controls";
import { FileDropOverlay } from "./file-drop-overlay";
import { TodayStrip } from "./today-strip";
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

/**
 * The clearance under the canvas composer: `bottom-0` plus `pb-4`.
 *
 * 🔴 RESOLVED, NOT WRITTEN DOWN, AND THE OLD LITERAL WAS BOTH WRONG AND UNFIXABLE. It said 16,
 * with a comment correctly explaining that "every rem in this app is 1.125x its number" — and
 * then not applying it: `pb-4` is 1rem, which at the app's 112.5% root is 18px, so the composer
 * landed 2px above where the canvas actually draws it and the route swap corrected the last two
 * pixels in one frame.
 *
 * 🔴 AND NO OTHER LITERAL WOULD HAVE SURVIVED EITHER, which is the real reason this is a
 * function. The root size is the SCALING setting — a learner on 90% or 115% moves every rem in
 * the product, so any number typed here is right at exactly one setting. Reading the root font
 * size back is reading `pb-4` itself.
 */
function canvasComposerInset(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 18;
}

/** How big the character is on the front door. Bigger than the canvas dock's resting size,
 *  because here it is the only thing on the page rather than a marker beside a composer. */
// 🔴 IT TRACKS `DOCK_SIZE`, WHICH IS WHY IT MOVED TOO. 64 against a 60px dock; 80 against a 76px
// one (owner 2026-08-26: "make the mascot bigger in the app"). The two are different components on
// different surfaces and the hand-off between them is only invisible while their sizes keep the
// same relationship — grow one alone and the character visibly changes size mid-flight.
const GREETER_SIZE = 80;

export function CanvasHome({ accessToken = null, userId }: { accessToken?: string | null; userId: string | null }) {
  const { session: authSession } = useAuth();
  const uid = authSession?.user.id ?? null;
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
  /**
   * Where the composer travels, in px. Measured at the moment of the send; see `start`.
   *
   * 🔴🔴 IT DROPS STRAIGHT DOWN, AND THE SIDESTEP THAT USED TO BE HERE WAS AIMING AT THE RIGHT
   * PLACE AT THE WRONG TIME. The canvas is an immersive surface: it takes the nav rail away, so
   * this page's composer — centred inside a railed column — sits 26px right of where the canvas's
   * composer eventually settles inside the whole window. The old code therefore travelled 26px
   * LEFT on the way down, to land on that eventual position.
   *
   * The flaw is that "eventually" is not "on arrival". The rail is not taken away until
   * `CanvasSurface` mounts and claims the immersive surface in an EFFECT — a frame after the route
   * swap — and the column then animates 52px→0 over 240ms (`[data-pane-shell-animate]`, globals.css).
   * So at the instant of the swap the canvas's own composer is still centred in a railed column, at
   * +26, while this one had just finished travelling to 0. The learner saw the composer arrive,
   * jump 26px right as the page changed, and then slide 26px left again as the chrome caught up.
   * Two corrections to fix an offset that was never wrong.
   *
   * Both ends now measure the SAME rectangle — the surface this page fills, which is the same
   * column the canvas's `<main>` will fill (see `start`). The composer lands exactly where the
   * canvas's composer begins, so the swap shows nothing at all; the rail then slides away and
   * carries both the composer and the character with it, as one deliberate movement of chrome
   * rather than as a correction. `x` is kept because the two rectangles can still differ — a
   * scrollbar, a narrow viewport — and zero is the common case rather than the assumption.
   */
  const [travel, setTravel] = useState({ x: 0, y: 0 });
  const greeterBox = useRef<HTMLDivElement>(null);
  /**
   * The character's trip to the middle, measured at the moment of the send.
   *
   * 🔴🔴 IT TRAVELS TO WHERE THE CANVAS'S CHARACTER WILL BE, TO THE PIXEL (owner 2026-08-21:
   * "the mascot should move toward the center smoothly not jaggedly"). These are two different
   * components on two different surfaces — this greeter unmounts and `CharacterDock` mounts — so
   * the only thing that makes the swap invisible is the two of them agreeing about where the
   * character stands and how big it is. Anything less and the learner watches one character
   * vanish and another appear somewhere else, which is what "jaggedly" was describing.
   *
   * 🔴 SO THE NUMBERS COME FROM THE DOCK, NOT FROM HERE. `centreStation`, `DOCK_SIZE` and
   * `DOCK_CENTRE_SCALE` are exported by character-dock.tsx precisely so this cannot drift: retuning
   * the middle station moves both ends of the hand-off at once. A literal `0.42` copied into
   * this file would look right today and come apart on the first tweak.
   *
   * 🔴 AGAINST THE VIEWPORT, NOT AGAINST THIS PAGE'S OWN BOX. The canvas is an immersive
   * surface — it takes the nav rail away — so its character centres on the whole window. If
   * this page still has a rail beside it, the character is meant to end up slightly right of
   * where THIS page's middle is, because that is where it is about to be standing.
   */
  const [handoff, setHandoff] = useState<{ dx: number; dy: number; k: number } | null>(null);

  // 🔴 THE MENU IS BACK, BECAUSE IT HAS TWO OFFERS AGAIN. It was removed on 2026-08-20 when
  // "record a lecture" was withdrawn and upload stood alone — "a one-item menu is a second click
  // charged for nothing". The Course capability is the second offer (owner, 2026-08-23: *"you
  // can't access the course mode from the landing page"*), so the choice is real again and the
  // state, the ref and the dismiss listeners return with it.
  const [addOpen, setAddOpen] = useState(false);
  const addMenu = useRef<HTMLDivElement>(null);
  /** The one-shot capability staged on the NEXT send — the same contract as the session
   *  composer's chip (§38: cleared by the send, never a persistent mode). It rides to the canvas
   *  as `&cap=` beside `?ask=`, and the canvas's opening effect consumes both at once. */
  const [capability, setCapability] = useState<ComposerCapability | null>(null);
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
    //
    // 🔴 THE CAPABILITY RIDES ONLY BESIDE A TOPIC. Send is disabled while a capability is staged
    // with nothing typed (the session composer's own §3 rule, same reason), so the `?new=1` and
    // bare branches never have one to carry — a declaration about words needs the words.
    const href = topic
      ? `/learn?ask=${encodeURIComponent(topic)}${capability ? `&cap=${capability}` : ""}`
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
    // 🔴🔴 THE SURFACE, NOT THE VIEWPORT, AND THAT DISTINCTION WAS THE WHOLE GLITCH. Both halves of
    // this handoff aim at a centre, and they were aiming at two different ones. This page measured
    // against `window` while the canvas's `CharacterDock` measures against its `offsetParent` —
    // `CanvasSurface`'s `<main>`, which lives in the shell's SECOND grid column. Those two
    // rectangles differ by exactly the nav rail's width (`--nav-rail-width`, 52px) whenever the
    // rail is on screen, which it always is on the front door, because nothing here claims the
    // immersive surface. So the composer and the character were each sent 26px past where the
    // canvas was about to put them, and both then slid back once the canvas had mounted and the
    // rail had collapsed. A move that ends with a correction is not a move.
    //
    // The scroller is `h-full` inside the same column the canvas `<main>` will fill, so its
    // rectangle IS the arrival rectangle, whatever the rail is doing. Measuring it costs one more
    // `getBoundingClientRect` and makes the two surfaces agree by construction rather than by both
    // happening to be full-width.
    const surface = scroller.current?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    // Where the canvas composer sits: `bottom-0` with `pb-4`, so 16px of clearance under it.
    const target = surface.bottom - canvasComposerInset() - rect.height;
    setTravel({
      x: Math.round(surface.left + surface.width / 2 - (rect.left + rect.width / 2)),
      y: Math.max(0, Math.round(target - rect.top)),
    });
    // The character's own trip, on the same beat as the composer's — one departure, not two.
    const bot = greeterBox.current?.getBoundingClientRect();
    if (bot) {
      // The identical call the dock makes on the far side, against the identical rectangle.
      const middle = centreStation(surface);
      setHandoff({
        dx: Math.round(middle.x - (bot.left + bot.width / 2)),
        dy: Math.round(middle.y - (bot.top + bot.height / 2)),
        k: (DOCK_SIZE * DOCK_CENTRE_SCALE) / GREETER_SIZE,
      });
    }
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
      {/* 🔴 THE RING NOW COMES WITH A SENTENCE. It used to be the whole feedback — a 2px accent
          outline and nothing else, which says "this is a target" and never says what dropping
          does. `FileDropOverlay` keeps the ring and adds the answer. Not a modal: the page stays
          readable underneath and nothing has to be dismissed if the learner changes their mind
          mid-drag. */}
      {draggingOver && <FileDropOverlay note="Drop your material here and Nemesis will start from it" />}
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

              🔴 AND IT DOES NOT LEAVE — IT WALKS TO THE MIDDLE. This comment used to say the
              opposite ("it leaves with the greeting, on the same curve"), which was already
              overruled once (see `greeter` above: it stays put and starts thinking) and is now
              overruled again in the direction that finishes the job. Staying put was better than
              fading, and still left a step: the character sat where the greeting had been while
              the canvas's own character mounted somewhere else entirely. It now travels, on the
              composer's beat, to the exact point the dock is about to occupy — so the swap
              between the two components has nothing left to show. See `handoff`.

              This is also the one place the entrance turn belongs — the eyes go right round the
              body and come back, which is a real arrival and costs a beat. It is off everywhere
              else precisely because it would then happen on every appearance. */}
          {/* 🔴 THE HOP GETS ITS OWN ELEMENT HERE TOO, AND FOR THE SAME REASON AS IN `CharacterDock`:
              the wrapper above already carries the greeting's own margin and its departure, so a
              jump written onto it would have to share a transform with the transition. Nested
              elements multiply, so each keeps one job. See `use-poke.ts` for what a poke draws. */}
          {/* 🔴 `z-30` MATCHES `.character-dock`'s, so the character passes OVER the composer on its
              way to the middle rather than under it — the composer is travelling the other way
              and the two cross. `relative` is what makes the z-index apply at all. */}
          <div
            className="relative z-30 mb-5"
            ref={greeterBox}
            style={
              handoff
                ? {
                    transform: `translate3d(${handoff.dx}px, ${handoff.dy}px, 0) scale(${handoff.k})`,
                    // The composer's curve, not the dock's 680ms journey: the two are one
                    // departure and must land together, and the navigation is held for exactly
                    // this long. See `DOCK_MS`.
                    transition: `transform ${DOCK_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
                  }
                : undefined
            }
          >
            <div className={greeter.motion === "jump" ? "character-jump" : greeter.motion === "spin" ? "character-spin" : undefined}>
              <NemesisAvatar
                accent={accent}
                entrance
                face={greeter.face}
                onPoke={greeter.poke}
                size={GREETER_SIZE}
                animation={greeter.state}
                track
                waggle={greeter.motion === "waggle"}
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
              transform: departing ? `translate3d(${travel.x}px, ${travel.y}px, 0)` : undefined,
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
        <div className="pointer-events-auto flex w-full max-w-[var(--composer-max-width)] flex-col rounded-[var(--composer-radius)] bg-(--ui-bg-elevated) shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.05)] ring-1 ring-(--ui-stroke-tertiary)">
          {/* 🔴🔴 INSIDE THE BOX, LIKE THE CANVAS COMPOSER AND LIKE THE REFERENCE. These were a row
              of detached pills floating ABOVE the composer — which is both what the owner said he
              did not want on 2026-08-20 and what does not match. The pill became a card because a
              pill says "tag" and a card with a type line under the name says "file"; the geometry
              is measured off a real ChatGPT file card, see `attachment-card.tsx`.
              🔴 AND THE BOX IS A COLUMN NOW, WHICH IS THE ONLY STRUCTURAL CHANGE. It was a single
              centred row, so there was nowhere inside it for anything to sit above the input. The
              row's own classes moved unchanged onto the inner element below, so the composer's
              shape, height and padding are exactly what they were. */}
          {!recording && staged.length > 0 && (
            <AttachmentRow>
              {staged.map((file) => (
                <AttachmentCard
                  className="max-w-[260px] shrink-0"
                  key={`${file.name}:${file.size}`}
                  name={file.name}
                  onRemove={() =>
                    setStaged((current) =>
                      current.filter((entry) => entry.name !== file.name || entry.size !== file.size),
                    )
                  }
                />
              ))}
            </AttachmentRow>
          )}
          <div className="flex min-h-[var(--composer-min-height)] items-center gap-0 px-[var(--composer-pad-x)]">
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
          {/* 🔴🔴 THE ROWS COME FROM THE LIST, AND THAT IS THE DEFECT THIS FIXES. The capability
              row used to be written out once, by name, as `setCapability("course")`. So when Deep
              research was added to `COMPOSER_CAPABILITIES` (#824) and to the session composer, the
              front door kept offering exactly one capability and nothing failed — the owner opened
              the `+` on the landing page, saw Upload material and Course, and asked where Deep
              research was. It was in the canvas, reachable only by someone already inside one.

              A hard-coded row cannot be wrong about itself, which is precisely why it is dangerous:
              it silently stops being the whole menu. `canvas-composer.tsx` already builds its `+`
              by looping its offers for the same reason, in a comment that predicted this exact
              shape of miss. This surface now does too, so a third capability appears in both
              places or in neither. `front-door-capabilities.test.ts` pins it.

              The capability row STAGES and starts nothing — §38's rule that a capability is a
              declaration, never a mode. */}
          <div className="relative shrink-0" ref={addMenu}>
            <button
              aria-expanded={addOpen}
              aria-haspopup="menu"
              aria-label="Add"
              className="flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--ui-action)"
              onClick={() => setAddOpen((open) => !open)}
              title="Add"
              type="button"
            >
              <Codicon name="add" size="var(--composer-icon)" />
            </button>
            {addOpen && (
              <div className={cn("absolute bottom-[52px] left-0", ADD_MENU)} role="menu">
                <AddMenuRow
                  detail="From your computer"
                  icon="file"
                  label="Upload material"
                  onClick={() => { setAddOpen(false); filePicker.current?.click(); }}
                />
                {COMPOSER_CAPABILITIES.map((offered) => (
                  <AddMenuRow
                    detail={CAPABILITY_COPY[offered].detail}
                    icon={CAPABILITY_COPY[offered].icon}
                    key={offered}
                    label={CAPABILITY_COPY[offered].label}
                    onClick={() => { setAddOpen(false); setCapability(offered); }}
                    tint={CAPABILITY_COPY[offered].tint}
                  />
                ))}
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
              {/* The staged capability, inline where the words will start — the same composition
                  the session composer's chip uses, because it is the same declaration one screen
                  earlier. Always-visible ×: a hover-only dismiss does not exist on touch. */}
              {capability && (
                <div className="ml-[var(--composer-pad-x)] flex shrink-0 items-center gap-[6px] text-(--ui-action)">
                  <Codicon className="shrink-0" name={CAPABILITY_COPY[capability].icon} size="1rem" />
                  {/* §46.3-exempt: shares the input's own line — 16px is the iOS-zoom threshold
                      the input itself documents, and the label must not drift from it. */}
                  <span className="text-[16px] font-medium">{CAPABILITY_COPY[capability].label}</span>
                  <button
                    aria-label={`Remove ${CAPABILITY_COPY[capability].label}`}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                    onClick={() => setCapability(null)}
                    type="button"
                  >
                    <Codicon name="close" size="0.75rem" />
                  </button>
                </div>
              )}
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
                placeholder={capability ? CAPABILITY_COPY[capability].prompt : "Ask Nemesis…"}
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
                  unsendable, which is the old behaviour with an extra step rather than a fix.
                  🔴 EXCEPT UNDER A STAGED CAPABILITY, which is a declaration ABOUT words — the
                  session composer's own rule, held here so the `&cap=` can only ever ride beside
                  a real `?ask=`. */}
              <ComposerSend
                disabled={capability ? !text.trim() : !text.trim() && staged.length === 0}
                label="Start"
                onClick={start}
              />
            </>
          )}
          </div>
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
          {/* 🔴 THESE TWO LEAVE WITH THE GREETING, BECAUSE THEY HAVE NOWHERE TO TRAVEL TO. They sit
              OUTSIDE `composerBox`, so the departure did not carry them and did not fade them: the
              help line and the day's strip stayed at full opacity while the composer flew out from
              between them, and then vanished on the route swap. A hard cut at the end of a move the
              learner was watching is the exact abruptness the rest of this sequence exists to
              avoid. Same fade and same timing as the greeting above — one departure, not three. */}
          <div
            className="flex w-full flex-col items-center"
            style={{
              opacity: departing ? 0 : 1,
              transition: `opacity ${Math.round(DOCK_MS * 0.55)}ms ease-out`,
            }}
          >
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

          {/* 🔴 UNDER THE COMPOSER, AND SILENT WHEN THERE IS NOTHING WAITING. Workstream D. The
              composer stays the primary thing on this surface: someone arriving to type a question
              must not have to look past a wall of status to find the box, and a learner with a
              clear plate sees exactly what they saw before this shipped. `TodayStrip` renders null
              unless something is genuinely due, unfinished, or dated. */}
          <TodayStrip uid={uid} />
          </div>
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
