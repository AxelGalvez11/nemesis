import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { policyAllowed, policyForced, policyOverrideFrom } from "./policy-override";

test("a bare URL lets coverage decide", () => {
  assert.equal(policyOverrideFrom(null), null);
  assert.equal(policyAllowed(null), true);
  assert.equal(policyForced(null), false);
});

test("🔴 the old ?policy=1 opt-in is dead, and reads as an ordinary URL", () => {
  // A bookmarked link from the gated step must not be a second, untested way into the runtime.
  // Ownership is decided from the sources for it exactly as for a bare URL.
  assert.equal(policyOverrideFrom("1"), null);
  assert.equal(policyForced(policyOverrideFrom("1")), false);
  assert.equal(policyAllowed(policyOverrideFrom("1")), true);
});

test("?policy=0 is the emergency stop", () => {
  assert.equal(policyOverrideFrom("0"), "off");
  assert.equal(policyAllowed("off"), false);
  assert.equal(policyForced("off"), false);
});

test("?policy=force bypasses ownership without claiming to satisfy it", () => {
  assert.equal(policyOverrideFrom("force"), "force");
  assert.equal(policyAllowed("force"), true);
  assert.equal(policyForced("force"), true);
});

test("anything unrecognised is the ordinary path, not a guess", () => {
  for (const value of ["", "true", "yes", "FORCE", "2", "on"]) {
    assert.equal(policyOverrideFrom(value), null, `${value} must not mean anything`);
  }
});

test("🔴 the page delegates the decision rather than re-inlining it", () => {
  // The whole reason this is a function is that `params.get("policy") === "1"` could not be tested.
  // A second copy of the rule in the page would be a second set of rules by the first edit.
  const page = readFileSync(new URL("../../app/(workspace)/learn/page.tsx", import.meta.url), "utf8");
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(code.includes("policyOverrideFrom("), "the page must parse the parameter through one function");
  assert.equal(/get\("policy"\)\s*[=!]==/.test(code), false, "no comparison against the raw value");
});
