// Tiny in-memory stale-while-revalidate cache for list pages. Route components (Monitor, Reports)
// remount on navigation — unlike the persistent AppShell — so without this, returning to a list you
// just saw re-flashes a skeleton and refetches from scratch. We seed the page's state from the last
// result for an INSTANT paint, then revalidate in the background and overwrite. Module-level, so it
// lives for the single-page-app session and is dropped on a full reload (never dangerously stale across
// sessions). Lists only — never cache a single detail record, which should always render fresh.

const store = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, value);
}
