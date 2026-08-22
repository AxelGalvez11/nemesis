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
//
// 🔴🔴 EVERY MOVE IS THAT TRANSFORM NOW, AND THAT IS THE FIX FOR THE JAGGED WALK (owner
// 2026-08-21: "the mascot should move toward the center smoothly not jaggedly"). The claim
// above was only three-quarters true: the corner→centre trip was a transform, but the
// CORNER ITSELF was `left`/`bottom`, re-measured off the composer every 120ms and written
// straight onto the element with no transition at all. So two things moved the character,
// one eased and one snapped, and they fought:
//
//   · The composer's rectangle changes constantly — it grows as you type, it travels on the
//     front door's hand-off, it is absent for the first frames of a canvas. Each change
//     jumped `left`/`bottom` instantly.
//   · `dx`/`dy` are measured FROM that corner, so every jump also retargeted the transform
//     mid-flight. A 680ms ease that is handed a new destination five times on the way there
//     restarts its curve five times, which is exactly what "jaggedly" looks like.
//
// So the corner is now a fixed base that never moves, and the anchor is tracked by the SAME
// transform that carries the journey. One property, one easing, nothing to fight — and
// following the composer as it grows became smooth as a side effect, because it stopped
// being a series of 120ms steps.
//
// 🔴 AND IT DOES NOT WALK IN FROM A CORNER IT WAS NEVER STANDING IN. A dock that mounts
// already busy — which is every canvas opened from the front door, because the send starts a
// turn — used to appear at the lower-left and crawl to the middle, while the character the
// learner was just looking at sat in the middle of the page they came from. That reads as
// two characters, not one. The first placement is silent: hidden for the frame before it is
// measured, then shown where it belongs, with the travel enabled from the next frame on.

import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/components/theme-provider";
import {
  ATTENTION_ATTR,
  getAttention,
  resolveAttention,
  subscribeAttention,
  type AttentionTarget,
} from "@/lib/mascot/attention";
import type { StateId } from "@nemesis/shared/bloub/states";

import { BloubBot } from "./bloub-bot";
import { usePoke } from "./use-poke";
import { speedOf, stationOf, type Station } from "@nemesis/shared/character/stations";

/** How often the anchor and the attention target are re-measured. */
const MEASURE_MS = 120;

/** The dock's rendered size, and how much bigger it gets in the middle — as values, because
 *  the front door has to aim its own character at the exact point this one will occupy.
 *  See `canvas-home.tsx`: the two surfaces are different components and the hand-off between
 *  them is only invisible while they agree to the pixel. */
export const DOCK_SIZE = 52;
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

/** How long a move takes when it is the character FOLLOWING something rather than travelling
 *  somewhere. The composer growing under it is not a journey and must not be paced like one;
 *  680ms of easing to keep up with a line of typed text would lag visibly behind the text. */
const FOLLOW_MS = 140;

export interface BloubDockProps {
  /** Which animation is playing. Its station decides corner or centre. */
  state?: StateId;
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
  className?: string;
}

/** The character's offset from its base corner, and how it should get there.
 *  `ms: null` means "use the journey's own duration", which lives in bloub.css so that
 *  `prefers-reduced-motion` can shorten it without JavaScript having to ask. */
interface Placement {
  dx: number;
  dy: number;
  k: number;
  ms: number | null;
  /** Which station this placement is OF. What paces the next move: a change of station is a
   *  journey, anything else is the character keeping up with something that moved. */
  station: Station;
  placed: boolean;
}

export function BloubDock({
  state = "idle",
  size = DOCK_SIZE,
  anchor,
  left = 22,
  bottom = 24,
  gap = 14,
  centreScale = DOCK_CENTRE_SCALE,
  contain = false,
  className,
}: BloubDockProps) {
  const { bloubShape, bloubColor } = useTheme();
  // Clicking it draws a reaction, and a busy state cancels one mid-gesture. `motion` is the
  // half the engine has no pose for — the hop and the brow waggle. See `use-poke.ts`.
  const { state: shown, motion, poke } = usePoke(state);
  const hostRef = useRef<HTMLDivElement | null>(null);
  /**
   * Where the character is, relative to the base corner, and how long it should take to get
   * there. `placed` is false until the first measurement lands — see `visibility` below.
   */
  const [place, setPlace] = useState<Placement>({ dx: 0, dy: 0, k: 1, ms: 0, station: "corner", placed: false });
  const [aimAt, setAimAt] = useState<{ x: number; y: number } | null>(null);
  const targetRef = useRef<AttentionTarget>(getAttention());
  const focusedRef = useRef<Element | null>(null);

  const station = stationOf(shown);

  // ── Where it stands ──────────────────────────────────────────────────────────
  //
  // ONE MEASUREMENT, ONE PROPERTY. The base corner (`left`/`bottom` on the element) is the
  // props and never changes; everything the character does — following the composer, walking
  // to the middle, coming back — is the delta from that corner. See the file header for what
  // this replaced and why the old split was the source of the judder.
  useEffect(() => {
    const measure = () => {
      const host = hostRef.current;
      if (!host) return;
      // 🔴 THE VIEWPORT, NOT THE DOCUMENT, WHEN THIS IS NOT CONTAINED. An uncontained dock is
      // `position: fixed`, so its `bottom` is measured against the viewport — and on a page
      // taller than the window `document.documentElement`'s rect is the whole scrollable
      // document, which would put the base corner below the fold and the middle station
      // somewhere off screen. Contained, the positioned ancestor is the right answer and is
      // the whole reason `contain` exists: the workspace has a rail down the left.
      const parent = contain && host.offsetParent instanceof HTMLElement ? host.offsetParent : null;
      const pr = parent
        ? parent.getBoundingClientRect()
        : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      // The UNTRANSFORMED centre of the dock, computed rather than measured: reading the
      // host's own rect would already include the transform, and the two would chase each
      // other every 120ms until the character drifted off the screen.
      const baseX = pr.left + left + size / 2;
      const baseY = pr.bottom - bottom - size / 2;

      let x = baseX;
      let y = baseY;
      let k = 1;
      if (station === "centre") {
        const middle = centreStation(pr);
        x = middle.x;
        y = middle.y;
        k = centreScale;
      } else if (anchor) {
        const el = document.querySelector(anchor);
        const r = el?.getBoundingClientRect();
        // A zero rect is an element that is in the DOM but not laid out yet — on a canvas
        // that is the first frames of every mount. Falling back to the base corner rather
        // than to (0, 0) is what keeps the character off the top-left of the window.
        if (r && r.height > 0) {
          // Lined up with the composer's left edge and floating clear of its top, clamped so
          // a composer taller than the surface cannot push the character off the bottom or
          // past the left edge. Same two clamps the offsets carried before.
          x = Math.max(pr.left + 8, r.left) + size / 2;
          y = Math.min(baseY, r.top - gap - size / 2);
        }
      }

      setPlace((was) => {
        const dx = x - baseX;
        const dy = y - baseY;
        if (was.placed && was.dx === dx && was.dy === dy && was.k === k) return was;
        return {
          dx,
          dy,
          k,
          // 🔴 THREE SPEEDS, AND THE FIRST ONE IS THE ONE THAT MATTERS. Nothing at all for
          // the initial placement, so a canvas that opens already thinking puts the
          // character in the middle instead of sliding it in from a corner it was never
          // standing in. The journey's own pace for a change of station. A short follow for
          // everything else, which is the composer growing under it — paced like keeping up,
          // not like travelling.
          ms: !was.placed ? 0 : was.station !== station ? null : FOLLOW_MS,
          station,
          placed: true,
        };
      });
    };
    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
    // 🔴 `station` IS A DEPENDENCY, NOT SOMETHING THE TICK NOTICES. Reading it off a ref
    // inside the interval would have been cheaper by one effect teardown and would have cost
    // up to a full MEASURE_MS before the character started moving — so Nemesis would begin
    // thinking and the character would stand still for a beat first. Re-running the effect
    // measures immediately.
  }, [anchor, bottom, gap, contain, left, size, centreScale, station]);

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
      setAimAt(point);
    }, MEASURE_MS);

    return () => {
      unsubscribe();
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={["bloub-dock", className].filter(Boolean).join(" ")}
      style={{
        position: contain ? "absolute" : "fixed",
        // 🔴 THE BASE CORNER, AND IT IS THE PROPS. These two never change while the dock is
        // mounted; every move the character makes is in the transform below. See the file
        // header: the anchor used to be written here, which put an un-eased layout property
        // in a fight with an eased composited one.
        left,
        bottom,
        transform: `translate3d(${place.dx}px, ${place.dy}px, 0) scale(${place.k})`,
        // Only ever an override — `null` hands the duration back to bloub.css, which is
        // where `prefers-reduced-motion` shortens the journey.
        ...(place.ms === null ? null : { ["--bloub-travel-ms" as string]: `${place.ms}ms` }),
        // 🔴 HIDDEN FOR EXACTLY ONE FRAME, WHICH IS THE FRAME BEFORE IT KNOWS WHERE IT IS.
        // React paints the element before the measuring effect runs, so without this the
        // character flashes at its base corner on every mount — including the mount that
        // happens when the front door hands over to a canvas, where the flash lands right
        // in the middle of the hand-off it is supposed to be hiding inside.
        visibility: place.placed ? undefined : "hidden",
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
          rather than move it. It does not need the trick: `usePoke` never plays the same motion
          twice in a row (the cycle is jump → wink → waggle) and always returns to null between
          reactions, so the class really is removed and re-added, which restarts the animation
          on its own. */}
      <div className={motion === "jump" ? "bloub-jump" : undefined}>
        <BloubBot
          aimAt={aimAt}
          color={bloubColor}
          shape={bloubShape}
          onPoke={poke}
          size={size}
          speed={speedOf(shown)}
          state={shown}
          track
          waggle={motion === "waggle"}
        />
      </div>
    </div>
  );
}
