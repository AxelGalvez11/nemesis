"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * The laptop in the sign-in panel: a rendered MacBook running a Nemesis space.
 *
 * Owner, 2026-09-10: "look exactly like Sana ... with the moving computer", "make it live", and of
 * Adobe's Student Spaces: "i love this design". The film is a HyperFrames composition
 * (~/Desktop/nemesis-signin/index.html): the registry's GLTF MacBook swings in on Sana's curve,
 * cubic-bezier(0.16, 1, 0.3, 1), then a Student-Spaces-shaped workspace makes a deck while the
 * machine drifts. Rendered at 60fps and cut in two:
 *
 *   laptop-intro.mp4  0 to 2.6s   the swing, played once
 *   laptop-loop.mp4   2.6 to 14.6s one cycle whose last frame leads straight back into its first
 *   laptop.webp       the frame at 2.6s, which is both the intro's end and the loop's start
 *
 * 🔴 THE HANDOFF IS INVISIBLE BECAUSE BOTH FILES MEET ON THE SAME FRAME. The loop sits under the intro,
 * paused on its first frame, so the moment the intro ends there is already an identical picture
 * beneath it. Swapping only after `play()` resolves means the loop is moving before the intro goes.
 *
 * 🔴 NOTHING IS FETCHED WHERE THE PANEL IS HIDDEN. auth.css hides the panel below 1080px, and a phone
 * signing in on a data plan must not download 4MB of laptop it cannot see.
 */
const INTRO = "/sign-in/laptop-intro.mp4";
const LOOP = "/sign-in/laptop-loop.mp4";
const STILL = "/sign-in/laptop.webp";
/** Keep in step with the `min-width` that shows `.nemesis-auth-field` in auth.css. */
export const LAPTOP_PANEL_QUERY = "(min-width: 1080px)";
const CALM_QUERY = "(prefers-reduced-motion: reduce)";

type Phase = "wait" | "intro" | "loop" | "still";

function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

export function AuthLaptop() {
  const shown = useMedia(LAPTOP_PANEL_QUERY);
  const calm = useMedia(CALM_QUERY);
  const introRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("wait");

  useEffect(() => {
    const intro = introRef.current;
    const loop = loopRef.current;
    if (!shown || calm || !intro || !loop) return;
    let alive = true;

    const playLoop = () => {
      loop.play().then(
        () => { if (alive) setPhase("loop"); },
        () => { if (alive) setPhase("still"); },
      );
    };
    const startIntro = () => {
      window.clearTimeout(late);
      intro.play().then(
        () => { if (alive) setPhase("intro"); },
        () => { if (alive) { setPhase("still"); playLoop(); } },
      );
    };
    // A slow connection should not hold an empty panel: show the resting frame, and let the loop take
    // over whenever it can play.
    const late = window.setTimeout(() => {
      if (!alive || !intro.paused) return;
      intro.removeEventListener("canplaythrough", startIntro);
      setPhase("still");
      playLoop();
    }, 2500);

    intro.addEventListener("canplaythrough", startIntro, { once: true });
    intro.addEventListener("ended", playLoop, { once: true });
    intro.load();
    loop.load();
    return () => {
      alive = false;
      window.clearTimeout(late);
      intro.removeEventListener("canplaythrough", startIntro);
      intro.removeEventListener("ended", playLoop);
      intro.pause();
      loop.pause();
    };
  }, [shown, calm]);

  if (!shown) return <div className="nemesis-auth-art" data-phase="wait" />;
  if (calm) {
    return (
      <div className="nemesis-auth-art" data-phase="still">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="nemesis-auth-still" src={STILL} alt="" decoding="async" />
      </div>
    );
  }
  return (
    <div className="nemesis-auth-art" data-phase={phase}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="nemesis-auth-still" src={STILL} alt="" decoding="async" />
      <video ref={loopRef} className="nemesis-auth-loop" src={LOOP} muted loop playsInline preload="auto" />
      <video ref={introRef} className="nemesis-auth-intro" src={INTRO} muted playsInline preload="auto" />
    </div>
  );
}
