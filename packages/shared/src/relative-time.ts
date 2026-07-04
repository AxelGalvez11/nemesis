// Relative "time until" for the Scheduled surface ("in 2 h", "in 3 d", "due now"). PURE. `now` is
// injectable so it's deterministically testable. Rounds down within a unit (1 h 59 m → "in 1 h"), and
// a past/now/invalid instant reads "due now" (or "" for an unparseable string).

export function timeUntil(iso: string, now: Date = new Date()): string {
  if (!iso) return "";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "";
  const ms = target - now.getTime();
  if (ms <= 0) return "due now";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `in ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `in ${hr} h`;
  const day = Math.floor(hr / 24);
  return `in ${day} d`;
}
