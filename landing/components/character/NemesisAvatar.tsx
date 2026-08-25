"use client";

// The character on screen. One component, every surface.
//
// THIS FILE DRAWS AND NOTHING ELSE. Every decision about what the character does lives in
// `lib/avatar`, which has no React in it and no DOM — so the same engine answers this
// component, the tests and the contact sheets, and there is exactly one place where "what
// does thinking look like" is decided.
//
// 🔴 REACT RENDERS THE STRUCTURE ONCE; THE CLOCK WRITES ATTRIBUTES. Sixty setState calls a
// second would re-run the component and diff a tree, every frame, for a picture that is
// entirely described by three path strings. So the three paths are created once and each
// frame is written straight onto them through refs. Nothing here changes an element's size
// or position in the document, so none of it touches layout.

import { useCallback, useEffect, useRef } from "react";

import {
  ANIMATION_BY_ID,
  DEFAULT_AVATAR,
  TRACK_PITCH,
  TRACK_YAW,
  VIEW_BOX,
  animationDuration,
  avatarFrameAt,
  type Avatar,
  type AvatarFrame,
} from "@/lib/avatar";

export interface NemesisAvatarProps {
  /** Which of the animations to play. */
  animation: string;
  /** The body it plays on. Every animation works on every body. */
  avatar?: Avatar;
  /**
   * Body and eye colours, overriding the body's own.
   *
   * 🔴 THE PRODUCT PASSES THE ACCENT HERE AND SHOULD NEVER PASS ANYTHING ELSE. The bodies
   * in `lib/avatar/avatars.ts` carry the reference's own colours, which are right for a
   * gallery of characters and wrong for ours: Nemesis has ONE character and its colour is
   * the accent the learner chose. See lib/character/look.ts.
   */
  ink?: string;
  eye?: string;
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
  /** Let the pointer turn the head. Off for decorative instances and for stills. */
  track?: boolean;
  /** Click to poke. Plays `pokeAnimation` once through, then returns to `animation`. */
  onPoke?: () => void;
  pokeAnimation?: string;
  /** `undefined` follows the OS preference. */
  reducedMotion?: boolean;
  /** Give this only when the character carries meaning on its own. */
  label?: string;
  className?: string;
}

/** How fast the head catches up with the pointer, per frame at 60fps. */
const TRACK_EASE = 0.12;

export function NemesisAvatar({
  animation,
  avatar = DEFAULT_AVATAR,
  ink,
  eye,
  size = 120,
  frozenAt = null,
  paused = false,
  speed = 1,
  offsetMs = 0,
  track = false,
  onPoke,
  pokeAnimation = "surprised",
  reducedMotion,
  label,
  className,
}: NemesisAvatarProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bodyRef = useRef<SVGPathElement | null>(null);
  const leftRef = useRef<SVGPathElement | null>(null);
  const rightRef = useRef<SVGPathElement | null>(null);

  // Read inside the frame loop rather than closed over, so changing an animation or a
  // colour does not tear down and restart the clock.
  const latest = useRef({ animation, avatar, paused, speed, offsetMs, track });
  latest.current = { animation, avatar, paused, speed, offsetMs, track };

  /** Where the pointer is, in -1..1 of the element, and where the head has got to. */
  const aim = useRef({ x: 0, y: 0, atX: 0, atY: 0, pointer: false });
  /** A poke in progress: the animation to play and when it started. */
  const poke = useRef<{ id: string; at: number } | null>(null);

  const fire = useCallback(() => {
    if (!onPoke) return;
    poke.current = { id: pokeAnimation, at: 0 };
    onPoke();
  }, [onPoke, pokeAnimation]);

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
      reducedMotion ??
      (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);

    // The still paths: one frame, no clock, nothing scheduled.
    if (frozenAt != null || reduced) {
      const at = frozenAt ?? 0;
      paint(avatarFrameAt(animation, at + offsetMs, avatar, { reduced: reduced && frozenAt == null }));
      return;
    }

    let raf = 0;
    let elapsed = 0;
    let last = 0;
    let started = false;

    // 🔴 ONE FRAME BEFORE THE LOOP STARTS. `requestAnimationFrame` does not fire in a tab
    // that is not compositing — a background tab, a hidden pane, a print — so a component
    // that only ever paints inside the loop shows an EMPTY body until the tab is looked
    // at. Found exactly that way: twenty-four avatars rendered as nothing while ten frozen
    // ones beside them drew fine.
    paint(avatarFrameAt(animation, offsetMs, avatar));

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const state = latest.current;
      if (!started) {
        started = true;
        last = now;
      }
      // Accumulated rather than `now - start`, so `speed` can change mid-play and a pause
      // does not silently fast-forward by however long the tab was hidden.
      const step = Math.min(now - last, 100);
      last = now;
      if (!state.paused) elapsed += step * state.speed;

      // The head eases toward the pointer rather than snapping to it: a head that tracks
      // exactly reads as a cursor with a face, not as something noticing you.
      const a = aim.current;
      const wantX = a.pointer ? a.y * TRACK_PITCH : 0;
      const wantY = a.pointer ? a.x * TRACK_YAW : 0;
      a.atX += (wantX - a.atX) * TRACK_EASE;
      a.atY += (wantY - a.atY) * TRACK_EASE;

      let playing = state.animation;
      let at = elapsed + state.offsetMs;
      const active = poke.current;
      if (active) {
        const anim = ANIMATION_BY_ID.get(active.id);
        const span = anim ? animationDuration(anim) : 0;
        if (active.at === 0) active.at = elapsed;
        if (elapsed - active.at < span) {
          playing = active.id;
          at = elapsed - active.at;
        } else {
          poke.current = null;
        }
      }

      paint(
        avatarFrameAt(playing, at, state.avatar, {
          ...(state.track ? { turn: { x: a.atX, y: a.atY } } : null),
        }),
      );
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Deliberately narrow: the loop reads everything else out of `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation, avatar, frozenAt, offsetMs, reducedMotion]);

  // Pointer tracking lives on the window, not on the element: the character should notice
  // the cursor crossing the page, not only the cursor landing on top of it.
  useEffect(() => {
    if (!track) return;
    const move = (event: PointerEvent) => {
      const box = svgRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      // Normalised against a generous radius rather than the element, so the head is not
      // already at full deflection the moment the pointer leaves the character.
      const reach = Math.max(box.width, box.height) * 2.5;
      aim.current.x = clamp((event.clientX - (box.left + box.width / 2)) / reach);
      aim.current.y = clamp((event.clientY - (box.top + box.height / 2)) / reach);
      aim.current.pointer = true;
    };
    const release = () => {
      aim.current.pointer = false;
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", release);
      window.removeEventListener("blur", release);
    };
  }, [track]);

  const pokeable = Boolean(onPoke);

  return (
    <svg
      ref={svgRef}
      className={["nemesis-avatar", className].filter(Boolean).join(" ")}
      viewBox={VIEW_BOX}
      width={size}
      height={size}
      role={pokeable ? "button" : label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      tabIndex={pokeable ? 0 : undefined}
      style={pokeable ? { cursor: "pointer" } : undefined}
      onClick={pokeable ? fire : undefined}
      onKeyDown={
        pokeable
          ? (event) => {
              // A poke is a real control when it is one: the same reaction from the
              // keyboard, and no scroll from the space bar.
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fire();
              }
            }
          : undefined
      }
      focusable="false"
    >
      <path ref={bodyRef} d="" fill={ink ?? avatar.ink} />
      <path ref={leftRef} d="" fill={eye ?? avatar.eye} />
      <path ref={rightRef} d="" fill={eye ?? avatar.eye} />
    </svg>
  );
}

const clamp = (v: number): number => Math.min(1, Math.max(-1, v));

/** How long one loop of an animation takes, in ms. Exported for anything that schedules. */
export function avatarLoopMs(animation: string): number {
  const a = ANIMATION_BY_ID.get(animation);
  return a ? animationDuration(a) : 0;
}
