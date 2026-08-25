"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BloubBot } from "@/components/bloub/BloubBot";
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
 * ── WHAT IT PLAYS, AND WHO CHOSE IT ───────────────────────────────────────────
 *
 * 🔴 THE LISTS BELOW ARE THE OWNER'S, MARKED UP ON THE BLOUB GALLERY ITSELF
 * (2026-08-24). He sent both panels with a red X on every tile he did not want, so
 * these are not a judgement call and they are not to be "tidied" — a state that is
 * in the list is in because he put it there, and a state that is out is out for the
 * same reason.
 *
 * This REPLACES the earlier rule that the body must stay a perfect circle. That rule
 * came from an earlier round where the swirl and comet decor bothered him, and he has
 * now been through the whole gallery tile by tile: `egg` and `hexagon` reshape the
 * body and are both explicitly kept. Do not re-derive the circle rule from the older
 * comments in git history — this sheet is later and it is more specific.
 *
 * ── THE RHYTHM: REST, BEAT, REST, BEAT ────────────────────────────────────────
 *
 * The cycle alternates rather than running the list end to end, because a character
 * that goes from thinking straight into a hexagon into a burst is a demo reel, not a
 * character. Between every animation it returns to `idle` and wears a different face.
 *
 * That structure also happens to be the only way the expressions are visible at all:
 * the vendored `expression` prop is resolved through the RESTING face, so it changes
 * nothing during `wink`, `notify`, `egg` and the rest — those carry their own. With a
 * flat list of animations, all sixteen faces would be dead code.
 *
 * Rests are long and beats are short. A rest holds `HOLD_SECONDS`, which the owner
 * set by feel after 2.8s read as "moving between animations a little bit too
 * quickly"; a beat holds the duration `makeBlock` reports, which is the length that
 * state was measured at in the original video. So `hexagon` gets 1.6s and `sleep`
 * gets 2.4s, and neither overstays.
 */

/** Kept: the nine tiles the owner left unmarked, minus nothing. */
const BEATS: readonly StateId[] = [
  "thinking",
  "wink",
  "wide",
  "notify",
  "sleep",
  "egg",
  "hexagon",
  "burst",
];

/**
 * Crossed out in red on the sheet: `alert`, `exclaim`, `play`, `orbit`, `comet`.
 * `swirl` is not on the sheet at all — the gallery does not show it — but he named it
 * directly in an earlier round ("still doing the swirl and comet animations"), so it
 * stays out too. Adding any of these back needs him to say so.
 */
const CUT: readonly StateId[] = ["alert", "exclaim", "play", "orbit", "swirl", "comet"];

/**
 * All sixteen resting faces, in the gallery's own reading order. None were crossed
 * out. The ids are French because the vendored table is French, and renaming them
 * here would mean editing a vendored file — see the note about copying it unedited.
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
 * 🔴 A GUARD, NOT DECORATION. Every regression on this component has been a cut state
 * finding its way back into the list, and each time it was spotted on screen by the
 * owner rather than here. An overlap is a mistake in the lists above, and it should
 * stop the page in development rather than ship a comet.
 */
if (process.env.NODE_ENV !== "production") {
  const smuggled = BEATS.filter((state) => CUT.includes(state));
  if (smuggled.length > 0) {
    throw new Error(`Mascot: the owner cut ${smuggled.join(", ")} — remove it from BEATS.`);
  }
}

/**
 * What the body is painted with.
 *
 * 🔴 A DELIBERATE DIFFERENCE FROM THE APP, NOT AN OVERSIGHT. Inside the product the
 * body takes `--ui-action`, which is green, and that is right: it is a live control
 * among other controls. This page is black, white and one colour wash, and dropping a
 * green object into it introduces a hue nothing else on the site uses.
 *
 * 🔴 DARK MODE IS THE VENDORED GREY SKIN (owner, 2026-08-24: "for dark mode could you
 * just use the gray bloub skin?"). `#a3a3a3` is `gris` in `lib/bloub/skins.ts`, copied
 * from there rather than guessed, so the site and the palette cannot drift apart.
 *
 * That one value also retired the `tone` prop this used to carry. `tone` existed
 * because inverting straight to near-white made the body a glaring, edgeless disc
 * where it sat inside the bright centre of the hero bloom (owner: "darkmode mascot
 * does not look good") — so the hero had to opt out of inverting while the rest of the
 * page opted in. Grey is mid-value: it holds its edge against the bloom AND against
 * bare page, so both callers want the same colour and there is nothing left to choose.
 * If a future ground breaks that, bring the prop back rather than special-casing here.
 */
const BODY = { light: "#0E1116", dark: "#a3a3a3" } as const;

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

/**
 * Where the cycle is up to, as one number.
 *
 * Even steps rest and odd steps beat, so step `n` resolves without any stored pairing
 * between the two lists. The two run at different lengths on purpose — sixteen faces
 * against eight animations — so the combination only repeats after thirty-two steps,
 * roughly four minutes. Nobody watches that long, which is the point: any two visits
 * to the top of the page see a different pair.
 */
function beatAt(step: number): { state: StateId; face: string } {
  if (step % 2 === 0) {
    return { state: "idle", face: FACES[(step / 2) % FACES.length]! };
  }
  return { state: BEATS[((step - 1) / 2) % BEATS.length]!, face: "neutre" };
}

export function Mascot({ size = 168 }: { size?: number }) {
  const [step, setStep] = useState(0);
  const [poked, setPoked] = useState(false);
  const timer = useRef<number | null>(null);
  const theme = useOsTheme();

  const { state, face } = beatAt(step);
  // A poke outranks the cycle without disturbing it: the burst plays over whatever
  // step is current, and when it clears, that step resumes rather than restarting.
  const shown: StateId = poked ? "burst" : state;

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (poked) return;

    const hold =
      state === "idle" ? clampDuration(state, HOLD_SECONDS) : makeBlock(state).duration;
    timer.current = window.setTimeout(() => setStep((n) => n + 1), hold * 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [poked, state, step]);

  // `burst` is the one the owner ringed rather than crossed out, and it is the right
  // shape for this: it is an event, not a pose, so it reads as a reaction to the
  // click instead of the cycle having quietly moved on.
  const onPoke = useCallback(() => {
    setPoked(true);
    window.setTimeout(() => setPoked(false), makeBlock("burst").duration * 1000);
  }, []);

  return (
    <div className="mascot">
      <BloubBot
        state={shown}
        expression={face}
        size={size}
        color={BODY[theme]}
        track
        entrance
        onPoke={onPoke}
        label="Nemesis, the character. Click to poke it."
      />
    </div>
  );
}
