"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BloubBot } from "@/components/bloub/BloubBot";
import { WAGGLE_TIME } from "@/lib/character/brow";
import { BEATS, CYCLE, REST, keepsTheCircle } from "@/lib/character/circle";
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
 * ── THE BODY STAYS A CIRCLE, AND THAT IS THE OWNER REVERSING HIMSELF ──────────
 *
 * 🔴 OWNER, 2026-08-25: *"make it stay circle shaped only"*. This OVERRIDES the tile-by-tile
 * gallery sheet of 2026-08-24, where he kept nine animations including `egg` and `hexagon` —
 * two states whose whole content is that the body stops being a circle. The sheet was him
 * choosing from what he was shown; this is him watching it run on the page. The later
 * instruction wins, exactly as the sheet won over the circle rule before it.
 *
 * 🔴 SO DO NOT "RESTORE" THE NINE FROM GIT HISTORY OR FROM THE MEMORY NOTE. Both exist, both
 * are from the day before, and both are superseded. Adding a state back needs him to ask.
 *
 * WHAT "CIRCLE" MEANS IS CHECKABLE, AND `lib/character/circle.ts` CHECKS IT by reading the
 * vendored state table rather than carrying a second hand-written list beside this one. Run that
 * rule over all fifteen states and exactly three survive: `idle`, `wink`, `wide`.
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
  const breaks = CYCLE.filter((state) => !keepsTheCircle(state));
  if (breaks.length > 0) {
    throw new Error(
      `Mascot: ${breaks.join(", ")} does not keep the body a circle, and the owner asked for circle only.`,
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
  const [waggling, setWaggling] = useState(false);
  const timer = useRef<number | null>(null);

  const { state, face } = beatAt(step);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const hold =
      state === REST ? clampDuration(state, HOLD_SECONDS) : makeBlock(state).duration;
    timer.current = window.setTimeout(() => setStep((n) => n + 1), hold * 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [state, step]);

  /**
   * A poke raises the eyebrows twice.
   *
   * 🔴 IT REPLACES `burst`, WHICH THE CIRCLE RULE COST US. Burst was the right shape for a poke
   * — an event rather than a pose — but it works by collapsing the body and spraying particles,
   * which is exactly what the owner has now asked to stop.
   *
   * 🔴 A BROW IS THE ONE GESTURE THAT CANNOT BREAK THE CIRCLE, and that is measured rather than
   * assumed: `brow.ts` tuned its rest height and rise against a rendered contact strip
   * specifically because an earlier pair BREACHED the silhouette at the top of each lift and cut
   * a notch out of the crown. It is also drawn as another hole in the same mask as the eyes, so
   * it turns and foreshortens with the face instead of sitting on top of it.
   *
   * 🔴 AND IT RUNS OVER THE CYCLE RATHER THAN INTERRUPTING IT, which is why there is no longer a
   * `poked` branch holding the timer. The waggle is a gesture on the face; whatever beat is
   * playing keeps playing underneath, and nothing has to be resumed afterwards.
   */
  const onPoke = useCallback(() => {
    setWaggling(true);
    window.setTimeout(() => setWaggling(false), WAGGLE_TIME * 1000);
  }, []);

  return (
    <div className="mascot">
      <BloubBot
        state={state}
        expression={face}
        size={size}
        color={INK}
        track
        entrance
        waggle={waggling}
        onPoke={onPoke}
        label="Nemesis, the character. Click to poke it."
      />
    </div>
  );
}
