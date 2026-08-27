"use client";

// The character, parked on a working surface — and the walk to the middle and back.
//
// WHERE IT SITS AND WHY. Lower left, above the composer. Lower left because the composer
// is the thing the learner keeps returning to and the character should be beside it
// rather than over it; above rather than beside because the composer grows as you type,
// and anything sharing its row gets shoved around. The dock measures the composer and
// floats clear of its top edge, so it holds its place while the composer changes height.
//
// 🔴 IT IS NEVER PART OF LAYOUT. Fixed or absolute, `pointer-events: none`, nothing
// reserves space for it. A decorative character that reflows the page it is sitting on,
// or eats a click meant for the composer behind it, is worse than no character.
//
// 🔴 AND THE JOURNEY IS A TRANSFORM. The dock's own `left`/`bottom` never move; only a
// composited transform carries it. Animating the offsets would lay the page out again on
// every frame of a 680ms trip across the surface, which is the easiest way for something
// decorative to make a real interface feel slow.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useTheme } from "@/components/theme-provider";
import {
  ATTENTION_ATTR,
  getAttention,
  resolveAttention,
  subscribeAttention,
  type AttentionTarget,
} from "@/lib/mascot/attention";

import type { ThinkingMark as ThinkingMarkKind } from "@/lib/learn/thinking-phases";

import { NemesisAvatar } from "@/components/avatar/nemesis-avatar";
import { ThinkingMark } from "./thinking-mark";
import { useDoze } from "./use-doze";
import { useMontage } from "./use-montage";
import { usePoke } from "./use-poke";
import type { FeatureFace } from "@/lib/avatar/features";
import { ACTIVITY_STATE, speedOf, stationOf, type StateId, type Station } from "@/lib/character/stations";
import { gazeTarget, glanceOffset, trackReach } from "@/lib/character/gaze";
import { CHARACTER_SILHOUETTE } from "@/lib/character/body";
import { placeAbove, placeBeside, placeUnder } from "./character-place";
import { DomainChips } from "@/components/DomainChips";

// 🔴 THE STYLESHEET COMES IN HERE NOW, AND FORGETTING IT COST AN AFTERNOON. It used to be
// imported by the renderer, which lived in this folder; the renderer moved to
// `components/avatar` when the two engines became one, and the import went with the file
// that was deleted. Nothing failed — `--character-paper` simply stopped resolving, the eyes
// fell back to near-white on a dark page, and the character rendered as a blank white disc.
import "./character.css";

/** How often the anchor and the attention target are re-measured. */
const MEASURE_MS = 120;

/** How far the thing being watched has to move before the dock re-renders to follow it. */
const AIM_SETTLED_PX = 1;
/**
 * How long a correction takes when the character is ALREADY at its station and the thing it
 * stands beside has moved — the composer growing a line, the rail collapsing, a resize.
 *
 * 🔴 `character.css` HAS DOCUMENTED THIS NUMBER SINCE THE DAY THE OVERRIDE WAS ADDED, AND NOTHING
 * EVER PASSED IT. `--character-travel-ms` was only ever written as `0ms` (place instantly) or left
 * unset (the stylesheet's 680ms walk), so every micro-correction eased over 680ms — two thirds of a
 * second to travel a handful of pixels. That is what made the character look like it was lagging
 * its anchor and rubber-banding after the front door handed it over: the correction is small, but
 * it was being played at the speed of a walk across the whole surface.
 *
 * A walk between stations is a journey and keeps the 680ms. A correction is not a journey.
 */
const FOLLOW_MS = 140;
/** Sub-pixel jitter is not a move; without a floor the 120ms tick re-renders for ever. */
const SETTLED_PX = 0.5;

/** Where the character stands relative to its corner, and whether a measurement has landed yet. */
interface Travel {
  readonly dx: number;
  readonly dy: number;
  readonly k: number;
  /** Per-move override for `--character-travel-ms`; null means the stylesheet's journey time. */
  readonly ms: number | null;
  readonly placed: boolean;
}

/** The dock's rendered size, and how much bigger it gets in the middle — as values, because
 *  the front door has to aim its own character at the exact point this one will occupy.
 *  See `canvas-home.tsx`: the two surfaces are different components and the hand-off between
 *  them is only invisible while they agree to the pixel. */
export const DOCK_SIZE = 76; // 52 -> 60 (owner 2026-08-25 "a little bit small") -> 76 (owner 2026-08-26 "make the mascot bigger in the app")
export const DOCK_CENTRE_SCALE = 2.1;

/** How far down the surface the middle station sits.
 *
 *  Optically above the true centre: a form parked on the exact middle of a page reads as
 *  sitting low, because the eye weights the top of a column more heavily. */
export const CENTRE_Y_FRACTION = 0.42;

/** Where the character stands when it takes the middle of `surface`, in client coordinates. */
export function centreStation(surface: { left: number; top: number; width: number; height: number }): {
  x: number;
  y: number;
} {
  return { x: surface.left + surface.width / 2, y: surface.top + surface.height * CENTRE_Y_FRACTION };
}

export interface CharacterDockProps {
  /** Which animation is playing. Its station decides corner or centre. */
  state?: StateId;
  /* 🔴🔴 THERE IS NO `marker` PROP, AND ITS ABSENCE IS THE DECISION (owner 2026-08-26: *"remove
   * the random question mark, exclamation mark above the mascot"*).
   *
   * It was added 2026-08-20 on the owner's own wording — *"the mascot should have an exclamation
   * mark or question mark appear above its head"* — and then narrowed four times as they kept
   * seeing it where they did not expect it: not during a turn, not while preparing, not while the
   * question it referred to was off screen, and in the character's own ink rather than a coin.
   * Each narrowing was correct and none of them fixed the report, because the complaint was never
   * about WHEN it fired. A glyph over a character that is already beside a composer holding the
   * question, on a page that prints the question in full, adds no fact the learner does not have.
   *
   * So the answer is not a fifth condition. It is that the character does not wear punctuation.
   * Restoring this means restoring the prop, the span, `.character-mark` in character.css and the
   * wiring in learning-canvas.tsx — and it means overturning a call the owner has now made three
   * times. `send-is-acknowledged.test.ts` holds all four pieces down. */
  /**
   * The step that is running, printed beside the character.
   *
   * 🔴🔴 IT RIDES THE DOCK BECAUSE THE CHARACTER MOVES. Owner, 2026-08-20: *"the mascot three dot
   * should have the thinking preview to the right of it."* That was tried as a separate flexbox
   * on the page, and the caption ended up pinned to the right EDGE of the window — `justify-end`
   * had meant "push to the bottom" while the container was a column, and silently became "push to
   * the right" when it became a row (owner, 2026-08-21: *"why is the 'thinking' so far off"*).
   *
   * No static box can sit beside a character whose position is a live transform. This is a child
   * of the dock, so it inherits that transform and is beside the character by construction —
   * there is no alignment left to get wrong.
   */
  caption?: string | null;
  /**
   * The answer has begun arriving, so the caption makes way.
   *
   * 🔴 IT FADES RATHER THAN VANISHING. Owner, 2026-08-21: *"When the final answer begins, smoothly
   * fade the thinking preview away and transition into the answer."* The two occupy the same moment
   * on screen, and an instant swap reads as a flicker between two states rather than as one thing
   * making way for another.
   */
  captionLeaving?: boolean;
  /**
   * The sites the turn in flight is reading, deduped, in the order the search ranked them.
   *
   * 🔴 NOW DRAWN. The half-step is closed: the data half landed in #795 (`canvas-chat.ts` /
   * `use-canvas-session.ts`), and the chips are rendered here by `DomainChips`, to geometry
   * measured off ChatGPT rather than guessed — see that component for the numbers and for the one
   * measurement deliberately not copied.
   *
   * 🔴🔴 THE LIST IS ONLY EVER SITES ALREADY READ. It rides the second `onSearching` beat, which
   * is the first moment the hosts are a fact rather than a guess, and the render site gates it on
   * `turnInFlight` so a stale chip is unrepresentable rather than merely cleaned up. There is no
   * default list to fall back to; before anything is searched the honest drawing is nothing. A
   * fabricated fallback is precisely what was found and deleted in `lib/favicon.ts`.
   *
   * 🔴 NOT TRUNCATED BY THE CALLER, BY REQUEST. The renderer decides how many chips to draw and
   * needs the real count for its "+N".
   *
   * 🔴 `undefined` AND `[]` MEAN THE SAME THING: no chips. There is no third state, so no caller
   * has to special-case a search that found nothing.
   */
  domains?: readonly string[];
  /**
   * The mark that belongs beside the caption, when the runtime can name the KIND of work.
   *
   * 🔴 DERIVED BY THE CALLER FROM THE SAME FACTS THE CAPTION IS, via `thinkingMark` — never
   * guessed here from the caption's words. A mark is a claim about what Nemesis is doing, and one
   * chosen by a different rule from the sentence beside it would eventually contradict it.
   * Null wherever the kind is not known, which is the honest answer and the common one.
   */
  captionMark?: ThinkingMarkKind | null;
  /**
   * Where the character stands, when the surface knows better than the pose does.
   *
   * 🔴🔴 THE POSE USED TO DECIDE, AND IT CANNOT ANY MORE. `stationOf` reads the state id, which
   * worked while every working pose was unique to working. The thinking pose IS the three dots, and
   * the owner asked for those to go — so the character now WORKS in `idle`, the same pose it rests
   * in. One id, two opposite places. Deriving the station from it would drag a resting character to
   * the middle of the page, which is worse than the dots ever were.
   *
   * Omitted, the pose still decides — every caller with no opinion behaves exactly as before.
   */
  station?: Station;
  /** Rendered size in px. The viewBox is square. */
  size?: number;
  /**
   * Selector for the element to float above — the composer. While it resolves, the dock
   * tracks its top edge; when it does not, the dock falls back to `bottom`.
   */
  anchor?: string;
  /**
   * How the character stands relative to `anchor`.
   *
   * 🔴 THREE ARRANGEMENTS, ALL THE OWNER'S, AND THE CANVAS HAS WORN EACH OF THEM. In order:
   *
   *   "beside"  the composer's left MARGIN, level with its middle (2026-08-26 morning: *"the
   *             mascot should be on the left side of composer"*). Still the front door's.
   *   "under"   Claude's arrangement, at the end of the answer (2026-08-26 afternoon: *"make the
   *             mascot sit under the answer"*). Nothing passes it today; kept because it is
   *             fifteen lines and the owner has reversed this three times in three days.
   *   "above"   ON TOP of the composer, at its left edge (2026-08-26 evening: *"I want it to be
   *             on top on the left of the chat composer"*, then, when asked to be exact, *"make
   *             sure its on top of the composer not in inside it, top left"*). The canvas's.
   *
   * The mode is a prop rather than three components because everything else — the travel, the
   * caption, the poke, the gaze, the centre station it takes while thinking — is identical, and
   * three components would be three characters.
   */
  place?: "beside" | "under" | "above";
  /**
   * Distance from the left edge, px — used only when the anchor cannot be measured.
   *
   * 🔴 NORMALLY THE ANCHOR DECIDES, NOT THIS (owner 2026-08-20: "can we have the blob be just
   * above the chat composer on the left side"). The composer is a centred column on a wide page,
   * so a character pinned to the PAGE's lower-left sat hundreds of pixels away from it, in an
   * empty corner. It now lines up with the composer's own left edge and travels with it.
   */
  left?: number;
  /** Distance from the bottom when there is no anchor, px. */
  bottom?: number;
  /** Gap left above the anchor, px. */
  gap?: number;
  /**
   * How much bigger it gets when it takes the middle.
   *
   * It has to grow, not merely travel: at dock size it is a marker in the corner, and
   * the whole point of the middle is that it is the thing happening while there is
   * nothing else to look at yet.
   */
  centreScale?: number;
  /**
   * Sit inside the nearest positioned ancestor rather than the window.
   *
   * On almost every surface this wants to be on: the workspace has a rail down the left,
   * and a character pinned to the WINDOW's lower-left corner lands inside it.
   */
  contain?: boolean;
  /**
   * Take the character off this surface entirely.
   *
   * 🔴🔴 IT EXISTS BECAUSE ONE SURFACE NOW DRAWS ITS OWN (owner 2026-08-21: *"when thinking, the
   * mascot should be on top of the three dots"*). The dock's `thinking` animation IS the three dots
   * — the body morphs into the middle one — so a blob standing above a row of dots is a composition
   * the animation cannot express, and `CanvasThinkingPreview` builds it out of a resting character
   * and three dots of its own.
   *
   * 🔴 WHICH MAKES THIS THE GUARD AGAINST SIX DOTS, AGAIN. That defect was two MOUNTS of one
   * renderer on one surface, both centred, both playing `thinking`. The rule "the dock owns the
   * character" is what fixed it, so a surface that draws its own has to switch the dock off rather
   * than hope the two never overlap.
   */
  /**
   * A face from our own layer for the surface's ACTIVITY — reading glasses while material
   * is taken in. A poke's own face (the sigma) outranks it for the poke's short hold.
   */
  face?: FeatureFace | null;
  hidden?: boolean;
  className?: string;
}

export function CharacterDock({
  caption = null,
  captionLeaving: leaving = false,
  captionMark = null,
  domains = [],
  station: stationOverride,
  state = "idle",
  size = DOCK_SIZE,
  anchor,
  place = "beside",
  left = 22,
  bottom = 24,
  gap = 14,
  centreScale = DOCK_CENTRE_SCALE,
  contain = false,
  face = null,
  hidden = false,
  className,
}: CharacterDockProps) {
  const { accent } = useTheme();
  // Clicking it draws a reaction, and a busy state cancels one mid-gesture.
  // `motion` is the half the engine has no pose for — the hop. See `use-poke.ts`.
  const { state: poked, motion, face: pokeFace, poke, poking } = usePoke(state);
  // 🔴🔴 THREE LAYERS OVER ONE BASE STATE, AND THE ORDER IS THE WHOLE BEHAVIOUR:
  //
  //   usePoke      what a click asked for. Beats everything: a click must be answered.
  //   useMontage   the resting faces, which only ever run when nothing else is happening.
  //   useDoze      asleep, which beats a montage — a sleeping character is not pulling faces.
  //
  // 🔴 EACH ONE ANSWERS A QUESTION ONLY IT CAN. What the SYSTEM is doing arrives as a prop; what
  // the LEARNER has been doing (nothing, for minutes) only the browser knows; what they just did
  // (clicked) only the component knows. Three hooks that each take a state and hand back a state
  // compose without any of them knowing about the others.
  //
  // `atRest` and `busy` are read from the SURFACE's own `state`, never from the layered result —
  // otherwise the montage's own face would read as "something is happening" and stop itself.
  const atRest = state === ACTIVITY_STATE.resting;
  const varied = useMontage(poked, atRest, poking);
  // `hidden` counts as away: the character is not on screen to fall asleep on.
  const shown = useDoze(varied, hidden, !atRest);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(bottom);
  const [inset, setInset] = useState(left);
  /**
   * Where the character stands relative to its corner, and whether the first measurement has
   * landed yet. `placed` starts false so the very first placement can be INSTANT: a canvas that
   * opens already thinking mounts this dock straight onto the middle station, and animating that
   * first placement would walk the character in from a corner it was never standing in —
   * replaying, badly, the journey the front door's greeter just made. `ms` is the per-move
   * override for `--character-travel-ms` (see character.css); null means the stylesheet's journey time.
   */
  const [travel, setTravel] = useState<Travel>({ dx: 0, dy: 0, k: 1, ms: null, placed: false });
  /**
   * 🔴 A REF, NOT AN EFFECT-LOCAL. The station effect re-runs whenever `station` itself changes, so
   * anything scoped inside it is reset by exactly the event it needs to remember — and a walk from
   * corner to centre would be mistaken for a correction and played at 140ms instead of 680ms.
   */
  const placedAtRef = useRef<Station | null>(null);
  /**
   * 🔴 THE ANCHOR MEASURES BEFORE ANY PLACEMENT COUNTS (owner 2026-08-25, on production: the
   * character "was already on the bottom left side, moving upward"). The station effect and the
   * anchor effect are separate, and the station used to place INSTANTLY against the DEFAULT
   * corner (left 22, bottom 24) on the first pass — then the composer's real measurements
   * arrived, left/bottom snapped, and the compensating transform GLIDED over 680ms: a visible
   * diagonal drift from the lower-left to wherever the character was meant to stand. Placement
   * is now instant until the first anchor measurement has landed, so the first thing ever
   * painted is already in the right place. Starts true when there is no anchor to wait for.
   */
  const anchoredRef = useRef(false);
  /**
   * Whether a real anchor has ever been measured — which is NOT the same question as `anchoredRef`.
   *
   * 🔴🔴 THE ANCHOR CAN GO AWAY MID-SESSION, AND WITHOUT THIS THE CHARACTER FALLS OFF THE PAGE INTO
   * THE CORNER WHEN IT DOES. Found before shipping, by reading the surface rather than by looking
   * at it: the canvas renders `{showComposer && !recording && <CanvasComposer/>}`, so pressing
   * record REPLACES the composer with the recorder panel and `#canvas-composer` stops existing for
   * as long as the lecture is being captured. The same hole opens on a completed canvas, which
   * renders no composer at all.
   *
   * The fallback corner is the right answer for a character that has never been placed. It is the
   * wrong answer for one that HAS: a control being swapped for another control in the same slot is
   * not a reason for the character to walk to the bottom-left of the window and back.
   */
  const everPlacedRef = useRef(false);
  /**
   * Whether the browser has actually PAINTED the character where it belongs, at least once.
   *
   * 🔴🔴 THIS IS THE FIX FOR THE HAND-OFF THE OWNER KEPT CALLING GLITCHY, AND THE REASON IT SURVIVED
   * TWO ROUNDS OF FIXES IS THAT THE CODE ALREADY LOOKED LIKE IT HANDLED IT. `durationFor` returns 0
   * for the first move — "be there already" — and `character.css` has documented that intent since
   * the override existed. Measured on a real Chrome across the swap, the first painted frame was
   * `transform: matrix(1,0,0,1,0,0)` with `transition-duration: 0.14s`, easing over 140ms into the
   * centre. The character therefore appeared at REST SIZE at its resting spot and swooped to the
   * middle — a fraction of a second after the front door's greeter had finished flying to that
   * exact spot at that exact size. Two arrivals, in opposite directions, for one send.
   *
   * 🔴 WHY `ms: 0` DID NOT REACH THE SCREEN. `measure()` runs, sets travel with ms 0 — and then runs
   * AGAIN in the same commit, because the placement effect's `setInset`/`setOffset` re-render before
   * the browser paints. The second run sees `was.placed === true` and returns FOLLOW_MS, so the
   * only style the browser ever saw was the 140ms one. `placed` was standing in for "has this been
   * painted", and it is not that: it is "has a measurement landed", and several of those can land
   * between two frames.
   *
   * 🔴 SO THE FLAG HAS TO BE SET BY THE BROWSER'S CLOCK, NOT BY REACT'S. Two nested frames: the
   * first callback runs before the paint that shows the placed character, the second after it.
   * A single frame flips it too early and the bug comes straight back.
   */
  const paintedRef = useRef(false);
  const [aimAt, setAimAt] = useState<{ x: number; y: number } | null>(null);
  const targetRef = useRef<AttentionTarget>(getAttention());
  const focusedRef = useRef<Element | null>(null);
  /**
   * When the pointer last moved.
   *
   * 🔴 THE DOCK HAS TO KNOW THIS EVEN THOUGH THE AVATAR ALREADY TRACKS THE POINTER ITSELF, because
   * the two facts are different: the avatar knows WHERE the pointer is, and this needs to know
   * whether it is still worth watching. Supplying `aimAt` at all overrides the pointer inside the
   * avatar, so the choice between "follow the cursor" and "watch the page" has to be made out
   * here, and it can only be made from the time.
   */
  const pointerAtRef = useRef(-Infinity);
  // The station, readable from inside the attention interval without re-arming it.
  const stationRef = useRef<Station>("corner");

  // ── Where the dock sits ──────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!anchor) {
      anchoredRef.current = true;
      setOffset(bottom);
      return;
    }
    const measure = () => {
      const el = document.querySelector(anchor);
      // Measured is measured, found or not — a missing composer resolves to the fallback,
      // which is a real answer, not a pending one.
      anchoredRef.current = true;
      if (!el) {
        // Held, not re-cornered — see `everPlacedRef`. The slot the anchor lived in is still there;
        // it is holding a different control for a moment.
        if (everPlacedRef.current) return;
        setOffset(bottom);
        return;
      }
      const r = el.getBoundingClientRect();
      // 🔴🔴 "NOT LAID OUT YET" IS A DIFFERENT MEASUREMENT FOR EACH MODE, AND CONFLATING THEM COST
      // an hour. A composer that has not been laid out has height 0, so `beside` treats that as
      // "fall back to the corner". The `under` anchor is a DELIBERATELY zero-height marker at the
      // end of the answer — it has no height by design — so the same test sent the character
      // straight back to the fallback corner on every measurement, and the whole feature was inert
      // while looking implemented. A marker that has not been laid out has no WIDTH; it wears the
      // reading column, so width is the honest emptiness test for it.
      if (place === "under" ? r.width === 0 : r.height === 0) {
        // (`above` and `beside` both measure the composer, so height is the honest test for both.)
        if (everPlacedRef.current) return;
        setOffset(bottom);
        setInset(left);
        return;
      }
      // 🔴 THE OPEN MENU COUNTS AS PART OF THE COMPOSER (owner 2026-08-25: "the mascot should
      // move above it"). The + menu's popover is absolutely positioned INSIDE the composer, so
      // the composer's own rect never grows when it opens — the character sat on the menu. The
      // popover carries data-canvas-composer-popover for exactly this measurement (stamped by
      // canvas-composer.tsx; renaming either side re-creates the clash silently — pinned by
      // character-dock.test.ts).
      const popover = document.querySelector("[data-canvas-composer-popover]");
      const top = popover ? Math.min(r.top, popover.getBoundingClientRect().top) : r.top;
      // Measured against whatever the dock is positioned within. Using the window's
      // height for a contained dock puts it hundreds of pixels below its own container,
      // where it simply vanishes.
      const host = hostRef.current;
      const floor =
        contain && host?.offsetParent instanceof HTMLElement
          ? host.offsetParent.getBoundingClientRect().bottom
          : window.innerHeight;
      // Measured against whatever the dock is positioned within, same as the floor.
      const originX =
        contain && host?.offsetParent instanceof HTMLElement
          ? host.offsetParent.getBoundingClientRect().left
          : 0;

      // 🔴🔴 BESIDE THE COMPOSER, NOT ON TOP OF IT (owner 2026-08-26: *"the mascot should be on
      // the left side of composer"*). It used to stand on the composer's shoulder — lined up
      // with its left edge and floating a gap above it — which put it in the text column, over
      // the last line of whatever the learner was reading. The arithmetic lives in
      // `placeBeside` so it can be checked without a browser.
      const at =
        place === "under"
          ? // 🔴 THE ANCHOR IS INSIDE A SCROLLER, WHICH IS WHY THE LISTENER BELOW EXISTS. Its rect
            // changes on every scroll frame, not only when the layout changes, and a 120ms interval
            // alone samples that at roughly 8fps — the character visibly stepping down the page
            // behind the text. See the rAF-throttled scroll handler.
            placeUnder({ anchor: { left: r.left - originX, bottom: r.bottom }, floor, size, gap, bottom })
          : place === "above"
            ? placeAbove({ anchor: { left: r.left - originX }, coveredTop: top, floor, size, gap, bottom })
            : placeBeside({
                anchor: { left: r.left - originX, top: r.top, height: r.height },
                coveredTop: top,
                floor,
                size,
                gap,
                bottom,
              });
      everPlacedRef.current = true;
      setInset(at.inset);
      setOffset(at.offset);
    };
    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    window.addEventListener("resize", measure);
    // 🔴 ONE MEASUREMENT PER FRAME WHILE SCROLLING, AND NOT ONE PER EVENT. Scroll fires far faster
    // than the screen repaints, and `measure` reads a rect — an unthrottled handler would force
    // synchronous layout dozens of times between paints for a decorative character. `capture: true`
    // because the element that actually scrolls is the canvas's inner column, not the window, and a
    // capturing window listener hears every scroller without having to be told which one.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll, { capture: true });
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [anchor, bottom, gap, contain, left, place, size]);

  // ── Where it stands ──────────────────────────────────────────────────────────
  const station = stationOverride ?? stationOf(shown);
  stationRef.current = station;
  useLayoutEffect(() => {
    /**
     * How long this move takes: null = the stylesheet's 680ms walk, 0 = be there already,
     * FOLLOW_MS = keep up with an anchor that shifted under a character already at its station.
     *
     * 🔴 `from` IS READ ONCE PER MEASUREMENT, NOT INSIDE THE UPDATER. A `setState` updater must be
     * pure — React is free to call it twice — so the ref is read here and written after the call,
     * never mutated from within it.
     */
    const durationFor = (placed: boolean, from: Station | null) => {
      // 🔴 `paintedRef` FIRST, AND IT IS NOT REDUNDANT WITH `placed` — see its own note. Until the
      // character has been on screen for one frame there is nothing to travel FROM, so every
      // duration is zero and the first thing the learner sees is the character already in place.
      if (!paintedRef.current || !placed || !anchoredRef.current) return 0;
      return from === null || from === station ? FOLLOW_MS : null;
    };
    const settled = (was: Travel, dx: number, dy: number, k: number, ms: number | null, placed: boolean) =>
      Math.abs(was.dx - dx) < SETTLED_PX &&
      Math.abs(was.dy - dy) < SETTLED_PX &&
      was.k === k &&
      was.ms === ms &&
      was.placed === placed;
    const measure = () => {
      const host = hostRef.current;
      if (!host) return;
      if (station === "corner") {
        const from = placedAtRef.current;
        setTravel((was) => {
          const ms = durationFor(was.placed, from);
          // 🔴 THE SAME OBJECT BACK WHEN NOTHING MOVED. `setTravel` allocated a fresh object every
          // 120ms whether or not any number in it had changed, so React could never bail out and
          // this component — with `NemesisAvatar` and its whole engine underneath it — re-rendered
          // eight times a second for the life of the session, each time forcing synchronous layout.
          // Returning `was` unchanged is what makes the ticker free when the character is standing
          // still, which is almost always.
          return settled(was, 0, 0, 1, ms, anchoredRef.current)
            ? was
            : { dx: 0, dy: 0, k: 1, ms, placed: anchoredRef.current };
        });
        placedAtRef.current = station;
        return;
      }
      const parent =
        (contain && host.offsetParent instanceof HTMLElement ? host.offsetParent : null) ??
        document.documentElement;
      const pr = parent.getBoundingClientRect();
      // The UNTRANSFORMED corner, computed rather than measured: reading the host's own
      // rect would already include the transform, and the two would chase each other
      // every 120ms until the character drifted off the screen.
      const cornerX = pr.left + inset + size / 2;
      const cornerY = pr.bottom - offset - size / 2;
      const middle = centreStation(pr);
      const dx = middle.x - cornerX;
      const dy = middle.y - cornerY;
      const from = placedAtRef.current;
      // 🔴 A SNAP WAS TRIED HERE AND MEASURED WORSE, WHICH IS WHY THE EASE STAYS. The nav rail
      // collapses over 240ms and the centre station is derived from the surface, so for those
      // 240ms the destination itself is sliding and the 140ms catch-up leaves the character a
      // fraction behind it. Placing instantly instead looks like the obvious fix and is not: the
      // station is re-measured on a 120ms interval, so "instant" quantises the whole journey to
      // roughly 8fps and the character visibly stutters between samples. Measured both ways —
      // eased, it settles at the centre by ~+560ms; snapped, it held two positions and arrived at
      // ~+900ms. The ease is doing real work: it smooths over the sampling rate.
      setTravel((was) => {
        const ms = durationFor(was.placed, from);
        return settled(was, dx, dy, centreScale, ms, anchoredRef.current)
          ? was
          : { dx, dy, k: centreScale, ms, placed: anchoredRef.current };
      });
      placedAtRef.current = station;
    };
    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    window.addEventListener("resize", measure);
    // One frame to let the placed character be painted, a second to be past that paint. Only then
    // does a move become a journey. Re-armed on every run of this effect and cancelled on cleanup,
    // which costs two frames of nothing once and cannot leak.
    let first = 0;
    let second = 0;
    if (!paintedRef.current) {
      first = window.requestAnimationFrame(() => {
        second = window.requestAnimationFrame(() => {
          paintedRef.current = true;
        });
      });
    }
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      if (first) window.cancelAnimationFrame(first);
      if (second) window.cancelAnimationFrame(second);
    };
  }, [station, contain, inset, offset, size, centreScale]);

  // ── What it is looking at ────────────────────────────────────────────────────
  //
  // In order of precedence: whatever `lookAt()` was last given, then the focused field,
  // then — by falling through to null — the pointer, which NemesisAvatar handles itself.
  useEffect(() => {
    const unsubscribe = subscribeAttention((t) => {
      targetRef.current = t;
    });

    const onFocus = (ev: FocusEvent) => {
      const el = ev.target;
      if (!(el instanceof Element)) return;
      // A field, or anything that opted in. Following every focus ring would make the
      // character stare at the page's own chrome.
      const wanted =
        el.hasAttribute(ATTENTION_ATTR) ||
        el.matches("input, textarea, [contenteditable='true'], [role='textbox']");
      focusedRef.current = wanted ? el : null;
    };
    const onBlur = () => {
      focusedRef.current = null;
    };

    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);

    // Passive, and it records a TIME rather than a position: where the pointer is, is the
    // avatar's business; whether it is still worth watching is this one's.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointerAtRef.current = performance.now();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    /**
     * 🔴 A SETTLE CHECK, AND IT IS NOT AN OPTIMISATION — IT IS THE SAME DEFECT THIS FILE ALREADY
     * FIXED ONCE FOR `travel`. Before this, the resting branch set `aimAt(null)` every tick, and
     * `Object.is(null, null)` let React bail out, so a still character re-rendered never. Aiming at
     * the composer instead means handing React a FRESH OBJECT eight times a second, and the whole
     * avatar engine hangs off this component: it would force synchronous layout ~8×/sec forever,
     * for a target that has not moved a pixel. One pixel is well under anything the eased head can
     * express, so nothing visible is lost.
     */
    const aimTo = (next: { x: number; y: number } | null) =>
      setAimAt((was) => {
        if (!next) return was === null ? was : null;
        if (was && Math.abs(was.x - next.x) < AIM_SETTLED_PX && Math.abs(was.y - next.y) < AIM_SETTLED_PX) return was;
        return next;
      });

    const timer = window.setInterval(() => {
      const now = performance.now();
      // The glance rides on TOP of whatever is being watched, so the character looks away from the
      // composer and back to the composer rather than away from and back to a fixed direction.
      // 🔴 THE GLANCE AND THE SWEEP ARE FRACTIONS OF FULL DEFLECTION, so both are measured in the
      // same reach the renderer normalises against. They used to be written in CHARACTER WIDTHS,
      // which was the same thing only while the reach was `size * 2.5` — see `trackReach`. Left
      // alone, this change would have shrunk a glance to a sixth of itself, silently.
      const host = hostRef.current;
      const centre = host
        ? (() => { const r = host.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const reach = trackReach({ centre, viewport: { width: window.innerWidth, height: window.innerHeight } });
      const glance = glanceOffset(now, reach);
      // 🔴🔴 TWO KINDS OF "SOMETHING ELSE IS WORTH WATCHING", AND MERGING THEM STOPPED THE
      // CHARACTER FOLLOWING THE MOUSE AT ALL (owner 2026-08-26: *"the mascot is not following the
      // mouse at all"*).
      //
      //   declared  the surface called `lookAt()` — "attend to THIS", a drawing it just made, a
      //             question it is asking. Deliberate, rare, and it still outranks everything.
      //   focused   a field the learner happens to have clicked into. Nobody declared anything;
      //             it is a guess about where they are looking.
      //
      // These were one value and it was checked ABOVE the pointer, so a focused field beat a
      // moving cursor — permanently. On the canvas the composer keeps focus after every send, so
      // the character stared at the composer for the rest of the session and the mouse did
      // nothing. Measured: with a field focused the averaged gaze reads +58.9 with the pointer far
      // LEFT and +58.4 with it far RIGHT; unfocused the same sweep runs -56.9 to +56.2.
      //
      // 🔴 A FOCUSED FIELD IS NOT DELETED, IT IS DEMOTED. It is a better resting target than the
      // composer when the learner is typing somewhere else, so it takes the composer's place in
      // the fall-back below rather than losing its turn.
      const declared = resolveAttention(targetRef.current);
      const focused = focusedRef.current ? resolveAttention({ kind: "element", el: focusedRef.current }) : null;
      // 🔴 THE ORDER LIVES IN `gazeTarget`, NOT HERE. Everything this block does now is MEASURE —
      // where the composer is, where the focused field is, where the searching sweep is up to —
      // and hand those four facts to one pure function. The precedence used to be a run of early
      // returns in this interval, which is why "does a moving mouse beat a focused text box?" was
      // unanswerable without opening a browser, and why the answer was wrong for weeks.
      const restingBox = (() => {
        const el = anchor ? document.querySelector(anchor) : null;
        const box = el?.getBoundingClientRect();
        if (!box || box.height === 0) return null;
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      })();
      // 🔴 THE ARCS ARE UNCHANGED AND THEY MEAN SOMETHING DIFFERENT LEVELLED, which is the point.
      // They are ±1.6 character-widths, and the avatar normalises an aim against 2.5 widths, so
      // this sweep is ±16.6° of yaw. Added to `curious`'s own 16° it used to run from level to 33°
      // off — a sweep that spent its whole time on one side. Levelled (`facing="forward"`) the
      // identical arithmetic swings ±16.6° AROUND FORWARD, which is what "searching" always meant.
      // 🔴 THINKING EYES SEARCH, THEY DO NOT FOLLOW (owner 2026-08-25: working must not be "just
      // staring"). At the middle the eyes drift on two slow, unsynchronised arcs, mostly upward,
      // the way anyone's do when recalling, rather than falling through to the pointer.
      const workingBox = (() => {
        if (stationRef.current !== "centre") return null;
        // The same sweep it always was, now stated as the fraction of full deflection it always
        // meant: ±0.64 of the reach is ±16.6° of yaw, which is what "searching" was tuned at.
        return {
          x: centre.x + Math.sin(now / 1700) * reach * 0.64,
          y: centre.y - reach * 0.36 + Math.sin(now / 1150) * reach * 0.22,
        };
      })();
      const want = gazeTarget({
        declared,
        focused,
        resting: restingBox,
        pointerAgeMs: now - pointerAtRef.current,
        working: workingBox,
      });
      // 🔴 THE GLANCE RIDES ON TOP OF WHATEVER IS BEING WATCHED, so the character looks away from
      // the composer and back to the composer rather than away from and back to a fixed direction.
      // 🔴 AND NEVER ON TOP OF THE SEARCHING SWEEP, which is already a wander of its own — two
      // wanders on one head is a head that cannot decide.
      aimTo(want && !workingBox ? { x: want.x + glance.x, y: want.y + glance.y } : want);
    }, MEASURE_MS);

    return () => {
      unsubscribe();
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("pointermove", onPointerMove);
      window.clearInterval(timer);
    };
  }, [anchor, size]);

  // 🔴 AFTER EVERY HOOK, NEVER BEFORE ONE. An early return above the effects would change the hook
  // count between renders the moment `hidden` flips, which React treats as a different component.
  if (hidden) return null;

  return (
    <div
      ref={hostRef}
      className={["character-dock", className].filter(Boolean).join(" ")}
      style={{
        position: contain ? "absolute" : "fixed",
        left: inset,
        bottom: offset,
        transform: `translate3d(${travel.dx}px, ${travel.dy}px, 0) scale(${travel.k})`,
        // Instant only while `ms` says so; every later move takes the stylesheet's journey.
        ...(travel.ms !== null ? ({ "--character-travel-ms": `${travel.ms}ms` } as React.CSSProperties) : {}),
        // Nothing stands anywhere until the first measurement has said where.
        visibility: travel.placed ? undefined : "hidden",
      }}
      aria-hidden="true"
    >
      {/* 🔴 THE HOP IS ITS OWN ELEMENT, INSIDE THE ONE THAT TRAVELS. The host already carries
          `translate3d(...) scale(...)` for the corner→centre walk and re-writes it whenever the
          composer moves, so a jump written onto the SAME element would either be overwritten by
          the next measurement or have to be spliced into that string every frame. Nested
          transforms multiply, so a child that only ever hops composes with a parent that only
          ever travels, and neither has to know about the other.

          🔴 NOT KEYED, AND IT MUST NOT BE. Re-mounting to restart the animation is the obvious
          trick and it would take `NemesisAvatar` down with it — the engine, its clock and the gaze's
          entry turn all live in that subtree, so every second poke would restart the character
          rather than move it. It does not need the trick: `usePoke` alternates jump → wink and
          always returns to null between reactions, so the class really is removed and re-added,
          which restarts the animation on its own. */}
      {/* 🔴 WORKING IS NEVER JUST STANDING (owner 2026-08-25: "when it's thinking… not just
          staring — have some movements as well"). At the middle station the wrapper carries a
          slow sway — weight shifting foot to foot — and the eyes wander (below). Both are
          physics, both melt away the moment it walks back. A poke's own motion outranks it. */}
      <div className={motion === "jump" ? "character-jump" : motion === "spin" ? "character-spin" : station === "centre" ? "character-ponder" : undefined}>
        <NemesisAvatar
          aimAt={aimAt}
          accent={accent}
          face={pokeFace ?? face}
          onPoke={poke}
          size={size}
          speed={speedOf(shown)}
          animation={shown}
          facing="forward"
          silhouette={CHARACTER_SILHOUETTE}
          track
          waggle={motion === "waggle"}
        />
      </div>
      {/* 🔴 COUNTER-SCALED, because the dock grows to `centreScale` when the character comes
          forward to think and a caption that grew with it would be enormous type on the page. The
          gap is divided too: a margin here is measured in the parent's scaled space, so a constant
          8px on screen has to be 8/k in it. Origin pinned left so it grows away from the
          character rather than into it. */}
      {/* 🔴 LIT LEFT TO RIGHT, WHICH IS THE MOTION THE WHOLE PRODUCT USES (owner, 2026-08-21: *"i
          just want the mascot and the words lit left to right"*). `.canvas-thinking-word` is the
          same band and the same 1900ms as `.canvas-forming` and `.canvas-rewriting`; §20 asks for
          ONE motion system, and a second treatment beside the character would read as a second kind
          of event happening at the same time.

          🔴 NO PILL BEHIND IT ANY MORE. A filled capsule is a badge — it says "status", which is
          what a spinner says. The words themselves carrying the light is what says "this is being
          worked through", and a background defeats `background-clip: text` outright. */}
      {/* 🔴 BESIDE THE CHARACTER IN THE CORNER, UNDER IT AT THE CENTRE (owner 2026-08-25: "I
          want the mascot to be on top of the thinking preview lines"). At the centre the
          character is the only thing on the page and twice its size; a word off its right
          shoulder read as mislaid. Underneath, the pair reads as one composition — the creature
          working, the step it is on. */}
      {/* 🔴🔴 THE SHIMMER MOVED INWARDS, AND THAT IS LOAD-BEARING, NOT TIDYING.
          `canvas-thinking-word` animates a gradient THROUGH the text by way of
          `background-clip: text` + `color: transparent`. Both inherit. Leaving it on this outer
          element and nesting the chips inside would paint every hostname transparent and clip the
          favicons' own box — the row would be there, occupying space, drawing nothing. So the
          outer element now only positions, and the shimmer sits on the word it is shimmering. */}
      {(caption || domains.length > 0) && (
        <span
          // 🔴 THE POSITION TERNARY IS LEFT BYTE-FOR-BYTE ALONE, AND THE ALIGNMENT RIDES ITS OWN.
          // Two guards in send-is-acknowledged.test.ts pin that exact substring — it is how they
          // check the caption sits UNDER the character at the centre and BESIDE it in the corner,
          // which is a real invariant with an owner ruling behind it. Folding `items-*` into that
          // ternary broke both while changing nothing they care about. Loosening someone else's
          // guard to fit my edit is the wrong direction when the edit can simply not disturb it.
          //
          // 🔴 A COLUMN NOW, BECAUSE TWO THINGS STACK HERE: the mark-and-sentence row, and the
          // sites underneath it. `whitespace-nowrap` moved down onto the sentence — the chips are
          // the one thing here that SHOULD wrap.
          // 🔴🔴 16px ON A 24px LINE, WAS 14px ON `leading-none` (owner 2026-08-26: *"the thinking
          // preview is a bit small compared to the mascot… compare with ChatGPT or Claude for the
          // sizing"*). Measured on claude.ai at the same 1470px viewport: their thinking caption is
          // 14px on a 20px line beside a 20px mark. Theirs reads right because the whole pair is
          // small together; ours sits beside a 76px character, so matching their TYPE SIZE would
          // have kept exactly the mismatch the owner is pointing at. Matching their RATIO is the
          // useful thing, and the type scale's next step up is `--canvas-text-body`.
          //
          // 🔴 AND A REAL LINE-HEIGHT. `leading-none` is 1em, which at 14px is survivable and at
          // 16px puts the mark and the words in a box tighter than either of them.
          className={`character-caption pointer-events-none absolute flex select-none flex-col gap-1.5 text-[length:var(--canvas-text-body)] leading-6 ${
            station === "centre" ? "items-center" : "items-start"
          }${station === "centre" ? " left-1/2 top-full" : " left-full top-1/2"}${leaving ? " canvas-preview-out" : ""}`}
          style={
            station === "centre"
              ? {
                  marginTop: `${10 / travel.k}px`,
                  transform: `translateX(-50%) scale(${1 / travel.k})`,
                  transformOrigin: "center top",
                }
              : {
                  marginLeft: `${8 / travel.k}px`,
                  transform: `translateY(-50%) scale(${1 / travel.k})`,
                  transformOrigin: "left center",
                }
          }
        >
          {/* 🔴 THE MARK RIDES THE CHARACTER TOO. The caption moved onto the dock because nothing
              static can sit beside a live transform (see above); the mark is part of the same
              claim, so it lives in the same box and counter-scales with it. */}
          {caption ? (
            <span className="flex items-center gap-2 whitespace-nowrap">
              {captionMark ? <ThinkingMark kind={captionMark} /> : null}
              {/* 🔴 THE SHIMMER PAINTS TEXT, SO IT MAY ONLY WRAP TEXT. `canvas-thinking-word`
                  clips a moving gradient to glyphs, which it does by setting `color:transparent`
                  — so while it sat on the whole caption box it made the mark beside the words
                  invisible (its strokes are `currentColor`) and would have done the same to the
                  chips below, which two sessions found independently on the same day. It belongs
                  on the sentence it animates and nothing else. */}
              <span className="canvas-thinking-word">{caption}</span>
            </span>
          ) : null}
          {/* 🔴 THE CHIPS DO NOT SHIMMER. The caption shimmers because it names a step still in
              progress; a site already read is a settled fact, and animating it would say the
              opposite of what it means. */}
          <DomainChips domains={domains} />
        </span>
      )}
    </div>
  );
}
