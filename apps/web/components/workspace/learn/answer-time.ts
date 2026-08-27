// How long ago an answer arrived, in the shortest true form.
//
// 🔴 PURE AND ON ITS OWN so both the row and its test can reach it without a DOM. It is the one
// piece of `reply-actions.tsx` that is worth asserting directly rather than through the markup.
//
// 🔴 IT NEVER SAYS "0 minutes ago". Below a minute the honest word is "just now", and a counter
// that opens at zero reads as broken.

export function timeSince(atISO: string, now: number): string {
  const then = Date.parse(atISO);
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
