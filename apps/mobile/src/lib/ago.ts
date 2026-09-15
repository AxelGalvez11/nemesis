/** "Just now", "12 min ago", "3 h ago", "Yesterday", "4 days ago", then a short date. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
