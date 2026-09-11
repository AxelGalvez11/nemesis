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
 *   laptop-intro.mp4    0 to 2.6s    the swing, played once
 *   laptop-loop.mp4     2.6 to 14.6s one cycle whose last frame leads straight back into its first
 *   laptop-loop-sm.mp4  the same cycle at 720px (638KB), for phones and narrow windows
 *   laptop.webp         the frame at 2.6s, which is both the intro's end and the loop's start
 *
 * 🔴 THE HANDOFF IS INVISIBLE BECAUSE BOTH FILES MEET ON THE SAME FRAME. The loop sits under the intro,
 * paused on its first frame, so the moment the intro ends there is already an identical picture
 * beneath it. Swapping only after `play()` resolves means the loop is moving before the intro goes.
 *
 * 🔴 THE LAPTOP MOVES AT EVERY SIZE. Owner, 2026-09-11: "sign in page does not animate the computer". Under 821px
 * the panel used to show only the resting frame, and a phone is where he looked. A phone now plays the 720px loop
 * (no intro); a wide window plays the full film. Only reduced motion gets the still.
 *
 * 🔴 PLAY IS ASKED FOR, NOT WAITED FOR. The intro used to start on `canplaythrough`, which some browsers never fire
 * for a muted inline video until it is already playing, so the 2.5s fallback left those visitors on the still. And
 * when autoplay is refused (Low Power Mode, a browser setting), the first touch or key press is permission, so the
 * film tries again then instead of staying still for the whole visit.
 */
const INTRO = "/sign-in/laptop-intro.mp4";
const LOOP = "/sign-in/laptop-loop.mp4";
export const LOOP_SMALL = "/sign-in/laptop-loop-sm.mp4";
const STILL = "/sign-in/laptop.webp";
/** Keep in step with the `min-width` at which auth.css puts the panel beside the column. */
export const LAPTOP_PANEL_QUERY = "(min-width: 821px)";
const CALM_QUERY = "(prefers-reduced-motion: reduce)";
const GESTURES = ["pointerdown", "touchstart", "keydown"] as const;

type Phase = "wait" | "intro" | "loop" | "still";

const noSubscribe = () => () => {};

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
  // No <video> during hydration: the server cannot know the window, and a guess would start the wrong download.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const introRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("wait");

  useEffect(() => {
    const intro = introRef.current;
    const loop = loopRef.current;
    if (!hydrated || calm || !loop) return;
    let alive = true;
    let looping = false;
    let dropRetry = () => {};

    const retryOnGesture = (start: () => void) => {
      const again = () => {
        remove();
        start();
      };
      const remove = () => {
        for (const g of GESTURES) window.removeEventListener(g, again);
      };
      for (const g of GESTURES) window.addEventListener(g, again, { passive: true });
      return remove;
    };
    const playLoop = () => {
      loop.play().then(
        () => {
          if (!alive) return;
          looping = true;
          setPhase("loop");
        },
        () => {
          if (!alive) return;
          setPhase("still");
          dropRetry();
          dropRetry = retryOnGesture(playLoop);
        },
      );
    };

    if (!shown || !intro) {
      loop.load();
      playLoop();
      return () => {
        alive = false;
        dropRetry();
        loop.pause();
      };
    }

    // A slow connection should not hold an empty panel: show the resting frame, and let the loop take over.
    const late = window.setTimeout(() => {
      if (!alive || !intro.paused) return;
      setPhase("still");
      playLoop();
    }, 2500);
    intro.addEventListener("ended", playLoop, { once: true });
    intro.load();
    loop.load();
    intro.play().then(
      () => {
        if (!alive) return;
        window.clearTimeout(late);
        // The loop already took over while the intro was still buffering: a swing now would replay the entrance.
        if (looping) intro.pause();
        else setPhase("intro");
      },
      () => {
        if (!alive) return;
        window.clearTimeout(late);
        setPhase("still");
        playLoop();
      },
    );
    return () => {
      alive = false;
      window.clearTimeout(late);
      dropRetry();
      intro.removeEventListener("ended", playLoop);
      intro.pause();
      loop.pause();
    };
  }, [hydrated, shown, calm]);

  if (!hydrated || calm) {
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
      <video
        key={shown ? "wide" : "small"}
        ref={loopRef}
        className="nemesis-auth-loop"
        src={shown ? LOOP : LOOP_SMALL}
        muted
        loop
        playsInline
        preload="auto"
      />
      {shown ? <video ref={introRef} className="nemesis-auth-intro" src={INTRO} muted playsInline preload="auto" /> : null}
    </div>
  );
}
