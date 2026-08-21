// The character on the canvas — the phone's `BloubDock`.
//
// 🔴 THE MASCOT IS PRESENT FOR THE WHOLE SESSION, NOT ONLY WHILE YOU WAIT (owner: "the mascot
// should be in the chat too"). The web file states the reason in one line and it is worth
// repeating rather than summarising: "a companion that only appears when you are waiting IS a
// spinner with a face." Before this the phone drew the character on the landing and nowhere else,
// so the moment a learner asked anything it vanished — which taught them it was a loading
// indicator, because that is exactly what it was.
//
// 🔴 IT SITS ABOVE THE COMPOSER'S TOP EDGE, FLUSH WITH ITS LEFT EDGE, and it holds that as the
// composer grows. The web dock measures `#canvas-composer`'s rectangle every 120ms to do this; the
// phone gets the same number for free from the composer's own `onLayout`, which is why
// `CanvasComposer` takes an `onLayoutHeight` callback — that callback is the phone's equivalent of
// the web's `id="canvas-composer"` handle, and it is functional rather than cosmetic. Drop it and
// the dock silently falls back to a fixed offset and starts overlapping the composer.
//
// 🔴 NEVER PART OF LAYOUT. Absolutely positioned, and transparent to touch — `BloubBot` sets
// `pointerEvents="none"` on itself whenever no `onPoke` is given, which is the case here. Nothing
// reserves space for it, so a growing composer pushes nothing around.
//
// 🔴 `paper` IS LOAD-BEARING. The eyes are holes cut in the body and the rings pass behind it, so
// the backing colour must be EXACTLY the colour of the surface the character is standing on. The
// caller passes it rather than this file guessing, because the dock sits over the page on the
// canvas and could sit over a card somewhere else.
//
// 🔴 AND IT DOES NOT AIM THE GAZE, WHICH IS THE OPPOSITE OF WHAT THIS FILE FIRST DID. The owner's
// complaint — "the mascot should be looking around not just staring away to the right" — was
// answered inside `components/bloub/BloubBot.tsx` itself: its render loop samples `idleAim` from
// `@nemesis/shared/character/gaze` every frame whenever no target is given, so an un-aimed
// character already looks around. This file used to walk a target of its own and hand it down
// through `aimAt`, and that was a second gaze system racing the first — `BloubBot`'s own comment
// names the failure ("two gaze systems that disagree at the moment one hands over to the other")
// and, worse, an `aimAt` OUTRANKS the wandering, so the dock's slow walk was actively suppressing
// the better one underneath it. The hook that walked it (`useWanderingGaze.ts`) was deleted with
// this note rather than left unused.

import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

import type { StateId } from "@nemesis/shared/bloub/states";
import { speedOf } from "@nemesis/shared/character/stations";
import { BloubBot } from "@/components/bloub/BloubBot";

import { COMPOSER } from "./canvas-metrics";

/** 52pt, the web dock's own default. Small enough to stand beside a composer without crowding it. */
export const DOCK_SIZE = 52;
/** How far above the composer's top edge the character stands — the web dock's `gap = 14`. */
export const DOCK_GAP = 14;

export function CanvasDock({
  state,
  expression,
  gaze,
  composerHeight,
  bottomInset,
  paper,
  onPoke,
}: {
  state: StateId;
  /** The gesture's face, when a poke is playing one. Two of the four reactions are expressions
   *  rather than animations, so this channel has to reach the character alongside `state`. */
  expression?: string;
  /** A gesture's scripted look, when it has one. */
  gaze?: ComponentProps<typeof BloubBot>["gaze"];
  /** The composer's measured height, from its own `onLayout`. */
  composerHeight: number;
  /** Whatever sits below the composer — safe area plus the dock's own padding. */
  bottomInset: number;
  paper: string;
  /** Tapping the character plays a reaction. Absent means the dock stays untouchable, which is
   *  what it was before it could react to anything. */
  onPoke?: () => void;
}) {
  return (
    <View
      // 🔴 `box-none` WHEN THERE IS SOMETHING TO TAP, AND THIS WAS A REAL BUG. The wrapper
      // hard-coded `pointerEvents="none"`, which in React Native deafens the WHOLE subtree — so
      // `BloubBot`'s own Pressable never saw a touch and the tap gestures were built, shipped and
      // completely unreachable on the character that is on screen for the entire session. It stays
      // `none` with no `onPoke` so a decorative dock cannot swallow a press meant for the answer
      // behind it; `box-none` lets the press through to the child without the wrapper claiming it.
      pointerEvents={onPoke ? "box-none" : "none"}
      style={[styles.dock, { bottom: bottomInset + composerHeight + DOCK_GAP, left: COMPOSER.marginX }]}
    >
      <BloubBot
        state={state}
        expression={expression}
        gaze={gaze}
        size={DOCK_SIZE}
        paper={paper}
        // 🔴 `speedOf`, NOT 1. The playback rate is a product decision that lives in
        // `@nemesis/shared/character/stations.ts` alongside the state mapping, so that a taste
        // call about pace (the owner slowed `swirl` to 0.55) reaches both renderers at once.
        speed={speedOf(state)}
        onPoke={onPoke}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", zIndex: 2 },
});
