/**
 * The organism's SURFACE: everything about how it is made of dots.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────
 *
 * The two organisms on the page did not look like the same object. The hero
 * renders at 620px and the one in the sources section at 260px, and the point
 * count was a pair of module constants — 58 latitude bands by 300 points along —
 * so BOTH instances built the same eleven thousand points regardless of how large
 * they were drawn. Same points, 5.7 times less area: the small one came out
 * nearly six times denser per pixel, and it read as a different material rather
 * than as the same creature seen smaller. Its dots were 16% larger on top of
 * that, because dot size was a per-state value and the small instance used a
 * state that happened to carry a bigger one.
 *
 * Neither difference was designed. Both were emergent consequences of tuning at
 * one size and reusing the numbers at another.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────────
 *
 * Surface character is shared and lives here. Form and motion vary per state and
 * live in states.ts. An instance may look different because it flows differently
 * or is shaped differently; it may never look different because it is denser.
 *
 * Adding a per-state dot size or a per-instance density back into this system is
 * how the inconsistency returns, so those knobs deliberately do not exist.
 */

export const SURFACE = {
  /**
   * The size the lattice and dot size were tuned at, in CSS pixels. Every other
   * size is derived from this one — it is a reference, not a maximum.
   *
   * 512, WHICH IS WHAT THE HERO ACTUALLY MEASURES, not the 620 it is declared
   * with. The CSS caps it at min(40vw, 76svh, 680px). Anchoring on the declared
   * number made k = 512/620 = 0.83 for the hero itself, which quietly thinned
   * the one instance whose density was already right — the filaments visibly
   * separated and the surface stopped reading as a surface. The reference has to
   * be the size the approved look was approved AT.
   */
  referenceSize: 512,

  /** Latitude rings at the reference size. Rows are in the buffer; the flow field curves them. */
  bands: 58,
  /** Points around the equator at the reference size. */
  along: 300,

  /**
   * Dot diameter in CSS pixels at the object's centre plane.
   *
   * ABSOLUTE, not proportional to the object. Constant dot size plus constant
   * spacing is what makes two objects read as the same material — like one
   * halftone screen over two different sized pictures. Scaling the dots with the
   * object instead would make the small one a finer, more delicate grain, which
   * is a different surface, which is the thing being fixed.
   */
  dot: 1.95,

  /** Global alpha multiplier. One value, so no instance can be quietly fainter. */
  opacity: 1,

  /** Distance the camera sits from the object, in object radii. */
  camDist: 5,

  /** Retina is worth it; beyond 2 is pure fill cost on a page of dots. */
  maxPixelRatio: 2,
} as const;

/**
 * Lattice resolution for a given rendered size.
 *
 * Bands and along-count each scale LINEARLY with size, so the total point count
 * scales with size squared — which is how the projected area scales, so
 * points-per-pixel comes out constant. That is the whole fix: at 260px this
 * yields roughly 1,900 points against the hero's 11,000, and the two surfaces
 * have the same grain.
 *
 * THE LOWER CLAMP ON k IS DELIBERATELY LOOSE. An earlier version floored it at
 * 0.34, which sounds harmless and was not: the sources organism actually renders
 * at 187px against the hero's 512, so its true k is 0.30 — under the floor. The
 * clamp silently forced it 13% denser in each direction, which is 1.29x the area
 * density, and the instances still did not match after the main fix. The floor
 * that matters is the absolute one below, which stops a very small instance
 * degenerating into a wireframe; k only needs a guard against zero and negative.
 *
 * The upper clamp is real: past about 1.35 a large instance buys density nobody
 * can resolve at the cost of a buffer nobody wants to upload.
 */
export function latticeFor(size: number): { bands: number; along: number } {
  const k = Math.min(1.35, Math.max(0.05, size / SURFACE.referenceSize));
  return {
    bands: Math.max(16, Math.round(SURFACE.bands * k)),
    along: Math.max(44, Math.round(SURFACE.along * k)),
  };
}
