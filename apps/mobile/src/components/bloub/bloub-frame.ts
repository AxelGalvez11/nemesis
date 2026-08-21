// The five things a react-native-svg renderer needs that the vendored engine cannot give it.
//
// 🔴 IT EXISTS BECAUSE THE ENGINE SPEAKS SVG AND react-native-svg DOES NOT — NOT BECAUSE THE
// ENGINE IS WRONG. `packages/shared/src/bloub/*` is vendored upstream code (MIT, jeremy-prt/bloub)
// and re-vendoring a newer version has to stay a plain copy, so every difference between "what a
// browser accepts as an SVG attribute" and "what RNSVG accepts as a native prop" is translated
// HERE, on the way out of the engine, and never patched into the engine itself.
//
// Four of the five translations are forced, and each one is a fact about RNSVG 15.15.4 rather
// than a preference:
//
//  - `Shape.setNativeProps` (react-native-svg/src/elements/Shape.tsx) passes its argument straight
//    to the host component with only fill/stroke run through `extractBrush`. It does NOT run
//    `extractProps`, which is the thing that would have parsed an SVG attribute string. So a
//    transform must arrive as RNSVG's own six-number `matrix`, not as `matrix(a,b,c,d,e,f)`.
//  - The same prop takes ONE matrix, not a transform list, so where the web renderer concatenates
//    `${eye.matrix} translate(0,dy)` to hang a brow off an eye, the product has to be multiplied
//    out here — see `liftMatrix`.
//  - `<Stop>` renders `null` and its `setNativeProps` just calls `parent.forceUpdate()` — a React
//    re-render, which is the one thing this whole design exists to avoid. Gradient colours
//    therefore go through `LinearGradient`'s flat native `gradient` array, which means the hex
//    strings the engine emits have to become the packed ARGB ints `extractGradient` builds.
//  - A disc is a `<circle>` upstream and a pooled `<Path>` here, so it needs a path.
//
// Pure, and deliberately in its own file: everything here is a string/number transform with no
// React, no RNSVG import and no engine import, so it can be reasoned about (and, in `packages/
// shared/src/bloub-contract.test.ts`, checked against real engine output) without a device.

import { processColor } from "react-native";

/** RNSVG's `ColumnMajorTransformMatrix`, spelled out so this file imports nothing from RNSVG. */
export type Matrix6 = [number, number, number, number, number, number];

const IDENTITY: Matrix6 = [1, 0, 0, 1, 0, 0];

/**
 * `matrix(a,b,c,d,e,f)` → `[a, b, c, d, e, f]`.
 *
 * 🔴 THE ONE THING IN THE ENGINE'S OUTPUT THAT DOES NOT PORT DIRECTLY. `BotFrame.eyes[i].matrix`
 * is an SVG transform STRING, because on the web it is written into a `transform` attribute and
 * the browser parses it. Nothing in RNSVG parses a transform string arriving through
 * `setNativeProps`, so it is parsed here.
 *
 * The order needs no rearranging: SVG's `matrix(a,b,c,d,e,f)` is column-major
 * [[a c e],[b d f]], which is exactly RNSVG's `ColumnMajorTransformMatrix`.
 *
 * The format is not assumed, it is measured: 57,018 eye matrices sampled across all 225 ordered
 * state pairs (with a non-circle shape and a non-default expression, i.e. the paths that build the
 * matrix differently) are all `matrix(` + six comma-separated decimals, no spaces.
 * `bloub-contract.test.ts` re-runs that sweep, because the day it stops being true this function
 * would silently start returning identity and the eyes would pile up at the origin.
 */
export function parseMatrix(svg: string): Matrix6 {
  const open = svg.indexOf("(");
  if (open === -1 || !svg.endsWith(")")) return IDENTITY;
  const parts = svg.slice(open + 1, -1).split(",");
  if (parts.length !== 6) return IDENTITY;
  const out: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    // A NaN here would reach the native matrix and take the eye out of the picture for good, the
    // same way a NaN look target does. Identity is a visible wrong answer; NaN is an invisible one.
    if (!Number.isFinite(n)) return IDENTITY;
    out.push(n);
  }
  return out as Matrix6;
}

/**
 * A dot's placement, built numerically instead of as `translate(...) rotate(...) scale(...)`.
 *
 * The engine emits two kinds of dot and they are transformed differently, exactly as on the web:
 * a glyph carries its own `d` in body-radius units and so is rotated and scaled up to the body
 * radius; a plain disc is drawn at its own radius and only moved.
 *
 * `translate(x,y) · rotate(θ) · scale(R)` multiplies out to [R·cosθ, R·sinθ, -R·sinθ, R·cosθ, x, y]
 * — worth doing here rather than shipping the string, because building the string only to have
 * nothing parse it is how this would fail silently.
 */
export function dotMatrix(
  dot: { x: number; y: number; rot?: number; d?: string },
  rayon: number,
): Matrix6 {
  if (dot.d === undefined) return [1, 0, 0, 1, dot.x, dot.y];
  const theta = ((dot.rot ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta) * rayon;
  const sin = Math.sin(theta) * rayon;
  return [cos, sin, -sin, cos, dot.x, dot.y];
}

/**
 * A dot's disc, as a path.
 *
 * Upstream switches element type between `<circle>` and `<path>` depending on which kind of dot it
 * is. A pooled renderer cannot switch element types — the pool is allocated once and the refs must
 * stay valid — so a disc is expressed as a path. Same geometry, one pool instead of two. RNSVG's
 * path parser handles the `a` (elliptical arc) command this emits.
 */
export function discPath(r: number): string {
  return `M ${-r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
}

/**
 * `"#2496e8"` → the packed opaque ARGB int RNSVG's gradient array wants.
 *
 * 🔴 THIS MIRRORS react-native-svg/src/lib/extract/extractGradient.ts (15.15.4), WHICH IS WHY THAT
 * FILE IS NAMED HERE. It builds each stop as `processColor(stopColor) & 0x00ffffff | alpha << 24`
 * with `alpha = Math.round(opacity * 255)`, and every stop the engine emits is fully opaque. If a
 * future RNSVG changes that packing, this is the line that has to change with it — and the
 * gradients would go wrong in a way that reads as "the rings look muddy", not as an error.
 *
 * Memoised because `wheel()`'s output is constant per arc seed: the twelve arcs of a frame ask for
 * three colours each, and those thirty-six lookups collapse onto roughly a dozen distinct strings.
 * `processColor` is a bridge-adjacent parse; doing it 2,160 times a second would be silly.
 */
const ARGB = new Map<string, number>();

export function argb(hex: string): number {
  const cached = ARGB.get(hex);
  if (cached !== undefined) return cached;
  const processed = processColor(hex);
  // processColor returns an opaque platform value on some platforms and null for a colour it
  // cannot read. Transparent black is the safe miss: a stop that does not paint, rather than a
  // NaN that poisons the whole gradient array.
  const packed = typeof processed === "number" ? ((processed & 0x00ffffff) | (255 << 24)) : 0;
  ARGB.set(hex, packed);
  return packed;
}

/**
 * An eye's matrix, with a lift applied in the EYE'S OWN local frame.
 *
 * 🔴 THIS IS WEB'S `${eye.matrix} translate(0,${dy})` DONE AS ARITHMETIC, AND IT HAS TO BE.
 * `bloub-bot.tsx` places a brow by concatenating a translate onto the eye's transform string and
 * letting the browser multiply the two. Nothing in RNSVG parses a transform string arriving
 * through `setNativeProps` — see `parseMatrix` above — and RNSVG's `matrix` prop is a single
 * matrix rather than a list, so there is no node-level way to post-multiply one. The product is
 * therefore taken here.
 *
 * SVG's `matrix(a,b,c,d,e,f)` is [[a c e],[b d f]], so post-multiplying by
 * `translate(0, dy)` = [[1 0 0],[0 1 dy]] leaves the first two columns alone and moves only the
 * translation: `e += c·dy`, `f += d·dy`. The `c` and `d` column is the eye's own DOWN direction,
 * which is the whole reason this is a post-multiply rather than an offset added to the eye's
 * screen position: the brow rides the tangent frame, the head's roll and the foreshortening the
 * engine already put in that matrix, instead of re-deriving any of them.
 *
 * Returns a NEW array rather than mutating: `setNativeProps` is handed the array by reference and
 * the eye is drawn from the same matrix in the same frame.
 */
export function liftMatrix(m: Matrix6, dy: number): Matrix6 {
  return [m[0], m[1], m[2], m[3], m[4] + m[2] * dy, m[5] + m[3] * dy];
}
