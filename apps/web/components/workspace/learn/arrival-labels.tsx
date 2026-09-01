"use client";

// The two things on the front door with no counterpart in a canvas: the greeting ("Learn calculus")
// and the hint under the composer ("Type a topic, ask a question…").
//
// 🔴🔴 THEY ARE REDRAWN HERE PURELY SO THEY CAN LEAVE. Direction A's rule is that nothing appears
// and nothing vanishes — every element either walks to a new place or fades out while something
// else is already on screen. The composer, the character and the learner's sentence all walk, so
// they are handled by `useArrival`. These two have nowhere to walk TO: a canvas has no greeting and
// no hint. Without this they would simply stop existing on the frame the router swaps components,
// which is a cut in the middle of a two-second movement and reads as the page breaking.
//
// So the canvas paints copies of them at the coordinates the front door measured, and fades them
// out over `ARRIVAL_LABEL_MS` while everything else is still moving. They are inert: no pointer
// events, no semantics, `aria-hidden`. A screen reader has already been handed the real page.
//
// 🔴 `fixed`, NOT `absolute`, BECAUSE THE COORDINATES ARE THE VIEWPORT'S. `stageArrival` records
// `getBoundingClientRect`, which is viewport-relative; an absolutely positioned copy would be
// placed against whichever ancestor happens to be positioned and land somewhere else entirely.

import { useEffect, useState } from "react";

import { ARRIVAL_LABEL_MS, type Arrival } from "@/lib/learn/arrival";

export function ArrivalLabels({ from }: { from: Arrival | null }) {
  // 🔴 THE FADE IS A STATE FLIP ON THE SECOND FRAME, NOT A CSS ANIMATION, AND THE DIFFERENCE
  // MATTERS HERE. An `animation` runs from the first frame the element exists, which is right for
  // something arriving — `canvas-chrome-in` is built that way on purpose. This is the opposite
  // case: these labels must be painted at FULL opacity on the first frame, because that frame has
  // to match what the front door was showing a moment ago. Starting a fade from the first frame
  // would mean the greeting is already partly gone at the instant it is supposed to be unchanged.
  const [going, setGoing] = useState(false);
  useEffect(() => {
    // Two frames, for the same reason `use-arrival` needs two: one `requestAnimationFrame` can be
    // delivered inside the paint that created these nodes, and a transition needs the browser to
    // have observed the start value.
    const outer = requestAnimationFrame(() => {
      const inner = requestAnimationFrame(() => setGoing(true));
      return inner;
    });
    return () => cancelAnimationFrame(outer);
  }, []);

  if (!from || from.labels.length === 0) return null;

  return (
    <>
      {from.labels.map((label) => (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 flex items-center justify-center"
          key={`${label.text}:${label.box.y}`}
          style={{
            height: `${label.box.h}px`,
            left: `${label.box.x}px`,
            opacity: going ? 0 : 1,
            top: `${label.box.y}px`,
            color: label.colour,
            fontSize: label.font,
            fontWeight: label.weight,
            // 🔴 EASE-OUT, SO MOST OF THE FADE IS EARLY. These are the only things leaving, and a
            // label that lingers at 40% for a second is a smudge on a screen that has otherwise
            // moved on. Front-loading the fall means they are effectively gone well before the
            // furniture stops, while never being CUT.
            transition: `opacity ${ARRIVAL_LABEL_MS}ms cubic-bezier(.4,0,.7,.4)`,
            width: `${label.box.w}px`,
          }}
        >
          {/* 🔴🔴 THE SIZE IS CARRIED, NOT REPRODUCED, AND NOT INHERITED EITHER. An earlier version
              of this let the copy inherit the canvas's own type on the reasoning that reproducing
              the greeting's ramp here would split one design across two files. That reasoning still
              holds — which is why the size is READ off the real element at measurement time rather
              than written down here. Inheriting was the bug: the canvas's base type is larger than
              the front door's hint, so the copy overflowed its measured box and truncated to
              "…drop your materi…" mid-fade. Carrying two computed values keeps the design in one
              place and the copy the right size. */}
          {/* 🔴 `nowrap`, NOT `truncate`. The box is the measured box and the type is the measured
              type, so the text fits — but only exactly, and `truncate` inside a flex row lets the
              span shrink below its content and then draws an ellipsis for the sake of a rounded
              pixel. Filmed 2026-09-01: "Learn anything." came out as "Learn anythi…" on a box that
              was one pixel short. These copies are inert and gone in well under a second; letting a
              stray pixel overflow is invisible and clipping is not. */}
          <span className="whitespace-nowrap">{label.text}</span>
        </div>
      ))}
    </>
  );
}
