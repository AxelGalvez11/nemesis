// The two things a URL may still say about the teaching-policy runtime.
//
// 🔴 NEITHER OF THEM IS "OWN THIS CANVAS". Which runtime a canvas gets is decided from what its
// sources contain — `policyOwnsCanvas` — and that is the whole point of the previous step: routing
// on a query parameter is routing on what somebody typed. What survives here is an emergency stop
// and a deliberate, self-declaring bypass, and the difference between a bypass and an opt-in is the
// reason this file exists rather than a `=== "1"` in a page component.
//
//   * an OPT-IN claims to BE ownership. `?policy=1` did, which is why a forced session and a real
//     one were indistinguishable and "did ownership work?" could not be answered by looking.
//   * a BYPASS says ownership was SKIPPED. It is carried through the runtime under its own name,
//     and the surface says so on screen, so a test drive can never be mistaken for the product
//     working.

/** What a URL asked for, if anything. `null` is the ordinary case: let coverage decide. */
export type PolicyOverride =
  /** Force the legacy runtime whatever the sources contain. The emergency stop. */
  | "off"
  /** Run the policy on a canvas it does not own. For exercising it deliberately; never ordinary. */
  | "force"
  | null;

/**
 * Read the `policy` query parameter.
 *
 * 🔴 A PURE FUNCTION WITH ITS OWN TESTS, RATHER THAN AN EXPRESSION INSIDE A PAGE. The last version
 * of this decision was a `params.get("policy") === "1"` that nothing could test, and it was guarded
 * only by scanning the file for a string. Parsing here means the rules below are asserted directly.
 */
export function policyOverrideFrom(value: string | null): PolicyOverride {
  if (value === "0") return "off";
  if (value === "force") return "force";
  // 🔴 EVERYTHING ELSE IS THE ORDINARY PATH — INCLUDING "1". The old opt-in is dead, and a
  // bookmarked `?policy=1` must now behave exactly like a bare URL. Quietly keeping it alive would
  // leave a second, untested way into the runtime that nobody remembers is there.
  return null;
}

/** Whether the runtime may run at all. `off` is the only answer that stops it. */
export function policyAllowed(override: PolicyOverride): boolean {
  return override !== "off";
}

/** Whether ownership is being skipped rather than satisfied. */
export function policyForced(override: PolicyOverride): boolean {
  return override === "force";
}
