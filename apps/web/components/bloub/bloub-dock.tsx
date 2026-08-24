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

import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/components/theme-provider";
import { inkFor } from "@/lib/character/look";
import {
  ATTENTION_ATTR,
  getAttention,
  resolveAttention,
  subscribeAttention,
  type AttentionTarget,
} from "@/lib/mascot/attention";
import type { StateId } from "@/lib/bloub/states";
import type { ThinkingMark as ThinkingMarkKind } from "@/lib/learn/thinking-phases";

import { BloubBot } from "./bloub-bot";
import { ThinkingMark } from "./thinking-mark";
import { usePoke } from "./use-poke";
import type { FaceId } from "@/lib/character/face";
import { speedOf, stationOf, type Station } from "@/lib/character/stations";

/** How often the anchor and the attention target are re-measured. */
const MEASURE_MS = 120;

/** The dock's rendered size, and how much bigger it gets in the middle — as values, because
 *  the front door has to aim its own character at the exact point this one will occupy.
 *  See `canvas-home.tsx`: the two surfaces are different components and the hand-off between
 *  them is only invisible while they agree to the pixel. */
export const DOCK_SIZE = 60; // was 52; owner 2026-08-25: "the mascot looks a little bit small"
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

export interface BloubDockProps {
  /** Which animation is playing. Its station decides corner or centre. */
  state?: StateId;
  /** A mark above the character's head: "!" when something went wrong, "?" when it needs something
   *  from the learner. Absent on nearly every render — a mascot that is always signalling is a
   *  mascot nobody looks at. */
  marker?: "!" | "?" | null;
  /**
   * The step that is running, printed beside the character.
   *
   * 🔴🔴 IT RIDES THE DOCK BECAUSE THE CHARACTER MOVES. Owner, 2026-08-20: *"the mascot three dot
   * should have the thinking preview to the right of it."* That was tried as a separate flexbox
   * on the page, and the caption ended up pinned to the right EDGE of the window — `justify-end`
   * had meant "push to the bottom" while the container was a column, and silently became "push to
   * the right" when it became a row (owner, 2026-08-21: *"why is the 'thinking' so far off"*).
   *
   * No static box can sit beside a character whose position is a live transform. This is a sibling
   * of the marker, so it inherits that transform and is beside the character by construction —
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
   * 🔴 ACCEPTED HERE AND NOT YET DRAWN — a deliberate, agreed half-step (nemesis-5e ↔ this lane,
   * 2026-08-24). The data half lives in `canvas-chat.ts` / `use-canvas-session.ts`; the chips are
   * this file's to draw, and its owner asked for the prop to land first so the wiring could be
   * finished without two sessions editing the dock at once. Rendering nothing for it is correct
   * until then, and strictly better than the caller holding the list with nowhere to send it.
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
  face?: FaceId | null;
  hidden?: boolean;
  className?: string;
}

export function BloubDock({
  caption = null,
  captionLeaving: leaving = false,
  captionMark = null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- accepted now, drawn with the favicon proxy; see the prop's doc.
  domains: _domains = [],
  station: stationOverride,
  marker = null,
  state = "idle",
  size = DOCK_SIZE,
  anchor,
  left = 22,
  bottom = 24,
  gap = 14,
  centreScale = DOCK_CENTRE_SCALE,
  contain = false,
  face = null,
  hidden = false,
  className,
}: BloubDockProps) {
  const { accent, theme } = useTheme();
  // Clicking it draws a reaction, and a busy state cancels one mid-gesture.
  // `motion` is the half the engine has no pose for — the hop. See `use-poke.ts`.
  const { state: shown, motion, face: pokeFace, poke } = usePoke(state);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(bottom);
  const [inset, setInset] = useState(left);
  /**
   * Where the character stands relative to its corner, and whether the first measurement has
   * landed yet. `placed` starts false so the very first placement can be INSTANT: a canvas that
   * opens already thinking mounts this dock straight onto the middle station, and animating that
   * first placement would walk the character in from a corner it was never standing in —
   * replaying, badly, the journey the front door's greeter just made. `ms` is the per-move
   * override for `--bloub-travel-ms` (see bloub.css); null means the stylesheet's journey time.
   */
  const [travel, setTravel] = useState<{ dx: number; dy: number; k: number; ms: number | null; placed: boolean }>({ dx: 0, dy: 0, k: 1, ms: null, placed: false });
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
  const [aimAt, setAimAt] = useState<{ x: number; y: number } | null>(null);
  const targetRef = useRef<AttentionTarget>(getAttention());
  const focusedRef = useRef<Element | null>(null);
  // The station, readable from inside the attention interval without re-arming it.
  const stationRef = useRef<Station>("corner");

  // ── Where the dock sits ──────────────────────────────────────────────────────
  useEffect(() => {
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
        setOffset(bottom);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.height === 0) {
        setOffset(bottom);
        setInset(left);
        return;
      }
      // 🔴 THE OPEN MENU COUNTS AS PART OF THE COMPOSER (owner 2026-08-25: "the mascot should
      // move above it"). The + menu's popover is absolutely positioned INSIDE the composer, so
      // the composer's own rect never grows when it opens — the character sat on the menu. The
      // popover carries data-canvas-composer-popover for exactly this measurement (stamped by
      // canvas-composer.tsx; renaming either side re-creates the clash silently — pinned by
      // bloub-dock.test.ts).
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
      setOffset(Math.max(bottom, floor - top + gap));
      // Lined up with the composer's left edge, in the same coordinate space the dock is
      // positioned in. `left` survives only as the fallback for a composer that is not there.
      const originX =
        contain && host?.offsetParent instanceof HTMLElement
          ? host.offsetParent.getBoundingClientRect().left
          : 0;
      setInset(Math.max(8, r.left - originX));
    };
    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [anchor, bottom, gap, contain, left]);

  // ── Where it stands ──────────────────────────────────────────────────────────
  const station = stationOverride ?? stationOf(shown);
  stationRef.current = station;
  useEffect(() => {
    const measure = () => {
      const host = hostRef.current;
      if (!host) return;
      if (station === "corner") {
        setTravel((was) => ({ dx: 0, dy: 0, k: 1, ms: was.placed && anchoredRef.current ? null : 0, placed: anchoredRef.current }));
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
      setTravel((was) => ({
        dx: middle.x - cornerX,
        dy: middle.y - cornerY,
        k: centreScale,
        ms: was.placed && anchoredRef.current ? null : 0,
        placed: anchoredRef.current,
      }));
    };
    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [station, contain, inset, offset, size, centreScale]);

  // ── What it is looking at ────────────────────────────────────────────────────
  //
  // In order of precedence: whatever `lookAt()` was last given, then the focused field,
  // then — by falling through to null — the pointer, which BloubBot handles itself.
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

    const timer = window.setInterval(() => {
      const point =
        resolveAttention(targetRef.current) ??
        (focusedRef.current ? resolveAttention({ kind: "element", el: focusedRef.current }) : null);
      // 🔴 THINKING EYES SEARCH, THEY DO NOT FOLLOW (owner 2026-08-25: working must not be
      // "just staring"). At the middle, with nothing explicitly claiming the gaze, the eyes
      // drift on two slow, unsynchronised arcs — mostly upward, the way anyone's do when
      // recalling — rather than falling through to the pointer. Corner stations fall through
      // exactly as before.
      if (!point && stationRef.current === "centre" && hostRef.current) {
        const r = hostRef.current.getBoundingClientRect();
        const t = performance.now();
        setAimAt({
          x: r.left + r.width / 2 + Math.sin(t / 1700) * r.width * 1.6,
          y: r.top + r.height / 2 - r.height * 0.9 + Math.sin(t / 1150) * r.height * 0.55,
        });
        return;
      }
      setAimAt(point);
    }, MEASURE_MS);

    return () => {
      unsubscribe();
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.clearInterval(timer);
    };
  }, []);

  // 🔴 AFTER EVERY HOOK, NEVER BEFORE ONE. An early return above the effects would change the hook
  // count between renders the moment `hidden` flips, which React treats as a different component.
  if (hidden) return null;

  return (
    <div
      ref={hostRef}
      className={["bloub-dock", className].filter(Boolean).join(" ")}
      style={{
        position: contain ? "absolute" : "fixed",
        left: inset,
        bottom: offset,
        transform: `translate3d(${travel.dx}px, ${travel.dy}px, 0) scale(${travel.k})`,
        // Instant only while `ms` says so; every later move takes the stylesheet's journey.
        ...(travel.ms !== null ? ({ "--bloub-travel-ms": `${travel.ms}ms` } as React.CSSProperties) : {}),
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
          trick and it would take `BloubBot` down with it — the engine, its clock and the gaze's
          entry turn all live in that subtree, so every second poke would restart the character
          rather than move it. It does not need the trick: `usePoke` alternates jump → wink and
          always returns to null between reactions, so the class really is removed and re-added,
          which restarts the animation on its own. */}
      {/* 🔴 WORKING IS NEVER JUST STANDING (owner 2026-08-25: "when it's thinking… not just
          staring — have some movements as well"). At the middle station the wrapper carries a
          slow sway — weight shifting foot to foot — and the eyes wander (below). Both are
          physics, both melt away the moment it walks back. A poke's own motion outranks it. */}
      <div className={motion === "jump" ? "bloub-jump" : motion === "spin" ? "bloub-spin" : station === "centre" ? "bloub-ponder" : undefined}>
        <BloubBot
          aimAt={aimAt}
          color={accent}
          face={pokeFace ?? face}
          onPoke={poke}
          size={size}
          speed={speedOf(shown)}
          state={shown}
          track
          waggle={motion === "waggle"}
        />
      </div>
      {/* 🔴 A MARK ABOVE THE HEAD, NOT A BODY STATE — owner's own wording, 2026-08-20: *"the mascot
          should have an exclamation mark or question mark appear above its head for those kinds of
          things."* The engine ships `exclaim` and `alert` poses that deform the character itself,
          and the owner was asked and chose neither: the character stays itself and something
          appears near it, which is how a mascot has always signalled.

          🔴 ADDITIVE, AND DELIBERATELY OUTSIDE THE ENGINE. `lib/bloub/*` is vendored whole and not
          edited (see bloub-bot.tsx), and the animation loop writes SVG attributes every frame — a
          glyph pushed through it would be a fourth thing to keep in sync at 60fps for no gain.
          This is a sibling that inherits the dock's own transform, so it travels with the character
          without the character knowing about it. */}
      {marker && (
        <span
          aria-hidden="true"
          className="bloub-mark pointer-events-none absolute left-1/2 bottom-full font-extrabold leading-none select-none"
          style={{
            // 🔴🔴 A GLYPH IN THE CHARACTER'S OWN INK, NOT A COIN (owner 2026-08-24: "I didn't
            // want a circle around the exclamation mark or the question mark"). The filled disc
            // read as a badge stuck onto the scene; the bare glyph in `inkFor` — the same
            // function the body is painted with — reads as the creature itself signalling, and
            // it cannot drift from the body across themes or accents. Its ARRIVAL is the
            // animation (owner: "it's supposed to be an animation"): pop in with a small
            // overshoot, then bob gently while the state holds — see `.bloub-mark` in bloub.css.
            color: inkFor(accent, theme),
            // 🔴 COUNTER-SCALED, the same reason the caption is. The dock grows to `centreScale`
            // when the character comes forward to think, and a mark that grew with it became a
            // page-sized question mark floating above the middle of the screen.
            fontSize: `${Math.round(size * 0.46) / travel.k}px`,
            marginBottom: `${4 / travel.k}px`,
          }}
        >
          {marker}
        </span>
      )}

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
      {caption && (
        <span
          className={`bloub-caption pointer-events-none absolute select-none whitespace-nowrap text-[length:var(--canvas-text-small)] leading-none${
            station === "centre" ? " left-1/2 top-full" : " left-full top-1/2"
          }${leaving ? " canvas-preview-out" : ""}`}
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
          <span className="flex items-center gap-1.5">
              {captionMark ? <ThinkingMark kind={captionMark} /> : null}
              {/* 🔴 THE SHIMMER PAINTS TEXT, SO IT MAY ONLY WRAP TEXT. `canvas-thinking-word`
                  clips a moving gradient to glyphs, which it does by setting `color:transparent`
                  — so while it sat on the whole caption box it made the mark beside the words
                  invisible (its strokes are `currentColor`) and would have done the same to
                  anything else that ever joined them. It belongs on the sentence it animates. */}
            <span className="canvas-thinking-word">{caption}</span>
          </span>
        </span>
      )}
    </div>
  );
}
