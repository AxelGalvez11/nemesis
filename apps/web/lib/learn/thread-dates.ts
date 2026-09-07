// The line between turns that says when they happened: ChatGPT Work's "Yesterday 11:42 PM" /
// "Today 4:03 PM" (measured 2026-09-06, docs/chatgpt-work-chat-reference.md §1). One line before
// the first turn, and again whenever more than half an hour has passed since the turn before, so a
// conversation picked up the next day says so and a quick back-and-forth does not.

const GAP_MS = 30 * 60 * 1000;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today 4:03 PM", "Yesterday 11:42 PM", or "Sep 4, 11:42 PM"; null when no line is due. */
export function dateSeparator(previousAt: string | null, at: string, now: Date = new Date()): string | null {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  if (previousAt) {
    const before = new Date(previousAt);
    if (!Number.isNaN(before.getTime()) && when.getTime() - before.getTime() < GAP_MS) return null;
  }
  const time = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay(when, now)) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(when, yesterday)) return `Yesterday ${time}`;
  const day = when.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}
