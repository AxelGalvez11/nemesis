import assert from "node:assert/strict";
import test from "node:test";

import { ACCENT_COLORS, ACCENT_PREFERENCES, accentGlyph, DEFAULT_ACCENT_SWATCH, isAccent, normalizeStoredAccent } from "./accent";

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

// ── the glyph that rides on an accent fill ───────────────────────────────────
//
// The send button is the primary action of the whole product, and since the accent
// picker started moving --ui-action its foreground moves too. These are the tests that
// stop a new accent shipping an unreadable arrow.

/** WCAG 2.1, duplicated here on purpose: a test that reuses the implementation's own
 *  maths cannot catch the implementation's own maths being wrong. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const channel = (offset: number): number => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("every accent's glyph clears WCAG AA on its own fill", () => {
  for (const [accent, color] of Object.entries(ACCENT_COLORS)) {
    const ratio = contrast(color, accentGlyph(color));
    assert.ok(ratio >= 4.5, `${accent} (${color}) glyph contrast ${ratio.toFixed(2)}:1`);
  }
});

test("the glyph is always the better of the two, never a fixed choice", () => {
  for (const color of Object.values(ACCENT_COLORS)) {
    const chosen = accentGlyph(color);
    const other = chosen === "#ffffff" ? "#1a1a1a" : "#ffffff";
    assert.ok(contrast(color, chosen) >= contrast(color, other), color);
  }
});

// 🔴 THE POINT OF COMPUTING IT. Five of the six accents want a DARK arrow — hard-coding
// white (the obvious reading of the palette comment) would put four of them below AA.
test("purple is the only accent that takes a white glyph", () => {
  const white = Object.entries(ACCENT_COLORS)
    .filter(([, color]) => accentGlyph(color) === "#ffffff")
    .map(([accent]) => accent);
  assert.deepEqual(white, ["purple"]);
});
