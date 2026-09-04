// The long-press reply menu's timestamp line ("Today, 7:26 PM") — PURE, no React, no I/O.
// Split out of CanvasReplyMenu.tsx so the day-boundary logic (today / yesterday / a real date)
// has its own test rather than being eyeballed off a live clock.

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Today, 7:26 PM" / "Yesterday, 7:26 PM" / "Mon, Jan 5, 7:26 PM" — the reference's own three
 *  shapes (IMG_6561), decided by how many midnights sit between `iso` and `now`. Invalid input
 *  returns "" rather than "Invalid Date", so a bad moment id never lands garbled text on screen. */
export function turnTimestamp(iso: string, now: number = Date.now()): string {
  const then = new Date(iso);
  const thenMs = then.getTime();
  if (Number.isNaN(thenMs)) return "";
  const time = then.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dayGap = Math.round((startOfDay(now) - startOfDay(thenMs)) / DAY_MS);
  if (dayGap === 0) return `Today, ${time}`;
  if (dayGap === 1) return `Yesterday, ${time}`;
  const date = then.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${date}, ${time}`;
}
