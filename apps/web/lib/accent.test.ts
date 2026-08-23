import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ACCENT_COLORS, ACCENT_PREFERENCES, ACCENT_PROPERTIES, accentGlyph, accentPrePaintScript, DEFAULT_ACCENT_SWATCH, isAccent, normalizeStoredAccent } from "./accent";

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

// ── The accent reaches every surface that claims to carry it ────────────────

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

test("🔴🔴 the accent is resolved BEFORE first paint, not after hydration", () => {
  // Owner 2026-08-21: "there is a discrepancy between the color chosen in settings and the
  // chat composer send button". It was applied only from ThemeProvider's mount effect, so
  // every load painted the send button in the DEFAULT accent and swapped it once React came
  // up — long enough on the Canvas to read as "the setting did not take".
  //
  // Calibration: drop `accentPrePaintScript()` from the layout's script and this reddens.
  assert.match(read("../app/layout.tsx"), /accentPrePaintScript\(\)/);
  const script = accentPrePaintScript();
  for (const property of ACCENT_PROPERTIES) assert.ok(script.includes(property), property);
  for (const color of Object.values(ACCENT_COLORS)) assert.ok(script.includes(color), color);
});

test("🔴🔴 and the pre-paint and post-hydration values come from ONE definition", () => {
  // Two copies of the table is how the accent ends up flickering to a different colour one
  // frame in — correct immediately afterwards, and so the hardest kind of bug to catch.
  //
  // Calibration: inline the hexes into either caller and this reddens.
  assert.match(read("../components/theme-provider.tsx"), /accentProperties\(accent\)/);
  assert.ok(
    !/ACCENT_COLORS\[/.test(read("../components/theme-provider.tsx")),
    "the provider builds its own copy of the accent's properties",
  );
});

test("🔴 Default clears every property an accent can set", () => {
  // Driven off ACCENT_PROPERTIES rather than a hand-written list, so a property added to
  // `accentProperties` cannot be left behind and stick after a switch back to Default.
  assert.match(read("../components/theme-provider.tsx"), /for \(const property of ACCENT_PROPERTIES\) root\.style\.removeProperty/);
  assert.ok(ACCENT_PROPERTIES.includes("--ui-action"), "the send button's fill is not in the set");
});

test("🔴🔴🔴 the character is the accent, and there is no second colour preference", () => {
  // Owner 2026-08-21: "make the character follow the accent color". It used to carry its own
  // twelve-swatch palette with its own picker and its own stored preference, so the app held
  // two colour settings that could disagree — and whose defaults did: the character's was
  // `encre` (#0a0a0c), a near-invisible smudge on the black theme.
  //
  // Calibration: point `--bloub-ink` at anything but the accent, or give the character back a
  // stored colour, and this reddens.
  assert.match(read("../components/bloub/bloub.css"), /--bloub-ink:\s*var\(--ui-action\)/);
  assert.match(read("../components/bloub/bloub-bot.tsx"), /getPropertyValue\("--bloub-ink"\)/);
  for (const file of ["../components/theme-provider.tsx", "../components/SettingsSurface.tsx"]) {
    assert.ok(!/bloubColor/.test(read(file)), `${file} still carries a second colour preference`);
  }
});

test("🔴 and it is --ui-action, the token the send button carries", () => {
  // The two part only on Default — `--theme-primary` is a neutral graphite there while
  // `--ui-action` is the product's own green. Since the complaint being answered was the
  // character and the send button showing different colours, they read the same token.
  const composer = read("../components/workspace/learn/composer-controls.tsx");
  assert.match(composer, /bg-\(--ui-action\)/, "the send button no longer carries --ui-action");
});

test("🔴 a frozen character repaints when the accent or the theme moves", () => {
  // Both colours are CSS tokens resolved at paint time, which an animated bot picks up on its
  // next frame for free — but a `frozenAt` bot paints once from an effect, and nothing in its
  // dependency list moved when someone switched accent. The Settings preview would have sat in
  // the previous colour. (Already true of `--bloub-paper` and a theme switch; the accent only
  // made it visible.)
  const bot = read("../components/bloub/bloub-bot.tsx");
  assert.match(bot, /\}, \[still, frozenAt, state, shape, color, expression, paper, accent, theme\]\);/);
});
