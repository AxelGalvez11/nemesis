"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BloubBot } from "@/components/bloub/BloubBot";
import { clampDuration } from "@/lib/bloub/cycles";
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
 * ── THE THREE STATES THIS PLAYS, AND WHY IT IS ONLY THREE ─────────────────────
 *
 * The owner's rule is that the body STAYS A CIRCLE. That is a much sharper filter
 * than the list of animation names it started as, and it is checkable: a state in
 * `states.ts` breaks the circle if it sets `sil` (its own silhouette), `dots` or
 * `arcs` (decor thrown around the body) or `notif` (a badge). Run that over all
 * fifteen and exactly three survive:
 *
 *     idle · wink · wide
 *
 * Everything else reshapes or emits. `hexagon` and `egg` are literally other shapes.
 * `sleep` squashes the silhouette. `thinking` breaks the body into three separate
 * dots. `play` and `swirl` ring it with arcs. `burst` and `comet` both spray dots,
 * which is why cutting `comet` alone did not stop the owner seeing a comet.
 *
 * So the character is a circle that looks at you, blinks and widens its eyes, and
 * never changes shape. That is also what x.ai's bot does for most of its life, and
 * the reference the owner gave.
 *
 * 🔴 DO NOT "ENRICH" THIS LIST WITHOUT RE-RUNNING THAT CHECK. Every state that has
 * ever been added back here was added because the list looked short, and every one
 * of them broke the circle.
 */

/** Owner's cut: orbit, comet, alert, exclaim. Mine: notify (see above). */
const CYCLE: readonly StateId[] = ["idle", "wink", "wide"];

/** Long enough to read as a pose, short enough that the loop is not a screensaver. */
const HOLD_SECONDS = 2.8;

/**
 * The character is INK, not the app's green.
 *
 * 🔴 A DELIBERATE DIFFERENCE FROM THE APP, NOT AN OVERSIGHT. Inside the product the
 * body takes `--ui-action`, which is green, and that is right: it is a live control
 * among other controls. This page is black, white and one blue wash, and dropping a
 * green object into it introduces a third colour nothing else on the site uses. Ink
 * also happens to be what x.ai's bot does, which is the reference the owner gave.
 *
 * 🔴 AND THE RIGHT INK DEPENDS ON WHAT IS BEHIND IT, WHICH IS WHY `tone` EXISTS.
 * Inverting with the theme everywhere is the obvious rule and it is wrong in the
 * hero: there the character sits inside the bright centre of the bloom, so in dark
 * mode a near-white body became a large glaring disc with no edge (owner: "darkmode
 * mascot does not look good"). Over the bloom the ground is LIGHT in both themes, so
 * the body stays dark in both. The close has no art behind it at all, just page, so
 * there the body has to invert or it vanishes into black.
 *
 *   tone="lit"   over the hero bloom: dark in both themes
 *   tone="page"  on bare page: dark on white, light on black
 */
const BODY = {
  lit: { light: "#0E1116", dark: "#0E1116" },
  page: { light: "#0E1116", dark: "#F2F4F7" },
} as const;

export type MascotTone = keyof typeof BODY;

/** The page follows the OS; there is no theme switch on this site. */
function useOsTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return theme;
}

export function Mascot({ size = 168, tone = "page" }: { size?: number; tone?: MascotTone }) {
  const [index, setIndex] = useState(0);
  const [poked, setPoked] = useState(false);
  const timer = useRef<number | null>(null);
  const theme = useOsTheme();

  const state: StateId = poked ? "wink" : (CYCLE[index] ?? "idle");

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (poked) return;

    const hold = clampDuration(state, HOLD_SECONDS) * 1000;
    timer.current = window.setTimeout(() => setIndex((i) => (i + 1) % CYCLE.length), hold);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [index, poked, state]);

  // A poke interrupts the cycle for one beat and then hands it back. It cannot be a
  // state the cycle never plays — only three keep the body a circle and all three are
  // in the cycle — so what makes a click read as a response is the INTERRUPTION: the
  // wink arrives immediately instead of whenever the timer would next have reached it.
  const onPoke = useCallback(() => {
    setPoked(true);
    window.setTimeout(() => setPoked(false), 1400);
  }, []);

  return (
    <div className="mascot">
      <BloubBot
        state={state}
        size={size}
        color={BODY[tone][theme]}
        track
        entrance
        onPoke={onPoke}
        label="Nemesis, the character. Click to poke it."
      />
    </div>
  );
}
