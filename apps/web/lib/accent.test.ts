import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ACCENT_COLORS, ACCENT_LABELS, ACCENT_PREFERENCES, ACCENT_PROPERTIES, accentFill, accentGlyph, accentPrePaintScript, DEFAULT_ACCENT_SWATCH, isAccent, normalizeStoredAccent } from "./accent";
import { characterInk } from "./accent";

test("the palette is the owner's twelve, in the screenshot's order", () => {
  // Two rows of six, reading left to right. Grey is eleventh and is "default".
  assert.deepEqual([...ACCENT_PREFERENCES], [
    "black", "brown", "red", "orange", "yellow", "green",
    "teal", "blue", "purple", "pink", "default", "cream",
  ]);
  for (const id of ACCENT_PREFERENCES) assert.ok(ACCENT_LABELS[id], `${id} has no label`);
});

// 🔴 THE HUES ARE THE SCREENSHOT'S, UNADJUSTED. The palette before this one pulled every
// colour darker than its swatch so a white glyph would fit, which meant the dot in the
// picker was never the colour you got. Pinned by hand so a future "small tweak" to make
// something easier to read has to be a deliberate change to the owner's palette.
test("every hue is exactly the one the owner gave", () => {
  assert.deepEqual(ACCENT_COLORS, {
    black: "#0a0a0c",
    brown: "#8b5e3c",
    red: "#e8483f",
    orange: "#f08a24",
    yellow: "#f0b429",
    green: "#3ecf8e",
    teal: "#2fbfa0",
    blue: "#3b93f0",
    purple: "#8b5cf6",
    pink: "#e152b0",
    cream: "#f1efe9",
  });
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

test("a stored id from a retired palette reads as Default rather than failing", () => {
  for (const old of ["crimson", "grey"]) {
    assert.equal(normalizeStoredAccent(old), "default", old);
    assert.ok(isAccent(normalizeStoredAccent(old)), `${old} does not survive validation`);
  }
});

// 🔴 A NAME THAT SURVIVED KEEPS ITS SETTING. Six ids carried over from the old palette with
// new hexes behind them; someone who picked Blue still has Blue rather than being silently
// reset. This is the guard on that, and it is why the ids were not renamed to match the
// French names the hues came from.
test("every id the old palette used is still a valid choice", () => {
  for (const old of ["blue", "green", "yellow", "pink", "orange", "purple", "default"]) {
    assert.ok(isAccent(old), `${old} stopped being a choice`);
  }
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

test("🔴 every accent carries a readable glyph, in BOTH themes", () => {
  // The fill, not the hue: three of the twelve are nudged by `accentFill` before they are
  // ever painted onto a control, and the raw purple is one of them — at 4.23:1 against both
  // white and near-black it sits in the gap between the two and cannot carry either.
  for (const [accent, hue] of Object.entries(ACCENT_COLORS)) {
    for (const dark of [false, true]) {
      const fill = accentFill(hue, dark);
      const ratio = contrast(fill, accentGlyph(fill));
      assert.ok(ratio >= 4.5, `${accent} on ${dark ? "dark" : "light"} (${fill}) glyph ${ratio.toFixed(2)}:1`);
    }
  }
});

test("🔴 every accent is visible against the page it sits on, in BOTH themes", () => {
  // Black on a pure-black page reads 1.02:1 and cream on white reads 1.15:1 — the button
  // disappears and only its arrow is left, which reads as a rendering fault. This is the
  // guard that made `accentFill` necessary at all.
  for (const [accent, hue] of Object.entries(ACCENT_COLORS)) {
    for (const [dark, ground] of [[false, "#ffffff"], [true, "#000000"]] as const) {
      const ratio = contrast(accentFill(hue, dark), ground);
      assert.ok(ratio >= 1.79, `${accent} on ${dark ? "dark" : "light"} is ${ratio.toFixed(2)}:1 against the page`);
    }
  }
});

// 🔴 THE CLAIM THAT MAKES THE PICKER HONEST, AND IT IS THE ONE WORTH PINNING BY NAME.
// `accentFill` is allowed to move a hue, so without this it could quietly grow into the
// blanket "darken everything until it is safe" the previous palette used — and then the dot
// stops matching the button again. Exactly three colours may move, and only where they are
// genuinely invisible: black on dark, cream on light, purple in both (its glyph gap).
test("🔴 nine of the twelve are pixel-exact in both themes", () => {
  const moved: string[] = [];
  for (const [accent, hue] of Object.entries(ACCENT_COLORS)) {
    for (const dark of [false, true]) {
      if (accentFill(hue, dark) !== hue) moved.push(`${accent}:${dark ? "dark" : "light"}`);
    }
  }
  assert.deepEqual(moved.sort(), ["black:dark", "cream:light", "purple:dark", "purple:light"]);
});

test("the glyph is always the better of the two, never a fixed choice", () => {
  for (const hue of Object.values(ACCENT_COLORS)) {
    for (const dark of [false, true]) {
      const fill = accentFill(hue, dark);
      const chosen = accentGlyph(fill);
      const other = chosen === "#ffffff" ? "#1a1a1a" : "#ffffff";
      assert.ok(contrast(fill, chosen) >= contrast(fill, other), fill);
    }
  }
});

// 🔴 THE POINT OF COMPUTING IT. Most of this palette wants a DARK arrow — hard-coding white,
// which is the obvious choice for a coloured button, puts yellow at 1.86:1 and cream at
// 1.15:1, both unreadable.
test("most accents take a dark glyph, not a white one", () => {
  const white = Object.entries(ACCENT_COLORS)
    .filter(([, hue]) => accentGlyph(accentFill(hue, false)) === "#ffffff")
    .map(([accent]) => accent);
  assert.deepEqual(white.sort(), ["black", "brown", "purple"]);
});

// ── One colour, two surfaces ────────────────────────────────────────────────

test("🔴 the character and the send button wear exactly the same colour", () => {
  // Owner 2026-08-23: "the send button and the mascot should be following the same accent
  // colour." The two are computed in different files — lib/accent.ts for the control,
  // lib/character/look.ts for the character — and this is what stops them drifting. It
  // matters more now than it did with six flat hues, because `accentFill` moves three of
  // them and a version of `characterInk` that skipped that step would put a visible button beside
  // an invisible character.
  for (const [accent, hue] of Object.entries(ACCENT_COLORS)) {
    for (const theme of ["light", "dark"] as const) {
      assert.equal(characterInk(accent, theme === "dark"), accentFill(hue, theme === "dark"), `${accent} on ${theme}`);
    }
  }
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
  for (const property of ["--accent-fill-light", "--accent-fill-dark", "--accent-glyph-light", "--accent-glyph-dark"]) {
    assert.ok(ACCENT_PROPERTIES.includes(property), `${property} is not in the set Default clears`);
  }
});

test("🔴 the stylesheet consumes BOTH renderings, one per theme", () => {
  // 🔴 THIS IS THE HALF THAT USED TO BE UNTESTABLE, AND IT IS WHERE THE CHAIN CAN BREAK
  // SILENTLY. The accent no longer writes `--ui-action` itself — it writes a light value and
  // a dark value and lets the theme blocks choose, which is the only way one inline write can
  // serve both themes without knowing which is on. If a block stops reading its variable, the
  // accent still applies perfectly in the OTHER theme, so the picker looks like it works and
  // half the product quietly ignores it.
  //
  // Calibration: drop `var(--accent-fill-dark, …)` from the dark block and this reddens.
  const css = read("../app/styles/desktop-ui.css");
  for (const property of ["--ui-action", "--theme-primary", "--theme-midground", "--theme-warm"]) {
    assert.ok(css.includes(`${property}: var(--accent-fill-light,`), `light's ${property} ignores the accent`);
    assert.ok(css.includes(`${property}: var(--accent-fill-dark,`), `dark's ${property} ignores the accent`);
  }
  assert.ok(css.includes("--ui-action-glyph: var(--accent-glyph-light,"), "light's glyph ignores the accent");
  assert.ok(css.includes("--ui-action-glyph: var(--accent-glyph-dark,"), "dark's glyph ignores the accent");
});

test("🔴🔴🔴 the character is the accent, and there is no second colour preference", () => {
  // Owner 2026-08-21: "make the character follow the accent color". It used to carry its own
  // twelve-swatch palette with its own picker and its own stored preference, so the app held
  // two colour settings that could disagree — and whose defaults did. The mapping itself —
  // accent id in, accent hex out, the theme's neutral pair on Default — is pinned in
  // lib/character/character.test.ts; what THIS guards is the wiring around it: the body is
  // painted from that one mapping, and no second stored colour grows back beside it.
  assert.match(read("../components/avatar/nemesis-avatar.tsx"), /characterInk\(state\.accent, dark\)/);
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

