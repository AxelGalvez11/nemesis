// Deno contract tests for the theme system. Run: deno test --no-check apps/mobile/src/theme/theme.test.ts
//
// These don't test "does it look nice" — they lock the CONTRACT that keeps the
// design system from silently drifting: both modes define every role, every
// evidence grade resolves to a real color, and the brand primary isn't the same as
// the background (a class of regression that would make buttons invisible).
import { assert, assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { darkTheme, evidenceGradeColor, lightTheme, onColor, type Theme, type ThemeColors, themeFor } from "./theme.ts";
import { EVIDENCE_GRADES, slate } from "./tokens.ts";

const HEX_OR_RGBA = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s]+\))$/i;

const ROLE_KEYS: (keyof ThemeColors)[] = [
  "background", "surface", "surfaceAlt", "border", "borderStrong",
  "text", "textMuted", "textSubtle", "inverseText",
  "primary", "primaryHover", "primaryMuted", "onPrimaryMuted", "focusRing",
  "danger", "dangerMuted", "success", "warning",
  "inputBg", "inputBorder", "placeholder", "overlay",
];

function checkTheme(theme: Theme, label: string) {
  for (const key of ROLE_KEYS) {
    const v = theme.color[key];
    assertExists(v, `${label}.color.${key} missing`);
    assert(HEX_OR_RGBA.test(v), `${label}.color.${key}="${v}" is not a hex/rgba color`);
  }
}

Deno.test("light + dark define every semantic role as a valid color", () => {
  checkTheme(lightTheme, "light");
  checkTheme(darkTheme, "dark");
});

Deno.test("primary is visibly distinct from background (buttons can't vanish)", () => {
  for (const t of [lightTheme, darkTheme]) {
    assertNotEquals(t.color.primary.toLowerCase(), t.color.background.toLowerCase(), `${t.mode}: primary==background`);
    assertNotEquals(t.color.text.toLowerCase(), t.color.background.toLowerCase(), `${t.mode}: text==background`);
  }
});

Deno.test("light and dark are actually different (background flips)", () => {
  assertNotEquals(lightTheme.color.background, darkTheme.color.background);
  assertEquals(lightTheme.mode, "light");
  assertEquals(darkTheme.mode, "dark");
});

Deno.test("every one of the 7 evidence grades resolves to a color in both modes", () => {
  for (const t of [lightTheme, darkTheme]) {
    for (const g of EVIDENCE_GRADES) {
      const c = evidenceGradeColor(t, g);
      assert(HEX_OR_RGBA.test(c), `${t.mode}: grade ${g} → "${c}" invalid`);
    }
  }
});

Deno.test("evidenceGradeColor falls back to unknown for an unrecognized grade (never undefined)", () => {
  assertEquals(evidenceGradeColor(lightTheme, "bogus_grade"), lightTheme.grade.unknown);
});

Deno.test("themeFor maps mode → theme", () => {
  assertEquals(themeFor("light"), lightTheme);
  assertEquals(themeFor("dark"), darkTheme);
});

Deno.test("onColor picks dark ink on bright backgrounds, white on dark ones", () => {
  // bright dark-mode grade colors → dark ink
  assertEquals(onColor("#34D399"), slate[950]); // emerald400
  assertEquals(onColor("#FBBF24"), slate[950]); // amber400
  assertEquals(onColor("#94A3B8"), slate[950]); // slate400 (light not_applicable)
  // dark/saturated backgrounds → white
  assertEquals(onColor("#059669"), "#FFFFFF"); // emerald600
  assertEquals(onColor("#DC2626"), "#FFFFFF"); // red600
  assertEquals(onColor("#0B1220"), "#FFFFFF"); // near-black
  // non-hex (rgba) falls back to white, never undefined
  assertEquals(onColor("rgba(0,0,0,0.5)"), "#FFFFFF");
});

Deno.test("every evidence grade gets readable ink in both modes (badge text never unreadable)", () => {
  for (const t of [lightTheme, darkTheme]) {
    for (const g of EVIDENCE_GRADES) {
      const ink = onColor(evidenceGradeColor(t, g));
      assert(ink === "#FFFFFF" || ink === slate[950], `${t.mode}/${g}: unexpected ink ${ink}`);
    }
  }
});
