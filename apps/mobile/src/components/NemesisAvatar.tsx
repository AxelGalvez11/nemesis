// The character, on the phone. Same engine the web draws (`src/learn/avatar.ts`
// re-exports `lib/avatar`, pure, unedited) — only the surface writing its output onto the
// screen is native.
//
// 🔴 STRUCTURE ONCE, FRAMES BY STATE, NOT BY REBUILDING THE TREE. The web writes each frame
// straight onto existing DOM nodes through refs (`setAttribute`), because a React re-render
// sixty times a second was measured to be too slow for a picture that changes as little as
// a handful of path strings. react-native-svg's own primitives do not reliably support
// `setNativeProps` under the new architecture (Fabric) this app runs on — the web's own
// trick has no equivalent here that is not itself a gamble on library internals. So this
// component holds ONE state value, the whole computed frame, and lets React re-render the
// ~10 SVG nodes underneath it. That is the one guaranteed-correct path under both the old
// and new RN architectures; if it ever proves too slow on a real device, the web's ref
// technique is there to try, but "fast and unproven" is a worse trade than "plain and
// working" for a mascot that is not on the critical render path of anything.
//
// 🔴 WHAT THIS DOES NOT DRAW: brows, the smirk, and the reading glasses — the web's OWN
// layer on top of the engine (`lib/avatar/features.ts`, driven by a `face` prop). Neither
// call site this component was built for (the canvas dock, the front-door greeter) ever
// sets `face`; the web itself only reaches "reading" or "sigma" from its montage/poke state
// machines, which this port does not carry over. A prop nothing can ever pass is unreachable
// code with a maintenance cost, so it is left out rather than wired to nothing. If a mobile
// surface someday needs those faces, `features.ts` is pure geometry (no DOM) and can be
// ported the same way `lib/avatar` was — see that file's own comment.
//
// 🔴 NO POINTER TRACKING. The web's `track` prop turns the head toward a mouse the phone
// does not have; this component simply never offers it. The idle blinks, the breathing, the
// occasional doze are the ENGINE's own ambient life (`livenFace`, `blinkAt`, `eyeDriftAt`
// inside `playedFaceAt`) and need nothing from the caller to keep happening.

import { useEffect, useId, useRef, useState } from "react";
import { AppState } from "react-native";
import Svg, { Circle, Defs, G, Mask, Path, Rect } from "react-native-svg";

import {
  DEFAULT_AVATAR,
  MAX_SPARKS,
  VIEW_BOX,
  VIEW_SIZE,
  createPlayhead,
  drawFace,
  mixHex,
  sparkScaleFor,
  type Avatar,
  type AvatarFrame,
  type Playhead,
} from "../learn/avatar";

export interface NemesisAvatarProps {
  /** Which of the engine's animations to play — any id in `ANIMATION_BY_ID`. */
  animation: string;
  /** The body it plays on. Defaults to the reference's own opening body. */
  avatar?: Avatar;
  /** Body colour. Callers pass the resolved theme colour directly — `colors.accent` —
   *  rather than a raw accent id: the web re-derives a contrast-safe hex from an accent
   *  name (`characterInk` in lib/accent.ts) because ITS accent picker stores names; the
   *  phone's `useTheme()` already hands back a contrast-checked hex, so there is nothing
   *  left to re-derive. Falls back to the avatar's own ink. */
  ink?: string;
  /** What shows through the eyes — an opaque backing, since the eyes are holes cut in the
   *  body. Wants to be the page colour behind the character: pass `colors.bg`. */
  eye?: string;
  /** Rendered size in px. The drawing is square. */
  size?: number;
  /** Frozen at this millisecond instead of running. */
  frozenAt?: number | null;
  paused?: boolean;
  /** Playback rate. 1 is real time. */
  speed?: number;
  /** Where in the animation to start, so several instances on one screen do not blink and
   *  turn in lockstep. */
  offsetMs?: number;
  /** The body's outline at rest, e.g. `CHARACTER_SILHOUETTE` — Nemesis's squircle. `null`
   *  draws the avatar's own vendored body (a ball, for `strobi`). */
  silhouette?: readonly number[] | null;
  /** Held on the authored face with no morph, no wander, no blink — for a still preview or
   *  when the caller has independently decided motion should be reduced. */
  reducedMotion?: boolean;
  /** Give this only when the character carries meaning on its own (a11y). */
  label?: string;
}

/** How often the running loop is allowed to repaint. A morph is hundreds of milliseconds
 *  long; sampling it faster than 60fps spends React re-renders a small mascot cannot cash
 *  in for anything a viewer can see. */
const FRAME_INTERVAL_MS = 1000 / 60;

const HALF = VIEW_SIZE / 2;
const EMPTY_SPARKS: AvatarFrame["sparks"] = [];

/** The frame drawn before the first real one lands, so mount is a body rather than a gap. */
const BLANK_FRAME: AvatarFrame = {
  body: "",
  left: "",
  right: "",
  eyeAlpha: 1,
  dots: "",
  dotsBehind: "",
  sparks: EMPTY_SPARKS,
  notch: null,
  leftVisible: false,
  rightVisible: false,
};

export function NemesisAvatar({
  animation,
  avatar = DEFAULT_AVATAR,
  ink,
  eye,
  size = 80,
  frozenAt = null,
  paused = false,
  speed = 1,
  offsetMs = 0,
  silhouette = null,
  reducedMotion = false,
  label,
}: NemesisAvatarProps) {
  const uid = useId().replace(/:/g, "");
  const maskId = `nma-${uid}`;

  const [frame, setFrame] = useState<AvatarFrame>(BLANK_FRAME);

  // One playhead for the component's whole life: morphs across every change of `animation`
  // rather than cutting, exactly as `createPlayhead`'s own doc says. Recreated only if the
  // caller hands us a genuinely different avatar body mid-life, which none of our call
  // sites do.
  const playheadRef = useRef<Playhead | null>(null);
  if (!playheadRef.current) playheadRef.current = createPlayhead(animation);
  const clockRef = useRef(0);

  // Read inside the loop rather than closed over, so changing the animation, the pause
  // state or the speed does not tear the loop down and restart its clock.
  const latest = useRef({ animation, avatar, paused, speed, offsetMs, silhouette, size, reducedMotion });
  latest.current = { animation, avatar, paused, speed, offsetMs, silhouette, size, reducedMotion };

  const still = frozenAt != null || reducedMotion;

  // A still character: one paint, redone whenever anything about the look changes.
  useEffect(() => {
    if (!still) return;
    const at = (frozenAt ?? 0) + offsetMs;
    const played = playheadRef.current!.at(at, animation, { reduced: reducedMotion });
    if (!played) return;
    const opts = { blink: played.blink, eyeDrift: played.eyeDrift, rest: silhouette, sparkScale: sparkScaleFor(size) };
    setFrame(drawFace(avatar.surface, played.face, opts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, frozenAt, offsetMs, animation, avatar, silhouette, size, reducedMotion]);

  // A running character: one clock, paced by requestAnimationFrame, stopped on unmount and
  // while the app is backgrounded — a hidden screen has no viewer to keep smooth for, and a
  // clock that keeps accumulating behind it costs battery for nothing anyone sees.
  useEffect(() => {
    if (still) return;
    let raf = 0;
    let last = 0;
    let lastPaint = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (last === 0) last = now;
      // Clamped, so a frame after the loop was paused (backgrounded, then resumed) does not
      // fast-forward the clock by however long the app was away.
      const step = Math.min(now - last, 100);
      last = now;
      const s = latest.current;
      if (!s.paused) clockRef.current += step * s.speed;
      if (now - lastPaint < FRAME_INTERVAL_MS) return;
      lastPaint = now;

      const at = clockRef.current + s.offsetMs;
      const played = playheadRef.current!.at(at, s.animation);
      if (!played) return;
      const opts = { blink: played.blink, eyeDrift: played.eyeDrift, rest: s.silhouette, sparkScale: sparkScaleFor(s.size) };
      setFrame(drawFace(s.avatar.surface, played.face, opts));
    };

    const start = () => {
      if (raf !== 0) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf === 0) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else stop();
    });

    start();
    return () => {
      subscription.remove();
      stop();
    };
  }, [still]);

  const inkHex = ink ?? avatar.ink;
  const paperHex = eye ?? "#f9f9f9";

  return (
    <Svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
    >
      <Defs>
        <Mask id={maskId} maskUnits="userSpaceOnUse" x={-HALF} y={-HALF} width={VIEW_SIZE} height={VIEW_SIZE}>
          {/* The body, white: what the mask lets through. */}
          <Path d={frame.body} fill="#fff" />
          {/* The badge's bite, black: a ring of the page shows through it. r=0 draws nothing. */}
          <Circle cx={frame.notch?.x ?? 0} cy={frame.notch?.y ?? 0} r={frame.notch?.r ?? 0} fill="#000" />
          {/* The eyes, black: holes, not shapes drawn on top — which is what lets them clip
              against the silhouette as the head turns and lets a spark pass BEHIND the body
              without reappearing inside one. */}
          <Path d={frame.left} fill="#000" />
          <Path d={frame.right} fill="#000" />
        </Mask>
      </Defs>

      {/* Decor that passes behind the body — a scatter's sparks it is meant to swallow. */}
      <Path d={frame.dotsBehind} fill={inkHex} />
      {/* An opaque backing in the page's own colour, so an eye hole reads as page rather
          than as whatever this component happens to sit in front of. */}
      <Path d={frame.body} fill={paperHex} />
      <G mask={`url(#${maskId})`}>
        <Rect x={-HALF} y={-HALF} width={VIEW_SIZE} height={VIEW_SIZE} fill={inkHex} />
      </G>
      {/* Decor in front, in the same ink as the body — the character IS the learner's
          accent, so a badge is never a second colour arguing with the one they chose. */}
      <Path d={frame.dots} fill={inkHex} />
      {/* The scatter: one node per possible spark, made once, each with its own fill — see
          `Dot.depth` in lib/avatar/types.ts for why sparks cannot share a path the way every
          other piece of decor does. */}
      {Array.from({ length: MAX_SPARKS }, (_unused, i) => {
        const spark = frame.sparks[i];
        return (
          <Path
            key={`spark-${i}`}
            d={spark?.d ?? ""}
            fill={spark ? mixHex(paperHex, inkHex, spark.depth) : "transparent"}
          />
        );
      })}
    </Svg>
  );
}
