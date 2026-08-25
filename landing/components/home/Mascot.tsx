"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { NemesisAvatar } from "@/components/character/NemesisAvatar";
import { ACCENT_COLORS, accentFill } from "@/lib/accent";
import { ANIMATION_BY_ID, animationDuration } from "@/lib/avatar";

/**
 * The character, running its own cycle.
 *
 * ── ONE LANGUAGE, EVERYWHERE ──────────────────────────────────────────────────
 *
 * 🔴 THIS PLAYS THE SAME ANIMATIONS THE APP PLAYS (owner 2026-08-25: "the animations
 * should be uniform language"). The site used to run `lib/bloub` — a different engine with
 * a different vocabulary — so the character on the front page and the character inside the
 * product were two creatures that happened to look alike. `lib/avatar` is the one engine
 * now, copied here for the same reason bloub was: this site has its own workspace and
 * Vercel deploys it alone, so it cannot import from the app.
 *
 * ── WHAT IT PLAYS, AND WHO CHOSE IT ───────────────────────────────────────────
 *
 * 🔴 THE LIST BELOW IS THE OWNER'S, MARKED UP ON THE BLOUB GALLERY ITSELF (2026-08-24).
 * He went through the sheet tile by tile and left all sixteen resting FACES unmarked while
 * crossing out five of the animations. Those sixteen are what this list is: the same
 * sixteen moods, in his reading order, now that each one is a full animation instead of a
 * still face. Nothing was added and nothing was dropped.
 *
 * The five he crossed out — `alert`, `exclaim`, `play`, `orbit`, `comet` — plus `swirl`
 * and `burst`, which he named separately ("I don't want any rainbow swirls or animations
 * from the GitHub that we used"), were all decor: rings, particles, badges and bar shapes
 * bolted onto the body. That whole class is gone rather than curated: every animation in
 * this engine is a face on a body, so there is nothing left to cross out.
 *
 * ── THE RHYTHM: REST, BEAT, REST, BEAT ────────────────────────────────────────
 *
 * Unchanged, and it is the owner's pacing. The cycle alternates rather than running the
 * list end to end, because a character that goes from thinking straight into surprised
 * into laughing is a demo reel, not a character. Between every mood it returns to `idle`.
 * A rest holds `HOLD_SECONDS`, which he set by feel after 2.8s read as "moving between
 * animations a little bit too quickly".
 */

/** The sixteen the owner kept, in the gallery's reading order. */
const MOODS: readonly string[] = [
  "idle", // Neutral
  "listening", // Attentive
  "surprised", // Surprised
  "excited", // Excited
  "happy", // Happy
  "laughing", // Laughing
  "angry", // Angry
  "sad", // Sad
  "scared", // Scared
  "suspicious", // Suspicious
  "confused", // Confused
  "curious", // Curious
  "proud", // Proud
  "shy", // Shy
  "bored", // Unimpressed
  "drowsy", // Sleepy
];

/** What it returns to between moods. */
const REST = "idle";

/** How long the character rests between beats. Owner's pacing, not a default. */
const HOLD_SECONDS = 6;

/**
 * 🔴 A GUARD, NOT DECORATION. Every regression on this component has been a cut animation
 * finding its way back into the list, and each time it was spotted on screen by the owner
 * rather than here. A name that is not in the engine is a typo that would silently play
 * nothing, and it should stop the page in development rather than ship a blank.
 */
if (process.env.NODE_ENV !== "production") {
  const missing = [REST, ...MOODS].filter((id) => !ANIMATION_BY_ID.has(id));
  if (missing.length > 0) {
    throw new Error(`Mascot: no such animation — ${missing.join(", ")}`);
  }
}

/**
 * What the body is painted with.
 *
 * 🔴 THE PALETTE'S OWN VALUES, NOT LOCAL CONSTANTS. `black` and `grey` are two of the
 * twelve accents (lib/accent.ts, copied from the app for the same reason the engine is), so
 * the site and the product cannot drift apart on what those colours are. Dark mode is the
 * grey (owner, 2026-08-24: "for dark mode could you just use the gray bloub skin?") — it is
 * mid-value, so it holds its edge against the hero's bright bloom AND against bare page,
 * which is why the `tone` prop this used to carry is gone: both callers want one colour.
 */
const BODY = {
  light: accentFill(ACCENT_COLORS.black, false),
  dark: "#a3a3a3",
} as const;

/** The eyes are cut out of the page, not painted on. */
const EYE = { light: "#ffffff", dark: "#0E1116" } as const;

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
 * between the two. Sixteen moods against a single rest means the sequence takes
 * thirty-two steps to come round, roughly four minutes. Nobody watches that long, which is
 * the point: any two visits to the top of the page see a different mood.
 */
function beatAt(step: number): string {
  return step % 2 === 0 ? REST : MOODS[((step - 1) / 2) % MOODS.length]!;
}

/** Seconds a step is held for. A rest is the owner's pacing; a beat is its own length. */
function holdOf(animation: string): number {
  if (animation === REST) return HOLD_SECONDS;
  const anim = ANIMATION_BY_ID.get(animation);
  return anim ? animationDuration(anim) / 1000 : HOLD_SECONDS;
}

export function Mascot({ size = 168 }: { size?: number }) {
  const [step, setStep] = useState(0);
  const timer = useRef<number | null>(null);
  const theme = useOsTheme();

  const shown = beatAt(step);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    timer.current = window.setTimeout(() => setStep((n) => n + 1), holdOf(shown) * 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [shown, step]);

  // 🔴 THE POKE IS THE COMPONENT'S, NOT THIS FILE'S, AND THE CYCLE DOES NOT MOVE FOR IT.
  // `NemesisAvatar` plays the reaction over whatever is current and returns by itself, so
  // the step underneath is untouched — poking no longer restarts the mood it interrupted,
  // which is what the old `burst` overlay did.
  const onPoke = useCallback(() => {}, []);

  return (
    <div className="mascot">
      <NemesisAvatar
        animation={shown}
        ink={BODY[theme]}
        eye={EYE[theme]}
        size={size}
        track
        onPoke={onPoke}
        pokeAnimation="surprised"
        label="Nemesis, the character. Click to poke it."
      />
    </div>
  );
}
