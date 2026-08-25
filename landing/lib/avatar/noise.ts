// 🔴 COPIED FROM apps/web — DO NOT EDIT HERE. Run `pnpm --filter @pharmaorb/web character:sync`.
// Deterministic pseudo-randomness.
//
// EVERYTHING HERE IS A FUNCTION OF ITS ARGUMENTS AND NOTHING ELSE. No `Math.random`, no
// seeded generator carrying state between calls, no `Date.now`. That is the constraint the
// whole engine rests on: `frameAt(t)` has to return the same frame for the same `t` however
// many times it is asked, in whatever order, or the contact sheets, the tests and the
// screenshots all become fiction.
//
// 🔴 THIS IS A COPY OF `lib/mascot/noise.ts`, ON PURPOSE. `lib/avatar` has to stand alone:
// the landing site has its own workspace, its own Turbopack root, and Vercel deploys it
// without the rest of the repo, so anything the avatar imports has to be inside the avatar.
// A one-function dependency on a neighbouring engine is what would have made the copy over
// there drag `lib/mascot` with it.

/** Integer hash → 0..1. Cheap, well-mixed enough for jitter and per-shard variance. */
export function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Same, signed: -1..1. */
export const hashSigned = (n: number): number => hash01(n) * 2 - 1;
