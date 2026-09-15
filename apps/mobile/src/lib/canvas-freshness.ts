// Pure helper — PURE, no React, no I/O. Split out rather than added to lib/relative-time.ts,
// which is not in this pass's edit list (see AGENTS handoff for apps/mobile/ios-catchup).
//
// The drawer's "Recents" rows carry no timestamp at all (the reference, IMG_6531, shows a
// plain title and nothing else) EXCEPT a small green dot on a row updated in the last five
// minutes — measured off IMG_6531 (crop_recents.png): the dot is ~10pt across, coloured the
// same green as the reference's accent (#53B559, i.e. this app's light-mode `c.accent`), not
// the 6pt the brief guessed. This file is just the predicate; AppDrawer.tsx supplies the size
// and colour token.

const FRESH_WINDOW_MS = 5 * 60_000;

/** True when `iso` is within the last five minutes of `now`. Clock skew that puts `iso`
 *  slightly in the future still reads as fresh (clamped to 0), matching shortRelativeTime's
 *  own `Math.max(0, ...)` guard rather than treating it as stale. */
export function isFresh(iso: string, now: number = Date.now()): boolean {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  const ms = Math.max(0, now - then);
  return ms < FRESH_WINDOW_MS;
}
