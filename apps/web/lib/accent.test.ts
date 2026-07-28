import assert from "node:assert/strict";
import test from "node:test";

import { ACCENT_COLORS, ACCENT_PREFERENCES, DEFAULT_ACCENT_SWATCH, isAccent, normalizeStoredAccent } from "./accent";

test("the palette is the owner's seven, in that order", () => {
  assert.deepEqual([...ACCENT_PREFERENCES], ["default", "blue", "green", "yellow", "pink", "orange", "purple"]);
});

test("every accent but Default carries a colour", () => {
  for (const accent of ACCENT_PREFERENCES) {
    if (accent === "default") continue;
    assert.match(ACCENT_COLORS[accent] ?? "", /^#[0-9a-f]{6}$/, accent);
  }
  assert.equal(Object.keys(ACCENT_COLORS).length, ACCENT_PREFERENCES.length - 1, "no orphan colours");
});

// Default is absent from ACCENT_COLORS ON PURPOSE: applyAccent removes the
// inline override for it, so the CSS light/dark pair applies. Adding it here
// would pin one grey across both themes and make it invisible in one of them.
test("Default is not a runtime colour", () => {
  assert.ok(!(("default" as string) in ACCENT_COLORS));
});

test("a stored crimson from before the red was retired reads as Default", () => {
  assert.equal(normalizeStoredAccent("crimson"), "default");
  assert.ok(isAccent(normalizeStoredAccent("crimson")), "and survives validation");
});

test("anything else stored is passed through and validated on its own merits", () => {
  assert.equal(normalizeStoredAccent("blue"), "blue");
  assert.equal(normalizeStoredAccent(null), null);
  assert.ok(isAccent("purple"));
  assert.ok(!isAccent("chartreuse"));
  assert.ok(!isAccent(null));
});

// Retiring the red means no accent may still BE the red.
test("no accent in the palette is the old crimson", () => {
  for (const color of [...Object.values(ACCENT_COLORS), DEFAULT_ACCENT_SWATCH]) {
    assert.ok(!/^#(cc1f33|ff2740|e11d48)$/i.test(color), color);
  }
});

test("the Default swatch is a true grey", () => {
  const [, r, g, b] = /^#(..)(..)(..)$/.exec(DEFAULT_ACCENT_SWATCH) ?? [];
  assert.equal(r, g);
  assert.equal(g, b);
});
