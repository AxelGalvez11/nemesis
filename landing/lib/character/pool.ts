// How many decor nodes the renderer preallocates.
//
// 🔴 SEPARATE FROM THE COMPONENT ON PURPOSE. The guard that keeps these honest runs in
// plain Node, and importing the renderer would drag a CSS import and React into it. A
// constant that cannot be tested without a DOM is a constant nobody checks.
//
// The numbers are measured, not chosen: `../character.test.ts` drives every ordered pair
// of animations through its cross-fade — which is where the worst case actually lives,
// since a fade emits BOTH states' decor at once — and fails if the pool is too small to
// hold what came out, or wastefully larger than it needs to be.
//
// 🔴 SHARED, NOT WEB-LOCAL, SINCE THE PHONE GOT A CHARACTER TOO. Both renderers
// preallocate their pools from these constants. Two copies of "8" would hold until one
// animation grew a sixth particle, at which point one screen would show the explosion and
// the other would show it with a piece missing — and nothing would fail.

/** Particles, glyph dots, the thinking trio. Measured worst case: 5. */
export const DOT_POOL = 8;
/** Orbit rings, the comet's ribbons, the swoosh. Measured worst case: 10. */
export const ARC_POOL = 12;
/** Every gradient the engine emits has exactly this many stops. */
export const ARC_STOPS = 3;
