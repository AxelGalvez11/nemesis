/**
 * 🔴 THE NEW APP DOES NOT SHOW OLD DATA (owner, 2026-09-15: "dont sync to old data").
 *
 * Everything made before the rebuilt app started (old chats from July and August, the 22 old decks, the
 * pages copied in from the old library on 2026-09-11) stays in the database untouched but is not shown.
 * What is made from here on, on the phone or on the web, is shown and stays in sync.
 */
export const NEW_APP_SINCE = Date.parse("2026-09-15T00:00:00Z");

export function isFresh(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= NEW_APP_SINCE;
}

/** A page icon is a plain emoji string on some pages and `{ emoji }` (or an image object) on others. */
export function iconOf(icon: unknown, fallback = "📄"): string {
  if (typeof icon === "string" && icon.trim()) return icon;
  if (icon && typeof icon === "object") {
    const emoji = (icon as { emoji?: unknown }).emoji;
    if (typeof emoji === "string" && emoji.trim()) return emoji;
  }
  return fallback;
}
