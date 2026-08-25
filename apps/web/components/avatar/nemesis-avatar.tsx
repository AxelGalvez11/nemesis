"use client";

// The avatar on screen.
//
// THIS FILE DRAWS AND NOTHING ELSE. Every decision about what the character does lives in
// `lib/avatar`, which has no React in it and no DOM — so the same engine answers this
// component, the tests and the contact sheets, and there is exactly one place where "what
// does thinking look like" is decided.
//
// 🔴 REACT RENDERS THE STRUCTURE ONCE; THE CLOCK WRITES ATTRIBUTES. Sixty setState calls a
// second would re-run the component and diff a tree, every frame, for a picture that is
// entirely described by three path strings. So the three paths are created once and each
// frame is written straight onto them through refs. Nothing here changes an element's
// size or position in the document, so none of it touches layout.

import { useEffect, useRef } from "react";

import {
  ANIMATION_BY_ID,
  DEFAULT_AVATAR,
  VIEW_BOX,
  animationDuration,
  avatarFrameAt,
  type Avatar,
  type AvatarFrame,
} from "@/lib/avatar";

export interface NemesisAvatarProps {
  /** Which of the 23 animations to play. */
  animation: string;
  /** The body it plays on. Every animation works on every body. */
  avatar?: Avatar;
  /** Rendered size in px. The drawing is square. */
  size?: number;
  /** Frozen at this millisecond instead of running. */
  frozenAt?: number | null;
  paused?: boolean;
  /** Playback rate. 1 is real time. */
  speed?: number;
  /**
   * Where in the animation to start, in milliseconds.
   *
   * 🔴 SO THAT A ROW OF THEM DOES NOT MARCH IN STEP. Every avatar mounted at the same
   * moment otherwise blinks on the same frame and turns its head on the same frame, which
   * reads as a screen of clones rather than a set of characters.
   */
  offsetMs?: number;
  /** `undefined` follows the OS preference. */
  reducedMotion?: boolean;
  /** Give this only when the avatar carries meaning on its own. */
  label?: string;
  className?: string;
}

export function NemesisAvatar({
  animation,
  avatar = DEFAULT_AVATAR,
  size = 120,
  frozenAt = null,
  paused = false,
  speed = 1,
  offsetMs = 0,
  reducedMotion,
  label,
  className,
}: NemesisAvatarProps) {
  const bodyRef = useRef<SVGPathElement | null>(null);
  const leftRef = useRef<SVGPathElement | null>(null);
  const rightRef = useRef<SVGPathElement | null>(null);

  // Read inside the frame loop rather than closed over, so changing an animation or a
  // colour does not tear down and restart the clock.
  const latest = useRef({ animation, avatar, paused, speed, offsetMs, reducedMotion, frozenAt });
  latest.current = { animation, avatar, paused, speed, offsetMs, reducedMotion, frozenAt };

  useEffect(() => {
    const paint = (f: AvatarFrame | null) => {
      if (!f) return;
      bodyRef.current?.setAttribute("d", f.body);
      // Hidden by emptying the path rather than by an opacity or a `display`: an eye that
      // has gone round the back has no geometry, and writing nothing is both the cheapest
      // way to say that and the one that cannot half-apply.
      leftRef.current?.setAttribute("d", f.leftVisible ? f.left : "");
      rightRef.current?.setAttribute("d", f.rightVisible ? f.right : "");
    };

    const reduced =
      latest.current.reducedMotion ??
      (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);

    // The still paths: one frame, no clock, nothing scheduled.
    if (latest.current.frozenAt != null || reduced) {
      const at = latest.current.frozenAt ?? 0;
      paint(avatarFrameAt(animation, at + offsetMs, avatar, { reduced: reduced && frozenAt == null }));
      return;
    }

    let raf = 0;
    let start: number | null = null;
    let elapsed = 0;
    let last = 0;

    // 🔴 ONE FRAME BEFORE THE LOOP STARTS. `requestAnimationFrame` does not fire in a tab
    // that is not compositing — a background tab, a hidden pane, a print — so a component
    // that only ever paints inside the loop shows an EMPTY body until the tab is looked
    // at. Found exactly that way: twenty-four avatars rendered as nothing while ten frozen
    // ones beside them drew fine.
    paint(avatarFrameAt(latest.current.animation, latest.current.offsetMs, latest.current.avatar));

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const state = latest.current;
      if (start === null) {
        start = now;
        last = now;
      }
      // Accumulated rather than `now - start`, so `speed` can change mid-play and a pause
      // does not silently fast-forward by however long the tab was hidden.
      const step = Math.min(now - last, 100);
      last = now;
      if (!state.paused) elapsed += step * state.speed;
      paint(avatarFrameAt(state.animation, elapsed + state.offsetMs, state.avatar));
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Deliberately narrow: the loop reads everything else out of `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation, avatar, frozenAt, offsetMs, reducedMotion]);

  return (
    <svg
      className={["nemesis-avatar", className].filter(Boolean).join(" ")}
      viewBox={VIEW_BOX}
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path ref={bodyRef} d="" fill={avatar.ink} />
      <path ref={leftRef} d="" fill={avatar.eye} />
      <path ref={rightRef} d="" fill={avatar.eye} />
    </svg>
  );
}

/** How long one loop of an animation takes, in ms. Exported for anything that schedules. */
export function avatarLoopMs(animation: string): number {
  const a = ANIMATION_BY_ID.get(animation);
  return a ? animationDuration(a) : 0;
}
