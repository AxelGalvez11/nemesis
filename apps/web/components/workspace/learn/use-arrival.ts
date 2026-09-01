"use client";

// The canvas half of the walk in from the front door. See lib/learn/arrival.ts for why the journey
// lives on this side at all.
//
// 🔴🔴 FIRST-PAINT OR NOTHING. The whole point of moving the animation here is that the arriving
// surface can be continuous with the departing one, and that is only true if the very first frame
// this component paints already has the composer and the character standing where the front door
// left them. One frame at the natural position before the animation starts IS the cut, just a
// shorter one — and a 16ms teleport followed by a two-second glide back is more obviously wrong
// than the 300ms blank it replaces.
//
// So: `useLayoutEffect`, which runs after the DOM is built and BEFORE the browser paints. It
// measures where each element naturally sits, writes the inverse offset straight onto the node's
// `style.transform`, and only then lets the frame out. The transition is armed on the next frame.
// This is FLIP, and the L (Last) has to be a real measurement rather than a constant, because the
// canvas's layout depends on the rail, the viewport and whether a document pane is open.
//
// 🔴 THE PIECES ARE FOUND BY SELECTOR, NOT BY REFS THREADED THROUGH TWO COMPONENTS. Both hooks
// already exist and are already load-bearing for exactly this kind of measurement: `CharacterDock`
// finds the composer by `#canvas-composer` today so it can float clear of its top edge. Adding a
// `ref` prop to `CanvasComposer` and `CharacterDock` to re-find the same two boxes would be a
// second mechanism for one fact. `[data-learner-said]` is new and is marked in canvas-thread-turn
// with the same warning the composer's id carries.

import { useLayoutEffect, useRef, useState } from "react";

import { ARRIVAL_EASE, ARRIVAL_MS, takeArrival, type Arrival, type ArrivalBox } from "@/lib/learn/arrival";

/** Which staged rectangle drives which element on screen. */
const PIECES = [
  { key: "composer", selector: "#canvas-composer" },
  // 🔴🔴 THE CHARACTER IS DELIBERATELY NOT HERE, AND THIS IS THE THIRD TIME THAT DECISION HAS BEEN
  // MADE. `CharacterDock` re-measures `#canvas-composer` continuously and writes its own
  // `transform` from JSX to float above it — so during the walk it is ALREADY moving, on a
  // rectangle that is itself being animated, and it has no stable untransformed position to be
  // walked back from. Measured, in this order: writing to `.character-dock` was silently overwritten
  // on the next render; a wrapper inside it composed two offsets and put the first painted frame at
  // (2584,-31); removing the compensation put it at (-165,480). Every one of those is a worse
  // artefact than not moving.
  //
  // So the character FADES in at its corner (`canvas-enter`, kept for this one element) while the
  // composer and the learner's sentence walk. character-dock.tsx's own header already records that
  // making it travel "has been attempted twice"; this is the third, and the honest conclusion is
  // that it needs the dock to own the journey — an `arriveFrom` prop feeding its existing travel
  // machinery — rather than a fourth party writing to its transform from outside.
  // 🔴 THE FIRST ONE, AND ON THE ARRIVAL THERE IS ONLY ONE. A canvas walked into from the front
  // door has exactly one turn in it — the sentence that opened it. `querySelector` taking the first
  // match is therefore the newest, and staying with `querySelector` means a canvas that somehow has
  // history cannot fly an old sentence across the screen.
  { key: "say", selector: "[data-learner-said]" },
] as const satisfies readonly { key: keyof Arrival & string; selector: string }[];

export type ArrivalState = {
  /** The staged rectangles, or null on every entry that is not a send from the front door — a deep
   *  link, a refresh, a canvas opened from the rail. Those must NOT animate: there is nowhere for
   *  them to have come from, and inventing a start position is the teleport this file exists to
   *  remove. Also carries the labels the canvas redraws so they can leave. */
  from: Arrival | null;
  /** True from the mount until the walk finishes. The chrome that has no counterpart on the front
   *  door (the title, the thinking caption, the header controls) waits on this, so it fades up
   *  behind furniture that has nearly stopped rather than competing with it. */
  walking: boolean;
};

export function useArrival(): ArrivalState {
  // 🔴🔴 READ ONCE, IN A `useState` INITIALISER, NOT IN AN EFFECT. `takeArrival` is destructive, and
  // React runs effects after paint and runs them twice in development's strict mode. Reading it in
  // an effect would mean the first painted frame has no offsets (the cut) and the second read
  // returns null (no animation at all). A lazy initialiser runs during the first render, before
  // anything is committed, exactly once per mount.
  const [from] = useState<Arrival | null>(() => takeArrival());
  const [walking, setWalking] = useState(from !== null);
  /** Which pieces have already been sent on their way, so a re-measure on a later commit cannot
   *  restart a journey that is half done. */
  const launched = useRef(new Set<string>());

  // 🔴 EVERY COMMIT, NOT ONLY THE FIRST, AND `launched` IS WHAT MAKES THAT SAFE. The learner's own
  // sentence does not exist on the mount — there is no turn yet, the canvas is still being minted —
  // so a first-commit-only effect would fly the composer and the character and then let the
  // sentence appear out of nowhere, which is the specific complaint this change answers. Running on
  // every commit catches each piece on the first commit it exists in; the set makes each fire once.
  useLayoutEffect(() => {
    if (!from) return;
    for (const { key, selector } of PIECES) {
      if (launched.current.has(key)) continue;
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) continue;
      const start = from[key] as ArrivalBox | null;
      if (!start || start.w === 0) {
        // Nothing was staged for this piece (no sentence was typed), so it has no journey. Mark it
        // done rather than re-querying it on every commit for the next two seconds.
        launched.current.add(key);
        continue;
      }
      const now = node.getBoundingClientRect();
      if (now.width === 0 && now.height === 0) continue;
      launched.current.add(key);

      const dx = Math.round(start.x - now.left);
      const dy = Math.round(start.y - now.top);
      // 🔴 SCALE COMES FROM THE MEASURED WIDTHS, AND ONLY FOR THE CHARACTER. The front door's
      // character is 80px and the dock's is 76px at a station scale; hard-coding that ratio here is
      // exactly the drift the old handoff had, where this file's constant and character-dock.tsx's
      // had to be kept in step by hand. Measuring both ends means retuning either size moves this on
      // its own. The composer and the sentence stay at scale 1 deliberately: the composer is already
      // a different element with a different shape, and a sentence that grows into place reads as a
      // zoom rather than as the same words moving.
      if (dx === 0 && dy === 0) continue;

      // FIRST: the start pose, with no transition, inside the layout effect. This is the frame the
      // browser is about to paint, so this is the frame that shows the front door's arrangement.
      node.style.transition = "none";
      // 🔴 TOP-LEFT, SO THE SCALE DOES NOT MOVE THE TRANSLATE. The default origin is the element's
      // centre, which means a `scale(k)` beside a `translate` shifts the box by half its size times
      // (1-k) as well — the offsets are computed from top-left rectangles, so the origin has to be
      // the same corner or the character lands short by a fraction of its own width.
      node.style.transformOrigin = "top left";
      node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      node.style.willChange = "transform";
      // 🔴 THE SENTENCE FLIES OVER THE COMPOSER, NOT UNDER IT. Its path from the field to the top
      // right passes straight through the composer's layer, which is `z-20` and carries an opaque
      // gradient — filmed 2026-09-01, the learner's own words were half-erased by it mid-flight.
      // Raised only while travelling, and handed back below, so nothing about the resting page
      // changes.
      if (key === "say") node.style.zIndex = "30";

      // THEN: arm the walk. Two nested frames, not one — a single `requestAnimationFrame` can be
      // delivered inside the same paint as the style above, in which case the browser never
      // observes the start value and there is nothing to transition FROM.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          node.style.transition = `transform ${ARRIVAL_MS}ms ${ARRIVAL_EASE}`;
          node.style.transform = "translate3d(0, 0, 0)";
        });
      });
    }
  });

  useLayoutEffect(() => {
    if (!from) return;
    // 🔴 CLEARED ON A CLOCK, AND THE CLOCK IS THE ANIMATION'S OWN LENGTH RATHER THAN A GUESS.
    // `transitionend` is the obvious listener and it is the wrong one here: there are three
    // elements, any of them can be skipped as a no-op above, and a piece that never mounts never
    // fires. One timer that cannot fail to stop is what the chrome underneath needs.
    const done = window.setTimeout(() => {
      setWalking(false);
      for (const { selector } of PIECES) {
        const node = document.querySelector<HTMLElement>(selector);
        if (!node) continue;
        // Hand the compositor layer back. `will-change` left on is a permanent promotion, and these
        // elements sit on screen for the rest of the session.
        node.style.willChange = "";
        node.style.transition = "";
        node.style.transform = "";
        node.style.transformOrigin = "";
        node.style.zIndex = "";
      }
    }, ARRIVAL_MS + 80);
    return () => window.clearTimeout(done);
  }, [from]);

  return { from, walking };
}
