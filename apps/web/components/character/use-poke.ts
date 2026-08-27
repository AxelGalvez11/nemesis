"use client";

// Clicking the character makes it react, then go back to what it was doing.
//
// 🔴 A POKE IS A ONE-SHOT, NOT A STATE THE CALLER HAS TO UNSET. The obvious version — set a
// state on click, clear it in the click handler of something else — leaves the character
// stuck mid-gesture whenever the second click never comes. The reaction owns its own
// lifetime and hands the surface back to `base` on its own.
//
// 🔴 AND `base` WINS WHILE IT MATTERS. If Nemesis starts thinking during a poke, the poke is
// abandoned immediately: what the system is doing outranks a gesture the learner asked for
// two hundred milliseconds ago. Without that, a click could hide a busy state.
//
// ── WHAT A POKE DRAWS ────────────────────────────────────────────────────────
//
// 🔴🔴 EVERY GESTURE HERE IS OURS, NONE IS THE VENDORED PACK'S (owner 2026-08-23: *"I don't
// want any rainbow swirls or animations from the GitHub that we used… I want us to create
// our own animation language"*). The language's rules live in `lib/character/face.ts`; the
// short version: a creature, never an icon; physics, never effects. The vendored `swirl`,
// `wide`, `exclaim` and `play` states remain in the catalogue as a plain copy of upstream,
// and nothing in this product schedules them — guarded in `lib/character/character.test.ts`.
//
// 🔴 WHAT ACTUALLY PLAYS IS THE LIST IN `REACTIONS` BELOW, AND SINCE 2026-08-26 (EVENING) IT IS
// ONE THING: THE SPIN. The descriptions that follow document every gesture this file has
// scheduled at some point — they are all still built, and only one of them is reached.
//
// The five customs, in the order repeated clicks used to walk them before the list was cut to one:
//   jump   — leaves the ground and LANDS SQUISHY (owner's word): the body flattens wide on
//            impact and rebounds. CSS on the wrapper; see `.character-jump` in character.css.
//   waggle — both brows rise and fall twice. Drawn as holes in the body's own mask through
//            the eye matrices, so they turn with the head; see `lib/character/brow.ts`.
//   spin   — one clean pirouette, body only. 🔴 THIS IS NOT THE OLD SWIRL: no arcs, no
//            colour trails, no eyes orbiting the body — the creature simply turns once,
//            with a lean in and a settle out. CSS on the wrapper; see `.character-spin`.
//   sigma  — one raised brow, half-lidded stare, lopsided smirk, held still and staring
//            straight ahead (the gaze is deliberately suppressed while it holds). The
//            owner asked for "a funny one, like a sigma emoji type"; the joke is that it
//            plays it completely straight.
//   wink   — the engine's own wink, kept from the start: it is entirely a face and the
//            one vendored gesture that was always the creature being a creature.

import { useCallback, useEffect, useRef, useState } from "react";

import { ANIMATION_BY_ID, animationDuration } from "@/lib/avatar";
import type { FeatureFace } from "@/lib/avatar/features";
import type { StateId } from "@/lib/character/stations";

/** Movement the engine does not know about, drawn over whatever pose is playing. */
export type PokeMotion = "jump" | "waggle" | "spin" | null;

interface Reaction {
  /** The engine state to hold. `idle` means "keep its ordinary face while the body moves". */
  readonly state: StateId;
  readonly motion: PokeMotion;
  /** A face from our own layer, worn for the reaction's whole hold. */
  readonly face: FeatureFace | null;
  /** How long to hold it, ms. Engine states use the animation's own published duration. */
  readonly hold: number;
}

/** How long the hop takes, start to landing. Must match `--character-jump-ms` in character.css. */
export const JUMP_MS = 620;
/** Up, down, up, down, gone. Must match WAGGLE_MS in lib/avatar/features.ts. */
export const WAGGLE_MS = 900;
/**
 * One clean turn. Must match `--character-spin-ms` in character.css.
 *
 * 🔴 760 → 520 ON REPORT (owner 2026-08-26: *"make sure it's quick once clicked on"*). The old
 * number bought a wind-up and an overshoot that have both been removed; without them there is
 * nothing for the extra quarter-second to do but make the turn slow.
 *
 * 🔴 TWO COPIES OF ONE DURATION, AND THAT IS UNAVOIDABLE RATHER THAN SLOPPY: the CSS owns the
 * animation and this owns how long the reaction is held. If they part company the character
 * either stops mid-turn or stands still at the end of one. `character.test.ts` pins them equal.
 */
export const SPIN_MS = 520;
/** How long the sigma face holds. Long enough to be seen, short enough to stay a joke. */
export const SIGMA_MS = 1600;

/**
 * How long a burst is held for, which is NOT the same as how long `burst` lasts.
 *
 * 🔴🔴 THE CATALOGUE'S DURATION IS THE LOOP, AND A POKE WANTS ONE PASS. `animationDuration("burst")`
 * is 2600ms — the sum of every step — and holding for that plays the collapse **twice**: measured
 * frame by frame, the body radius runs 140 → 23 at 577ms → back to 140 by 1376ms → and is already
 * down at 102 again by 1776ms. The second collapse has no cause a learner can name, so it reads as
 * the character glitching rather than reacting.
 *
 * 1500ms is one clean pass with a beat at full size on the end. Measured, not guessed, and
 * `character.test.ts` pins it inside one cycle so a future retiming cannot quietly restore the
 * double.
 *
 * 🔴 THIS IS WHY `passMs` IS NOT USED HERE, AND `passMs` IS STILL RIGHT FOR EVERYTHING ELSE: the
 * expressions are single held poses whose published duration IS one pass. `burst` is the first
 * scheduled thing that loops.
 */
export const BURST_MS = 1500;

/**
 * How long one pass of an engine animation takes, read from the catalogue.
 *
 * 🔴 ASKED, NOT WRITTEN DOWN. A hold typed in here would be a second copy of a duration that
 * already exists, and the two would part company the first time a timing was tuned — leaving
 * the character either cut off mid-gesture or standing still at the end of one.
 */
function passMs(id: string, fallback: number): number {
  const a = ANIMATION_BY_ID.get(id);
  return a ? animationDuration(a) : fallback;
}

/**
 * What a poke draws.
 *
 * 🔴 ONE ENTRY SINCE 2026-08-26, AND IT IS STILL A LIST. `turn` walks it, so restoring a second
 * reaction is adding a row rather than rebuilding the walk. See the note on the row itself.
 *
 * 🔴 THE MOTIONS HOLD `idle`, THEY DO NOT REPLACE IT. A hop, a waggle and a spin are things
 * done WHILE wearing an ordinary face; swapping the pose underneath would fight the gesture.
 * `wink` is the opposite case — entirely a face — and `sigma` is a face from OUR layer.
 */
const REACTIONS: readonly Reaction[] = [
  // 🔴🔴 ONE REACTION, AND THE LIST IS A LIST OF ONE (owner 2026-08-26: *"clicking on the mascot
  // should just make him jump or do burst animation"*, then *"or spin"*). The cycling is what he
  // was cutting: repeated clicks used to run jump → wink → surprised → laughing → curious, so the
  // answer to "what happens when I poke it" was five different things depending on how many times
  // you had poked it before.
  //
  // 🔴 BURST, AND IT IS A REVERSAL HE MADE HIMSELF, TWICE. `burst` is the vendored routine that
  // collapses the body to a sixth of its size, throws five sparks off it and pulls itself back
  // together. It was cut on 2026-08-23 (*"I don't want any rainbow swirls or animations from the
  // GitHub that we used"*) and again by the shape rule. Then, 2026-08-26: *"clicking on the mascot
  // should just make him jump or do burst animation"*, and, naming it in a list of what he wants
  // back: *"bloub has nice animations called burst, sleep, thinking, i want those"*. Asked for by
  // name twice in one evening beats a general rule written three days earlier.
  //
  // 🔴 AND IT DOES NOT ACTUALLY BREAK THE SHAPE RULE, WHICH IS WORTH KNOWING BEFORE SOMEBODY
  // "RESTORES" IT. `burstIn` carries `body({ scale })` and no `profile`, so the silhouette is
  // SCALED, not reshaped: a small squircle, not a ball. The rule is that the body does not become
  // a different shape, and it does not. `body.test.ts` checks exactly that and stays green.
  //
  // 🔴 THE SPIN GOES BACK IN THE DRAWER, NOT IN THE BIN. It was the click for a few hours this
  // evening and its smoothing (no wind-up, no overshoot, no scale, centred origin) is real work
  // that stays in `character.css`. One row is all it costs to put back.
  { state: "burst", motion: null, face: null, hold: BURST_MS },
];

export function usePoke(base: StateId): {
  state: StateId;
  motion: PokeMotion;
  face: FeatureFace | null;
  poke: () => void;
  poking: boolean;
} {
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const turn = useRef(0);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  // A busy state arriving mid-poke ends it — see the header.
  const busy = base !== "idle";
  useEffect(() => {
    if (busy && reaction) {
      clear();
      setReaction(null);
    }
  }, [busy, reaction]);

  useEffect(() => clear, []);

  const poke = useCallback(() => {
    if (base !== "idle") return;
    const next = REACTIONS[turn.current % REACTIONS.length]!;
    turn.current += 1;
    // 🔴 CLEARED FIRST, THEN SET, AND THE ORDER MATTERS FOR A REPEAT CLICK. Clicking again
    // mid-gesture must restart the NEW reaction's clock; leaving the old timer running would
    // end the new gesture early, on the remainder of the previous one.
    clear();
    setReaction(next);
    timer.current = window.setTimeout(() => setReaction(null), next.hold);
  }, [base]);

  return {
    state: reaction?.state ?? base,
    motion: reaction?.motion ?? null,
    face: reaction?.face ?? null,
    poke,
    poking: reaction !== null,
  };
}
