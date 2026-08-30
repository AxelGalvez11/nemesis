"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BloubBot } from "@/components/bloub/BloubBot";
import { BEATS, CYCLE, REST, SHAPE, keepsItsShape } from "@/lib/character/body";
import { BURST_PACE, BURST_TIME, POKE } from "@/lib/character/poke";
import { SPIN_TIME } from "@/lib/character/spin";
import { clampDuration, makeBlock } from "@/lib/bloub/cycles";
import type { StateId } from "@/lib/bloub/states";

/**
 * The character, running its own animation cycle.
 *
 * ── WHERE THE ENGINE CAME FROM ────────────────────────────────────────────────
 *
 * `lib/bloub/*` is jeremy-prt/bloub (MIT, LICENSE kept beside it), which is itself an
 * SVG recreation of the x.ai bot. It is already vendored in `packages/shared` and
 * already rendered by the app and the phone. This site cannot reach either: it has
 * its own pnpm-workspace.yaml, its Turbopack root is pinned to this folder, and
 * Vercel deploys `landing/` alone, so anything outside it is not even uploaded. The
 * engine is therefore COPIED here rather than imported, and it is copied unedited so
 * the three renderers stay in agreement about what a frame means.
 *
 * ── THE BODY IS A SQUIRCLE AND NEVER CHANGES SHAPE ON ITS OWN ─────────────────
 *
 * Two instructions, a day apart, and the second is easy to misread as cancelling the first:
 *
 * 🔴 OWNER, 2026-08-25: *"make it stay circle shaped only"*. This OVERRODE the tile-by-tile
 * gallery sheet of 2026-08-24, where he kept nine animations including `egg` and `hexagon` —
 * two states whose whole content is that the body stops being a circle. The sheet was him
 * choosing from what he was shown; this was him watching it run on the page.
 *
 * 🔴 OWNER, 2026-08-26: *"could you make the character, the mascot, a cube? instead of the
 * circle?"*, resolved to *"use squircle like in the github repo for bloub"* and applied to this
 * site as well as the app. That changes the shape the body RESTS in. It does not re-open the
 * nine: what he objected to on the 25th was the body morphing while it played, and all six of
 * the states cut that day still do exactly that.
 *
 * 🔴 SO DO NOT "RESTORE" THE NINE FROM GIT HISTORY OR FROM THE MEMORY NOTE. Both exist and both
 * are superseded. Adding a state back needs him to ask.
 *
 * THE RULE IS CHECKABLE, AND `lib/character/body.ts` CHECKS IT by reading the vendored state
 * table rather than carrying a second hand-written list beside this one. Run that rule over all
 * fifteen states and exactly three survive: `idle`, `wink`, `wide`.
 *
 * 🔴 AND ON 2026-08-30 THE OWNER OPENED A SECOND DOOR BESIDE THE CYCLE, for one state, reached
 * only by clicking: *"yes, the mascot bursts"*. That is a scoping of the rule, not a repeal of
 * it — what he objected to was the body reshaping unprompted while he watched, and a click is
 * not unprompted. The cycle below is still checked and still refuses all six. `lib/character/
 * poke.ts` owns the exception and says why it is one; do not resolve the tension by moving
 * `burst` into `BEATS`, which would delete the distinction that makes it allowed.
 *
 * That is not as thin as it sounds, because the VARIETY ON THIS PAGE WAS NEVER IN THE
 * ANIMATIONS — it is in the sixteen resting faces, all of which he kept, and all of which are
 * still here.
 *
 * ── THE RHYTHM: REST, BEAT, REST, BEAT ────────────────────────────────────────
 *
 * The cycle alternates rather than running the list end to end. Between every animation it
 * returns to `idle` and wears a different face.
 *
 * That structure is also the only way the expressions are visible at all: the vendored
 * `expression` prop is resolved through the RESTING face, so it changes nothing during a beat.
 * With a flat list of animations, all sixteen faces would be dead code.
 *
 * Rests are long and beats are short. A rest holds `HOLD_SECONDS`, which the owner set by feel
 * after 2.8s read as "moving between animations a little bit too quickly"; a beat holds the
 * duration `makeBlock` reports, which is the length that state was measured at in the original
 * video.
 */

/**
 * All sixteen resting faces, in the gallery's own reading order. None were crossed out, and
 * none are affected by the circle rule: an expression moves the eyes, never the body.
 *
 * The ids are French because the vendored table is French, and renaming them here would mean
 * editing a vendored file — see the note about copying it unedited.
 */
const FACES: readonly string[] = [
  "neutre", // Neutral
  "attentif", // Attentive
  "surpris", // Surprised
  "excite", // Excited
  "heureux", // Happy
  "hilare", // Laughing
  "colere", // Angry
  "triste", // Sad
  "effraye", // Scared
  "mefiant", // Suspicious
  "confus", // Confused
  "curieux", // Curious
  "fier", // Proud
  "timide", // Shy
  "blase", // Unimpressed
  "somnolent", // Sleepy
];

/** How long the character rests between beats. Owner's pacing, not a default. */
const HOLD_SECONDS = 6;

/**
 * 🔴 A GUARD, NOT DECORATION. `circle.test.ts` is the durable check, but the landing app's tests
 * are not in CI today — so this is what actually stops a reshaping state, by breaking the page in
 * `next dev` the moment one is added. Unlike the hand-written cut list it replaces, it cannot
 * itself be wrong about which states reshape: it reads the same table they come from.
 */
if (process.env.NODE_ENV !== "production") {
  const breaks = CYCLE.filter((state) => !keepsItsShape(state));
  if (breaks.length > 0) {
    throw new Error(
      `Mascot: ${breaks.join(", ")} changes the body's shape, and the owner asked for one shape only.`,
    );
  }
}

/**
 * What the body is painted with, in both themes.
 *
 * 🔴 A DELIBERATE DIFFERENCE FROM THE APP, NOT AN OVERSIGHT. Inside the product the body takes
 * `--ui-action`, which is green, and that is right: it is a live control among other controls.
 * This page is black, white and one colour wash, and dropping a green object into it introduces
 * a hue nothing else on the site uses.
 *
 * 🔴 ONE VALUE, BOTH THEMES (owner, 2026-08-25: *"make darkmode mascot stay black"*). This is
 * the third answer to the same question and the last two are both in the history, so the shape
 * of the argument matters more than the value:
 *
 *   near-white   inverted with the theme. Sitting inside the bright centre of the hero bloom it
 *                became a large glaring disc with no edge — owner: "darkmode mascot does not
 *                look good". Cut.
 *   grey `#a3a3a3`  the vendored `gris` skin, chosen because a mid value holds its edge on both
 *                the bloom AND bare page. That mattered while the character also stood on bare
 *                page in `Built on evidence`. It no longer does: that band lost the character on
 *                the same day, so the ONLY ground it ever sits on is the bloom, which is light
 *                in both themes. Grey was solving a problem the page no longer has.
 *   ink          what it is. The bloom lights it in either theme, and it matches the hero
 *                wordmark instead of sitting a shade off it.
 *
 * 🔴 THE EYES ARE NOT THIS COLOUR AND MUST NOT FOLLOW IT. They are holes cut through the body,
 * backed by `--bloub-paper`, which stays `#f9f9f9` here because this site never sets
 * `data-theme` (it has no theme switch; it follows the OS). Ink body plus paper eyes is what
 * keeps a face on a dark page. If a future change makes the paper token follow the OS theme,
 * this becomes a black disc with no face.
 */
const INK = "#0E1116";

/**
 * Where the cycle is up to, as one number.
 *
 * Even steps rest and odd steps beat, so step `n` resolves without any stored pairing between
 * the two lists. The two run at different lengths on purpose — sixteen faces against two beats —
 * so the pair only repeats after thirty-two steps, several minutes in. Nobody watches that long,
 * which is the point: any two visits to the top of the page see a different pair.
 */
function beatAt(step: number): { state: StateId; face: string } {
  if (step % 2 === 0) {
    return { state: REST, face: FACES[(step / 2) % FACES.length]! };
  }
  return { state: BEATS[((step - 1) / 2) % BEATS.length]!, face: "neutre" };
}

export function Mascot({ size = 168 }: { size?: number }) {
  const [step, setStep] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [bursting, setBursting] = useState(false);
  const timer = useRef<number | null>(null);

  const { state, face } = beatAt(step);
  /**
   * What is actually on screen: the cycle's own state, unless a poke is overriding it.
   *
   * 🔴 THE CYCLE IS NOT RE-POINTED, IT IS COVERED. `state` and `step` keep advancing underneath —
   * or rather keep being held, since the effect below pauses for the gesture — so when the burst
   * ends the character returns to exactly the face and beat it was on. A poke is an interruption,
   * not a jump to somewhere new in the rotation.
   */
  const shown = bursting ? POKE : state;

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // 🔴 HELD FOR THE TURN, AND NOW FOR A SECOND REASON. The first was that the cycle must not
    // step out from under a gesture and land somewhere else the moment it ends. The second is that
    // `BloubBot` steers a resting face and merely offsets a beat, so a state change MID-turn would
    // swap between those two treatments and jump the gaze. Holding whatever he is wearing keeps
    // one treatment for the whole revolution — and holding is safe because both beats are static
    // poses, so a held wink is simply a wink.
    //
    // 🔴 BOTH GESTURES ARE NAMED, EVEN THOUGH THE TURN OUTLASTS THE BURST TODAY. Leaning on that
    // would make this line quietly wrong the first time either duration is tuned, and the way it
    // would fail — the cycle stepping out from under a half-exploded body — is not something a
    // test catches by accident. `poke.test.ts` pins the ordering as well; this does not rely on it.
    if (spinning || bursting) return;

    const hold =
      state === REST ? clampDuration(state, HOLD_SECONDS) : makeBlock(state).duration;
    timer.current = window.setTimeout(() => setStep((n) => n + 1), hold * 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [bursting, spinning, state, step]);

  /**
   * A poke bursts him apart and turns him all the way round, twice, from the same frame.
   *
   * 🔴 THE REPLY TO A CLICK HAS NOW BEEN FOUR THINGS, AND THE FOURTH IS THE FIRST ONE BACK.
   * `burst` was the original, and the shape rule of 2026-08-25 cost us it; a brow waggle replaced
   * it and lasted a morning (*"make him just spin around smoothly, remove the eye waggle"*); the
   * turn replaced that. On 2026-08-30 the owner asked for the burst back — *"yes, the mascot
   * bursts"* — WITHOUT asking for the turn to go, so both run. `lib/character/poke.ts` carries the
   * exception to the shape rule that lets the first one back in.
   *
   * 🔴 THEY START TOGETHER AND ARE NOT CHAINED, which is the specific thing he warned against:
   * *"when you click on the mascot it's going to lag before it actually does the burst"*. A burst
   * queued behind a 2.4s turn would be exactly that. The burst also plays faster than its measured
   * pace, so it finishes first and the character is whole again with the last of the turn to run.
   *
   * 🔴 THE TURN NEEDS NOTHING NEW, AND THAT IS STILL WHY IT SURVIVED THE SHAPE RULE. It is the
   * arrival's own gaze sweep replayed: the eyes travel a full circuit of the sphere and land
   * exactly where they started, and the silhouette is never involved. `lib/character/spin.ts` owns
   * the pacing and says why the curve is not the arrival's.
   *
   * 🔴 IT TURNS TWICE, AND IN WHATEVER FACE HE IS WEARING (owner, 2026-08-26: *"actually just make
   * him double spin"*, and *"the spin should work regardless of its expression state"*). The turn
   * used to force him back to `idle`, because only resting faces can be steered — `release` in
   * `BloubBot` now carries the offset too, so a click during a wink turns the wink.
   *
   * The brow machinery stays in `BloubBot` and `brow.ts` — it is NOT dead code left lying about.
   * The app's own character still waggles (`apps/web/components/bloub/use-poke.ts`), and the two
   * renderers are kept in step on purpose. What changed is only what this page asks for.
   */
  const onPoke = useCallback(() => {
    setSpinning(true);
    window.setTimeout(() => setSpinning(false), SPIN_TIME * 1000);
    // 🔴 THE BURST IS THE ONE GESTURE HERE THAT REDUCED MOTION SHOULD REFUSE, and the turn is not.
    // A setting that means "do not throw large moving objects at me" is aimed squarely at a body
    // that collapses and sprays particles; a gaze crossing a face is the sort of small, contained
    // movement it exists to leave alone. So a click still turns him, and simply does not blow him
    // apart — which is also why this guard is here and not around the whole handler.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setBursting(true);
    window.setTimeout(() => setBursting(false), BURST_TIME * 1000);
  }, []);

  return (
    <div className="mascot">
      {/* 🔴 `shape` IS THE RESTING SILHOUETTE, AND THE APP DRAWS THE SAME ONE FROM THE SAME
          UPSTREAM TABLE. See `lib/character/body.ts` for the id and why it is not a literal
          here: a string typed in place would be a fourth copy that nothing can check. */}
      <BloubBot
        state={shown}
        expression={face}
        size={size}
        color={INK}
        shape={SHAPE}
        track
        entrance
        spin={spinning}
        pace={bursting ? BURST_PACE : 1}
        onPoke={onPoke}
        label="Nemesis, the character. Click to poke it."
      />
    </div>
  );
}
