// Pure helpers for the Settings sheet's identity header (IMG_6548: avatar +
// name, then the Account card's plan value) — dependency-free like
// relative-time.ts so this Deno-tests without pulling in react-native or the
// Supabase client. settings.tsx is the one caller; billing.ts's PlanCode is a
// string union re-declared loosely here (as `string`) rather than imported,
// the same reasoning studies-flags-style pure modules use elsewhere in this
// tree — importing api/billing.ts here would drag react-native's URL/fetch
// globals into a Deno test run.

/** The name shown under the avatar. Prefers the account's stored full name;
 *  falls back to a humanized email local-part (same rule settings.tsx already
 *  used inline before this pass — kept identical so no student's displayed
 *  name changes). */
export function settingsDisplayName(fullName: string | null | undefined, email: string): string {
  const trimmedName = typeof fullName === "string" ? fullName.trim() : "";
  if (trimmedName) return trimmedName;
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return local || "Student";
}

/** Up to two initials for the avatar circle — "Axel Galvez" -> "AG", matching
 *  the reference (IMG_6548's "AG" avatar). A single-word name takes its first
 *  two letters ("nemesis" -> "NE"); an empty name is "" so the caller can fall
 *  back to a generic mark instead of drawing a blank circle. */
export function settingsInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const first = words[0]?.[0] ?? "";
  const second = words[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

/**
 * The Subscription row's value — one word, matching the reference's "Plus".
 *
 * Nemesis sells one product (src/lib/purchases-logic.ts: "THERE IS NOTHING
 * LEFT TO RANK... any recognised entitlement now grants the whole thing").
 * `get_my_entitlements`'s `plan` column still carries the wider PlanCode union
 * (free/nemesis/plus/pro/max/student/professional/trial/enterprise) because
 * old rows and replayed webhooks use the old names — this collapses all of
 * that to what a student should actually read: are they paying, or not.
 */
export function planDisplayName(plan: string): string {
  const normalized = plan.trim().toLowerCase();
  if (!normalized || normalized === "free") return "Free";
  if (normalized === "trial") return "Trial";
  if (normalized === "enterprise") return "Enterprise";
  // Every other known code (nemesis/plus/pro/max/student/professional) is the
  // one paid product under an old or dashboard-experiment name.
  return "Nemesis";
}
