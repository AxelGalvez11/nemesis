"use client";

// The character on screen. ONE component, every surface, one engine behind it.
//
// THIS FILE DRAWS AND NOTHING ELSE. Every decision about what the character does lives in
// `lib/avatar`, which has no React in it and no DOM — so the same engine answers this
// component, the tests and the contact sheets, and there is exactly one place where "what
// does thinking look like" is decided.
//
// 🔴 AND IT IS ONE COMPONENT ON PURPOSE (owner 2026-08-25: "i need one shared layer and
// engine"). The product used to run a second renderer for a second engine, with its own
// clock, its own pointer tracking and its own idea of where an eye was. Two characters that
// happened to look alike is exactly what that instruction was about, and the fix is not two
// tidy components sharing a library — it is this one, drawing the marketing page's plain
// character and the workspace's spectacled, brow-waggling one from the same frame.
//
// 🔴 REACT RENDERS THE STRUCTURE ONCE; THE CLOCK WRITES ATTRIBUTES. Sixty setState calls a
// second would re-run the component and diff a tree, every frame, for a picture that is
// entirely described by a handful of path strings. So the structure is created once and each
// frame is written straight onto it through refs. Nothing here changes an element's size or
// position in the document, so none of it touches layout.
//
// 🔴 THE EYES ARE HOLES, NOT SHAPES LAID ON TOP. That is what makes them clip themselves
// against the silhouette when the head carries them toward its edge, and it is what lets a
// scatter's sparks pass BEHIND the body without reappearing inside the eyes. Everything our
// own layer adds — brows, a smirk — is a hole in the same mask for the same reason. The
// spectacles are the one exception and they say why below.

import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";

import {
  ANIMATION_BY_ID,
  DEFAULT_AVATAR,
  RADIUS,
  TRACK_PITCH,
  TRACK_YAW,
  VIEW_BOX,
  VIEW_SIZE,
  animationDuration,
  createPlayhead,
  MAX_SPARKS,
  drawFace,
  sparkScaleFor,
  mixHex,
  eyeFrames,
  type Avatar,
  type AvatarFrame,
  type EyeFrame,
} from "@/lib/avatar";
import { characterInk } from "@/lib/accent";
import {
  FACE_IN_MS,
  SIGMA_EYE,
  SMIRK,
  SPECS,
  WAGGLE_MS,
  arrival,
  browAt,
  capsulePath,
  inFace,
  raisedBrow,
  ringPath,
  type FeatureFace,
} from "@/lib/avatar/features";
import { trackReach } from "@/lib/character/gaze";

export interface NemesisAvatarProps {
  /** Which of the animations to play. Any of the forty-nine; see `lib/avatar/catalogue.ts`. */
  animation: string;
  /** The body it plays on. Every animation works on every body. */
  avatar?: Avatar;
  /**
   * Body colour, overriding the body's own.
   *
   * 🔴 THE PRODUCT PASSES THE ACCENT HERE AND SHOULD NEVER PASS ANYTHING ELSE. The bodies
   * in `lib/avatar/avatars.ts` carry the reference's own colours, which are right for a
   * gallery of characters and wrong for ours: Nemesis has ONE character and its colour is
   * the accent the learner chose. See `characterInk` in lib/accent.ts.
   */
  ink?: string;
  /**
   * The learner's accent, resolved to ink here.
   *
   * The product passes this rather than a colour: one choice paints the send button and the
   * character together, and the adjustment that keeps a near-black readable on a dark page
   * is made once, in `lib/accent.ts`, for both of them.
   */
  accent?: string;
  /**
   * What shows through the eyes.
   *
   * Load-bearing rather than cosmetic: the eyes are holes, so this is painted as an opaque
   * backing behind the body. It wants to be the colour of the page the character sits on.
   * Unset, it is read from `--character-paper` on the element.
   */
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
  /**
   * Look HERE instead of at the pointer — client coordinates, or null for the pointer.
   *
   * The surface saying "attend to this": a diagram it just drew, the answer field, a source
   * panel. It goes through the same rule the pointer does rather than a second path, so an
   * aim across the page and an aim at the cursor arrive with the same weight and the same
   * inertia. Requires `track`.
   */
  aimAt?: { x: number; y: number } | null;
  /**
   * Which way is FORWARD for this instance.
   *
   * 🔴🔴 THE PRODUCT'S DECISION, NOT THE POSE'S, AND THAT IS WHY IT IS A PROP RATHER THAN AN EDIT
   * TO A FACE (owner 2026-08-26: *"This should be forward facing, not just looking around … it
   * looks like it's just looking behind … It should be looking at text, composer. Right now it's
   * just sort of drifted off."*).
   *
   * Every pose in `lib/avatar` is measured off a reference that draws its character ALONE on a
   * page, so its resting head is a three-quarter view: `neutral` — the pose `idle` holds, which is
   * what the character wears whenever nothing is happening — points **28.5° to the side and 28.6°
   * up**, and holds it, because `idle` has exactly one step. Beside a composer and a page of text
   * that does not read as depth, it reads as a creature looking over its shoulder at nothing. Worse
   * on top: tracking ADDS to the pose, and `TRACK_YAW` is 26 — so a pointer to that side put the
   * head at **54.5°**, far enough round that an eye starts disappearing behind the body.
   *
   * `"authored"` keeps the measured pose exactly as it is, and is the default, so the landing
   * page, the character studio and every preview are untouched by this. `"forward"` cancels the
   * drawn pose's own yaw and pitch, which leaves the SHAPE of the face — the eye widths, the lids,
   * the tilts, the roll — completely alone and only changes where it is pointed.
   *
   * 🔴 THE ROLL IS DELIBERATELY NOT CANCELLED. `curious` is the resting face with the head rolled
   * fifteen degrees, and `expressions.ts` says outright that curiosity is carried by the roll and
   * not by the eyes. Levelling that would delete the expression rather than aim it. `turn` has only
   * ever carried yaw and pitch for the same reason.
   */
  facing?: "authored" | "forward";
  /**
   * The body's outline at rest — the shape the character IS, when the pose does not say.
   *
   * 🔴 A PROP RATHER THAN A DEFAULT, FOR THE SAME REASON `facing` IS ONE. This component draws
   * all ten vendored bodies for the catalogue browser, and a squircle pushed onto a cone or a
   * capsule is a shape that exists in no reference and that nobody chose. Nemesis's own surfaces
   * pass `CHARACTER_SILHOUETTE` (see `lib/character/body.ts`); a preview of the catalogue passes
   * nothing and gets the body as it was measured.
   */
  silhouette?: readonly number[] | null;
  /**
   * Open with a full turn of the head before it settles.
   *
   * 🔴 OFF BY DEFAULT. It is a lovely arrival — the eyes really do pass behind the body and
   * come back, because they are painted on a solid — but during it the character HAS NO FACE
   * for a second. Worth it for a deliberate entrance; wrong as a default for something
   * parked above a composer that appears many times a session.
   */
  entrance?: boolean;
  /** Click to poke. */
  onPoke?: () => void;
  /**
   * An animation this component plays itself on a poke, once through.
   *
   * 🔴🔴 OFF BY DEFAULT SINCE 2026-08-26, AND IT USED TO DEFAULT TO `"surprised"` — WHICH IS WHY
   * THE OWNER KEPT SEEING WIDE EYES ON A CLICK (*"it still has the wide eyes when clicked on"*).
   *
   * There are TWO poke mechanisms and nobody had reconciled them. The surface decides what a click
   * does through `usePoke`, which hands back a `state` and a `motion`; this one is internal to the
   * renderer and overrode the animation for its own duration. Both fired on the same click. So
   * whatever `usePoke` had been carefully set to — a hop, a spin, a burst — the renderer played
   * `surprised` over the top of it, and `surprised` is the widest face in the set: eyes 0.45 x 0.47
   * against `neutral`'s 0.186 x 0.412, about two and a half times the area.
   *
   * Cutting the reaction list to one thing did not help, and could not have: the second mechanism
   * was never reading that list.
   *
   * 🔴 THE DEFAULT IS THE FIX, NOT A CALLER PASSING `null`. A caller who forgets is exactly how
   * this survived; absent has to mean nothing happens.
   */
  pokeAnimation?: string | null;
  /** Run the brow waggle once. Scene-clocked, so it slows with `speed` and pauses with it. */
  waggle?: boolean;
  /** A face from OUR layer — reading glasses, the sigma. Omitted is the plain face. */
  face?: FeatureFace | null;
  /** `undefined` follows the OS preference. */
  reducedMotion?: boolean;
  /** Give this only when the character carries meaning on its own. */
  label?: string;
  className?: string;
}

/** How fast the head catches up with the pointer, per frame at 60fps. */
const TRACK_EASE = 0.12;

/**
 * How long a POKE takes to cut in, against the 500ms every other change of animation eases over.
 *
 * 🔴 OWNER 2026-08-27: *"the burst is not reactive it takes about 1 seconds to start"*. Half of that
 * second was this blend: `burst`'s collapse began from a face that was still half `idle`, so the
 * opening of a click read as nothing happening. Not zero — a hard cut is the "animations seem to
 * cut abruptly" complaint that `HANDOVER_MS` exists to answer — but short enough to read as the
 * click landing.
 */
const POKE_HANDOVER_MS = 90;

/** How long the entrance turn takes, in milliseconds. */
const ENTRANCE_MS = 1100;

const HALF = VIEW_SIZE / 2;

export function NemesisAvatar({
  animation,
  avatar = DEFAULT_AVATAR,
  ink,
  accent,
  eye,
  size = 120,
  frozenAt = null,
  paused = false,
  speed = 1,
  offsetMs = 0,
  track = false,
  aimAt = null,
  facing = "authored",
  silhouette = null,
  entrance = false,
  onPoke,
  pokeAnimation = null,
  waggle = false,
  face = null,
  reducedMotion,
  label,
  className,
}: NemesisAvatarProps) {
  const uid = useId().replace(/:/g, "");
  const maskId = `apv-${uid}`;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const maskBodyRef = useRef<SVGPathElement | null>(null);
  const paperBodyRef = useRef<SVGPathElement | null>(null);
  const inkRectRef = useRef<SVGRectElement | null>(null);
  const notchRef = useRef<SVGCircleElement | null>(null);
  const eyeRefs = useRef<(SVGPathElement | null)[]>([]);
  const browRefs = useRef<(SVGPathElement | null)[]>([]);
  const lensRefs = useRef<(SVGPathElement | null)[]>([]);
  const armRefs = useRef<(SVGPathElement | null)[]>([]);
  const specsRef = useRef<SVGGElement | null>(null);
  const bridgeRef = useRef<SVGPathElement | null>(null);
  const mouthRef = useRef<SVGPathElement | null>(null);
  const frontRef = useRef<SVGPathElement | null>(null);
  /** One node per possible spark, made once. See `MAX_SPARKS` and `Dot.depth`. */
  const sparkRefs = useRef<Array<SVGPathElement | null>>([]);
  const backRef = useRef<SVGPathElement | null>(null);

  // Read inside the frame loop rather than closed over, so changing an animation or a
  // colour does not tear down and restart the clock.
  const latest = useRef({ animation, avatar, paused, speed, offsetMs, track, aimAt, facing, silhouette, entrance, face, ink, accent, eye });
  latest.current = { animation, avatar, paused, speed, offsetMs, track, aimAt, facing, silhouette, entrance, face, ink, accent, eye };

  /** Where the pointer is, in -1..1 of the element, and where the head has got to. */
  const aim = useRef({ x: 0, y: 0, atX: 0, atY: 0, pointer: false });
  /** A poke in progress: the animation to play and when it started. */
  const poke = useRef<{ id: string; at: number } | null>(null);
  /** One clock, any number of animations, morphing across every seam. See `createPlayhead`. */
  const head = useRef(createPlayhead(animation));
  /** The scene clock, in milliseconds. It never restarts; see the note in the loop. */
  const clock = useRef(0);

  // 🔴 THE GESTURE CLOCKS OUTLIVE THE LOOP, AND THAT IS THE WHOLE POINT. These lived inside
  // the animation effect once, so every change of animation re-created them and re-ran the
  // entrance: switching from resting to working sent the eyes round the back of the body for
  // a second, every time, and it read as the face falling off.
  const waggleFrom = useRef<number | null>(null);
  const wasWaggling = useRef(false);
  if (waggle !== wasWaggling.current) {
    wasWaggling.current = waggle;
    waggleFrom.current = waggle ? clock.current : null;
  }
  const faceSeen = useRef<FeatureFace | null>(null);
  const faceFrom = useRef<number | null>(null);
  if (face !== faceSeen.current) {
    faceSeen.current = face;
    faceFrom.current = face ? clock.current : null;
  }
  const enteredAt = useRef<number | null>(null);

  const fire = useCallback(() => {
    if (!onPoke) return;
    // Only when the caller asked for one. See `pokeAnimation`: the default used to be a face, and
    // it played on top of whatever the surface's own `usePoke` had chosen.
    if (pokeAnimation) poke.current = { id: pokeAnimation, at: 0 };
    onPoke();
  }, [onPoke, pokeAnimation]);

  /**
   * The body's colour this frame.
   *
   * Read per frame rather than closed over, because the theme can change under a running
   * character — a learner switching to dark mode mid-session — and the loop must not be torn
   * down and restarted to notice, or the entrance turn runs again.
   */
  const inkOf = useCallback((): string => {
    const state = latest.current;
    if (state.ink) return state.ink;
    if (state.accent === undefined) return state.avatar.ink;
    const dark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
    return characterInk(state.accent, dark);
  }, []);

  /** The page colour behind the character, which the eye holes show. */
  const paperOf = useCallback((): string => {
    if (latest.current.eye) return latest.current.eye;
    if (typeof window === "undefined") return "#f9f9f9";
    const node = svgRef.current ?? document.documentElement;
    const token = getComputedStyle(node).getPropertyValue("--character-paper").trim();
    if (token) return token;
    // 🔴 THE FALLBACK FOLLOWS THE THEME, because getting it wrong is invisible rather than
    // loud: the eyes are holes, so a near-white backing on a dark page does not throw — it
    // draws a blank white disc with no face, and it looks like the engine stopped.
    return document.documentElement.dataset.theme === "dark" ? "#0b0b0d" : "#f9f9f9";
  }, []);

  /** Writes one frame onto the DOM. Every line is an attribute write on a node that exists. */
  const paint = useCallback(
    (
      f: AvatarFrame | null,
      eyes: readonly EyeFrame[],
      inkHex: string,
      paperHex: string,
      waggleMs: number | null,
      faceId: FeatureFace | null,
      faceMs: number | null,
    ) => {
      if (!f) return;
      maskBodyRef.current?.setAttribute("d", f.body);
      paperBodyRef.current?.setAttribute("d", f.body);
      paperBodyRef.current?.setAttribute("fill", paperHex);
      inkRectRef.current?.setAttribute("fill", inkHex);
      frontRef.current?.setAttribute("d", f.dots);
      frontRef.current?.setAttribute("fill", inkHex);
      // 🔴 ONE FILL PER SPARK, MIXED BETWEEN THE PAPER AND THE INK BY ITS DEPTH. That ramp IS the
      // effect: a spark just thrown off is nearly paper and reads as a bright speck on the dark
      // body, and one that has spiralled into the core is ink and has been swallowed. Painted in
      // ink like the rest of the decor — which is what this port did — five sparks that never
      // leave the body's own silhouette are five invisible dots.
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        const node = sparkRefs.current[i];
        if (!node) continue;
        const spark = f.sparks[i];
        if (!spark) {
          node.setAttribute("d", "");
          continue;
        }
        node.setAttribute("d", spark.d);
        node.setAttribute("fill", mixHex(paperHex, inkHex, spark.depth));
      }
      backRef.current?.setAttribute("d", f.dotsBehind);
      backRef.current?.setAttribute("fill", inkHex);

      // 🔴 A RADIUS OF ZERO, NOT A `display: none`. The notch is in the mask, and a masked
      // element whose geometry is removed and restored makes the browser rebuild the mask;
      // a circle of no radius costs nothing and keeps the mask a constant shape.
      const notch = notchRef.current;
      if (notch) {
        notch.setAttribute("cx", String(f.notch?.x ?? 0));
        notch.setAttribute("cy", String(f.notch?.y ?? 0));
        notch.setAttribute("r", String(f.notch?.r ?? 0));
      }

      // The spectacles' front group: shown while reading, in the theme-proof pair every
      // front feature wears — paper fill, ink edge. Colours are per-frame like the body's.
      const specs = specsRef.current;
      if (specs) {
        if (faceId === "reading") {
          specs.style.display = "";
          specs.setAttribute("fill", paperHex);
          specs.setAttribute("stroke", inkHex);
        } else {
          specs.style.display = "none";
        }
      }

      // 🔴 THE BROW IS RESOLVED ONCE, NOT PER EYE. A waggle raises both together; the sigma
      // holds ONE at the waggle's own top, so the two can never drift apart.
      const sigma = faceId === "sigma";
      // How far the face has ARRIVED — the sigma's brow lifts to height, the smirk grows in,
      // the glasses scale up over the last quarter. 1 on stills and once it is done.
      const enter = arrival(faceMs);
      const brow = waggleMs !== null ? browAt(waggleMs) : sigma ? raisedBrow(enter) : null;
      const browPath = brow ? capsulePath(inFace(brow.w), inFace(brow.h)) : "";
      const lensPath = faceId === "reading" ? ringPath(inFace(SPECS.r), inFace(SPECS.ring)) : "";
      const grow = ` scale(${(0.75 + 0.25 * enter).toFixed(3)})`;

      const visible = [f.leftVisible, f.rightVisible];
      const paths = [f.left, f.right];
      for (let i = 0; i < 2; i += 1) {
        const there = visible[i] && f.eyeAlpha > 0.01;
        const frame = eyes[i];
        const matrix = frame
          ? `matrix(${frame.a.toFixed(4)},${frame.b.toFixed(4)},${frame.c.toFixed(4)},${frame.d.toFixed(4)},${frame.x.toFixed(2)},${frame.y.toFixed(2)})`
          : "";

        // Hidden by emptying the path rather than by an opacity or a `display`: an eye that
        // has gone round the back has no geometry, and writing nothing is both the cheapest
        // way to say that and the one that cannot half-apply.
        eyeRefs.current[i]?.setAttribute("d", there ? paths[i]! : "");

        // 🔴 NO EYE MEANS NO BROW. An eye is dropped once it has gone round the back; a brow
        // that outlived it would hang unattached over the body's edge. It also covers every
        // faceless routine without naming any. The sigma wears its single brow on SIGMA_EYE
        // only — the asymmetry IS the face.
        const browNode = browRefs.current[i];
        if (browNode) {
          const wanted = brow && there && (waggleMs !== null || (sigma && i === SIGMA_EYE));
          if (!wanted) {
            browNode.style.display = "none";
          } else {
            browNode.style.display = "";
            browNode.setAttribute("d", browPath);
            // Placed THROUGH the eye's own frame, then lifted in that frame: the tangent
            // basis, the head's roll and the foreshortening all come along for free.
            browNode.setAttribute("transform", `${matrix} translate(0,${inFace(brow.dy).toFixed(2)})`);
          }
        }

        const lensNode = lensRefs.current[i];
        if (lensNode) {
          if (!there || faceId !== "reading") {
            lensNode.style.display = "none";
          } else {
            lensNode.style.display = "";
            lensNode.setAttribute("d", lensPath);
            // Worn ON the face: centred just below the eye's centre, the frame crossing the
            // eye — the eye's top showing over the rim is what says "spectacles".
            lensNode.setAttribute("transform", `${matrix} translate(0,${inFace(SPECS.dy).toFixed(2)})${grow}`);
          }
        }

        // The temple piece, running OUTWARD from this lens — screen-left for the first eye,
        // screen-right for the second; both frames keep local +x pointing screen-right.
        const armNode = armRefs.current[i];
        if (armNode) {
          if (!there || faceId !== "reading") {
            armNode.style.display = "none";
          } else {
            const sign = i === 0 ? -1 : 1;
            armNode.style.display = "";
            armNode.setAttribute("d", capsulePath(inFace(SPECS.arm.len), inFace(SPECS.ring)));
            armNode.setAttribute(
              "transform",
              `${matrix} translate(${inFace(sign * (SPECS.r + SPECS.arm.len / 2 + 0.02)).toFixed(2)},${inFace(SPECS.dy + SPECS.arm.dy).toFixed(2)})${grow}`,
            );
          }
        }
      }

      const anchor = eyes[SIGMA_EYE];
      const anchorThere = visible[SIGMA_EYE] && f.eyeAlpha > 0.01 && anchor;
      const anchorMatrix = anchor
        ? `matrix(${anchor.a.toFixed(4)},${anchor.b.toFixed(4)},${anchor.c.toFixed(4)},${anchor.d.toFixed(4)},${anchor.x.toFixed(2)},${anchor.y.toFixed(2)})`
        : "";

      // The smirk rides the SAME eye the sigma brow does, offset down the face in that eye's
      // own frame — anywhere else and it would detach the moment the head rolled. It GROWS in
      // with the arrival; below a sliver it is not drawn at all, because a capsule clamps tiny
      // widths up and would pop instead of closing.
      const mouth = mouthRef.current;
      if (mouth) {
        if (!sigma || !anchorThere || enter < 0.06) {
          mouth.style.display = "none";
        } else {
          mouth.style.display = "";
          mouth.setAttribute("d", capsulePath(inFace(SMIRK.w * enter), inFace(SMIRK.h)));
          mouth.setAttribute(
            "transform",
            `${anchorMatrix} translate(${inFace(SMIRK.dx).toFixed(2)},${inFace(SMIRK.dy).toFixed(2)}) rotate(${SMIRK.rot})`,
          );
        }
      }

      // The bridge welds the two inner rims; it hangs off the first eye's frame like the smirk.
      const bridge = bridgeRef.current;
      if (bridge) {
        if (faceId !== "reading" || !anchorThere) {
          bridge.style.display = "none";
        } else {
          bridge.style.display = "";
          bridge.setAttribute("d", capsulePath(inFace(SPECS.bridge.w), inFace(SPECS.ring)));
          bridge.setAttribute(
            "transform",
            `${anchorMatrix} translate(${inFace(SPECS.bridge.dx).toFixed(2)},${inFace(SPECS.bridge.dy).toFixed(2)})${grow}`,
          );
        }
      }
    },
    [],
  );

  const reduced =
    reducedMotion ??
    (typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  const still = frozenAt != null || reduced;

  // 🔴 TWO EFFECTS, AND THE SPLIT IS DELIBERATE. A STILL costs one paint and must repaint
  // whenever anything about it changes; the LOOP must survive those changes untouched,
  // because restarting it restarts the entrance turn. Folding them into one is what sent the
  // eyes around the back of the body on every change of animation.
  //
  // Layout effects rather than effects: the first frame has to be on screen before the
  // browser paints, or the character shows for one frame as an empty box — and `rAF` does
  // not fire at all in a tab that is not compositing, so a component that only ever paints
  // inside the loop shows nothing until the tab is looked at.
  useLayoutEffect(() => {
    if (!still) return;
    const at = (frozenAt ?? 0) + offsetMs;
    const played = head.current.at(at, animation, { reduced: reduced && frozenAt == null });
    if (!played) return;
    // 🔴 ONE OPTIONS OBJECT FOR BOTH CALLS, AND THREADING THE OUTLINE IS WHAT EXPOSED WHY IT HAS
    // TO BE. This line read `eyeFrames(avatar.surface, played.face)` with no options at all, while
    // `drawFace` beside it was handed the blink and the eye drift — so on a STILL character the
    // spectacles and brows were placed through a wide-open, undrifted eye while the eye underneath
    // them was drawn blinking and drifted. Invisible on the live surfaces, which never freeze, and
    // wrong in every contact sheet and preview that does. The outline has exactly the same bug
    // available to it (a squircle body wearing eyes that ride a ball), so the two calls now share
    // one object rather than two argument lists that merely look alike.
    const opts = { blink: played.blink, eyeDrift: played.eyeDrift, rest: silhouette, sparkScale: sparkScaleFor(size) };
    paint(drawFace(avatar.surface, played.face, opts), eyeFrames(avatar.surface, played.face, opts), inkOf(), paperOf(), null, face, null);
    // Redrawn whenever the look changes, since nothing else will redraw it.
  }, [still, frozenAt, offsetMs, animation, avatar, silhouette, ink, accent, eye, face, reduced, paint, inkOf, paperOf]);

  useLayoutEffect(() => {
    if (still) return;
    let raf = 0;
    let last = 0;
    let started = false;

    const onPointerMove = (event: PointerEvent) => {
      // A finger leaves no cursor behind. Keeping the last touch point would freeze the gaze
      // on wherever the learner last tapped, which reads as a stuck element.
      if (event.pointerType === "touch") return;
      const box = svgRef.current?.getBoundingClientRect();
      // 🔴 A ZERO-SIZED BOX IS REFUSED, and this is not defensive noise: the normalisation
      // would be 0/0, and one NaN settles in for good. A hidden pane returns exactly zeros.
      if (!box || box.width === 0) return;
      const target = latest.current.aimAt ?? { x: event.clientX, y: event.clientY };
      const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      // 🔴 THE REACH IS A PROPERTY OF THE SCREEN, NOT OF THE CHARACTER — see `trackReach`, which
      // carries the measurement. It was `max(width, height) * 2.5`: 190px at this size, so the head
      // was at full deflection 190px away and 61% of the window drew one identical frame.
      const reach = trackReach({ centre, viewport: { width: window.innerWidth, height: window.innerHeight } });
      aim.current.x = clamp((target.x - centre.x) / reach);
      aim.current.y = clamp((target.y - centre.y) / reach);
      aim.current.pointer = true;
    };
    const release = () => {
      aim.current.pointer = false;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const state = latest.current;
      if (!started) {
        started = true;
        last = now;
        if (state.entrance) enteredAt.current = clock.current;
      }
      // Accumulated rather than `now - start`, so `speed` can change mid-play and a pause
      // does not silently fast-forward by however long the tab was hidden.
      const step = Math.min(now - last, 100);
      last = now;
      if (!state.paused) clock.current += step * state.speed;
      const elapsed = clock.current;

      // An explicit target outranks the cursor; with neither, the head keeps its own drift,
      // which is what keeps it alive on a touch device where no pointer exists at all.
      if (state.track && state.aimAt) {
        const box = svgRef.current?.getBoundingClientRect();
        if (box && box.width > 0) {
          const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
          const reach = trackReach({ centre, viewport: { width: window.innerWidth, height: window.innerHeight } });
          aim.current.x = clamp((state.aimAt.x - centre.x) / reach);
          aim.current.y = clamp((state.aimAt.y - centre.y) / reach);
          aim.current.pointer = true;
        }
      }

      // The head eases toward the pointer rather than snapping to it: a head that tracks
      // exactly reads as a cursor with a face, not as something noticing you.
      const a = aim.current;
      const looking = state.track && a.pointer;
      const wantX = looking ? a.y * TRACK_PITCH : 0;
      const wantY = looking ? a.x * TRACK_YAW : 0;
      a.atX += (wantX - a.atX) * TRACK_EASE;
      a.atY += (wantY - a.atY) * TRACK_EASE;

      // The entrance is a whole turn of the head that decays to nothing, so the eyes really
      // do pass behind the body and come back. Nothing else in the product spins.
      let spin = 0;
      if (state.entrance && enteredAt.current !== null) {
        const p = Math.min(1, (elapsed - enteredAt.current) / ENTRANCE_MS);
        spin = 360 * (1 - (1 - (1 - p) ** 5));
      }

      // A poke outranks whatever is playing, for as long as it lasts.
      let wanted = state.animation;
      let at = elapsed + state.offsetMs;
      const active = poke.current;
      if (active) {
        const anim = ANIMATION_BY_ID.get(active.id);
        const span = anim ? animationDuration(anim) : 0;
        if (active.at === 0) active.at = elapsed;
        if (elapsed - active.at < span) {
          wanted = active.id;
          at = elapsed - active.at;
        } else {
          poke.current = null;
        }
      }

      // 🔴 THE CLOCK NEVER RESTARTS, AND THAT IS HALF THE FIX for the owner's "the animations
      // seem to cut abruptly". Tearing the loop down when the animation prop changed took the
      // clock back to zero, so the character both snapped to a new face AND lost its place — a
      // blink schedule that had been running for a minute began again. One clock runs for the
      // life of the component; the playhead turns "which animation" into a morph, not a jump.
      // 🔴 A CLICK CUTS IN, EVERYTHING ELSE DRIFTS IN. `active` is only set while a poke is playing,
      // so the fast handover applies to the frame a reaction starts and to nothing else — the
      // character still eases between resting, thinking and preparing over the full 500ms.
      const played = head.current.at(at, wanted, active ? { handoverMs: POKE_HANDOVER_MS } : undefined);
      if (!played) return;

      // 🔴🔴 FORWARD IS SUBTRACTED FROM THE DRAWN POSE, NOT FROM THE AUTHORED ONE, and the
      // difference matters at exactly one moment: a handover. `createPlayhead` blends the previous
      // animation's face into the next one over `HANDOVER_MS`, so mid-handover the head on screen
      // is neither pose's authored angle. Cancelling the TARGET's authored angle there would aim
      // the character at a direction it is not currently pointing, and the error would be largest
      // in the middle of the blend — a swing, on the one seam this engine exists to make smooth.
      // `played.face.head` is what is actually being drawn this frame, so the correction is exact
      // on every frame including those.
      //
      // 🔴 IT TAKES THE AMBIENT HEAD WANDER WITH IT, AND THAT IS ACCOUNTED FOR RATHER THAN
      // OVERLOOKED. `livenFace` wanders yaw by about ±1.15° and pitch by ±0.8°; cancelling the
      // drawn head cancels those too, so a levelled character would otherwise hold one angle
      // exactly. The life is put back somewhere the learner can actually see it — `lib/character/
      // gaze.ts` glances the whole head away and back on a slow schedule, which is the "it should
      // look around occasionally" half of the same report. Roll keeps its own wander either way,
      // because `turn` has never carried roll.
      const level = state.facing === "forward" ? played.face.head : null;
      const turn = level
        ? { x: a.atX - level.x, y: a.atY + spin - level.y }
        : { x: a.atX, y: a.atY + spin };
      const opts = { blink: played.blink, eyeDrift: played.eyeDrift, turn, rest: state.silhouette, sparkScale: sparkScaleFor(size) };
      const from = waggleFrom.current;
      paint(
        drawFace(state.avatar.surface, played.face, opts),
        eyeFrames(state.avatar.surface, played.face, opts),
        inkOf(),
        paperOf(),
        from === null || elapsed - from > WAGGLE_MS ? null : elapsed - from,
        state.face,
        faceFrom.current === null ? null : elapsed - faceFrom.current,
      );
    };

    // Pointer tracking lives on the window, not on the element: the character should notice
    // the cursor crossing the page, not only the cursor landing on top of it.
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", release);
    window.addEventListener("blur", release);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", release);
      window.removeEventListener("blur", release);
    };
    // 🔴 `animation`, `face` AND `waggle` ARE DELIBERATELY NOT DEPENDENCIES. Listing any of
    // them restarts the loop every time the surface changes what the character is doing,
    // which is what made the change a cut. The loop reads them out of `latest` and morphs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  const pokeable = Boolean(onPoke);

  // 🔴 THE SECOND CLASS IS NOT DECORATION. `.nemesis-avatar` sets `pointer-events: none`,
  // because a decorative character that swallows a press meant for the composer behind it is
  // worse than no character at all. The doubled selector in character.css is what lets a
  // pokeable one take the click back — see the note there; it stopped working once, and the
  // symptom was simply a mascot that ignored every click.
  const classes = ["nemesis-avatar", pokeable ? "nemesis-avatar-pokeable" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      ref={svgRef}
      className={classes}
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
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-HALF} y={-HALF} width={VIEW_SIZE} height={VIEW_SIZE}>
          <path ref={maskBodyRef} d="" fill="#fff" />
          {/* The bite a badge sits in, so a ring of page separates the two. */}
          <circle ref={notchRef} cx={0} cy={0} r={0} fill="#000" />
          {[0, 1].map((i) => (
            <path
              key={i}
              ref={(el) => {
                eyeRefs.current[i] = el;
              }}
              d=""
              fill="#000"
            />
          ))}
          {/* Our own layer: brows and the mouth — holes like the eyes, parked until worn.
              The spectacles are NOT here: they overlap the eyes, and two holes that overlap
              melt into one shape. They are painted in front instead, below. */}
          {[0, 1].map((i) => (
            <path
              key={`brow-${i}`}
              ref={(el) => {
                browRefs.current[i] = el;
              }}
              d=""
              fill="#000"
              style={{ display: "none" }}
            />
          ))}
          <path ref={mouthRef} d="" fill="#000" style={{ display: "none" }} />
        </mask>
      </defs>

      {/* Decor that passes BEHIND the body — the sparks of a scatter, which it swallows. */}
      <path ref={backRef} d="" />
      {/* An opaque backing in the page's own colour, so a hole reads as page rather than as
          whatever happens to be behind the character. */}
      <path ref={paperBodyRef} d="" />
      <g mask={`url(#${maskId})`}>
        <rect ref={inkRectRef} x={-HALF} y={-HALF} width={VIEW_SIZE} height={VIEW_SIZE} />
      </g>
      {/* 🔴 DECOR IN THE SAME INK AS THE BODY. The reference paints its notification badge a
          fixed blue; here the character IS the learner's accent, and a second colour they did
          not choose arguing with the one they did is what that rule exists to stop. */}
      <path ref={frontRef} d="" />
      {/* The scatter. In FRONT of the body, because that is the only place they are ever visible:
          measured, a spark never once leaves the body's own silhouette during the whole animation. */}
      {Array.from({ length: MAX_SPARKS }, (_unused, i) => (
        <path
          key={`spark-${i}`}
          ref={(el) => {
            sparkRefs.current[i] = el;
          }}
          d=""
        />
      ))}

      <g
        ref={specsRef}
        strokeWidth={inFace(SPECS.stroke)}
        strokeLinejoin="round"
        style={{ display: "none" }}
      >
        {[0, 1].map((i) => (
          <path
            key={`lens-${i}`}
            ref={(el) => {
              lensRefs.current[i] = el;
            }}
            d=""
            fillRule="evenodd"
            style={{ display: "none" }}
          />
        ))}
        {[0, 1].map((i) => (
          <path
            key={`arm-${i}`}
            ref={(el) => {
              armRefs.current[i] = el;
            }}
            d=""
            style={{ display: "none" }}
          />
        ))}
        <path ref={bridgeRef} d="" style={{ display: "none" }} />
      </g>
    </svg>
  );
}

const clamp = (v: number): number => Math.min(1, Math.max(-1, v));

/** How long one loop of an animation takes, in ms. Exported for anything that schedules. */
export function avatarLoopMs(animation: string): number {
  const a = ANIMATION_BY_ID.get(animation);
  return a ? animationDuration(a) : 0;
}

/** Re-exported so a surface can name a face without reaching past this component. */
export { FACE_IN_MS, WAGGLE_MS, type FeatureFace };
