// How long a turn spent thinking, as a person would say it. Pure and dependency-
// free so the tests can reach it — components/ThoughtTrail.tsx pulls in React
// Native and the theme, which a unit test cannot load.

/** "12s" / "1m" / "1m 4s". Never negative, however the clock behaved. */
export function thoughtDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}
