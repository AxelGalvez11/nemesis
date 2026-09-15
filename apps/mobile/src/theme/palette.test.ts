// Deno unit tests (repo convention) for the theme engine's pure half.
// Run: deno test --no-check apps/mobile/src/theme/palette.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  accentSwatchHex,
  ACCENT_SWATCHES,
  buildColors,
  contrastRatio,
  DEFAULT_ACCENT_ID,
  normalizeAccentId,
} from "./palette.ts";

Deno.test("dark mode = pure black pages, pure white text (owner 2026-07-21)", () => {
  const colors = buildColors("dark", DEFAULT_ACCENT_ID);
  assertEquals(colors.bg, "#000000");
  assertEquals(colors.bg2, "#000000");
  assertEquals(colors.text, "#ffffff");
  assertEquals(colors.text2, "#ffffff");
  assertEquals(colors.text3, "#ffffff");
  // The default accent is a NEUTRAL GREY now (owner 2026-07-28 retired the
  // crimson), pinned to the web app's --theme-primary so both surfaces match.
  assertEquals(colors.accent, "#6e6e6e");
  assertEquals(colors.accentDim, "#8b8b8b");
  assertEquals(colors.accentDeep, "#585858");
  assertEquals(colors.onAccent, "#ffffff");
  assertEquals(colors.accentFaint, "rgba(110,110,110,0.12)");
  assertEquals(colors.accentLine, "rgba(110,110,110,0.35)");
  assertEquals(colors.glass, "rgba(233,234,238,0.045)");
  assertEquals(colors.line, "rgba(233,234,238,0.09)");
});

// 3.5, not 4.5: the owner asked for brighter accents on 2026-07-22, and the
// stricter floor was what forced the light-mode picks down into muddy territory.
// 3.5 still clears WCAG's 3:1 bar for UI components and large text. The status
// colors keep 4.5 in the test below — they carry warnings, so they stay strict.
// 🔴 THE LIGHT DEFAULT IS THE REFERENCE'S GREEN, MEASURED, AND IT DOES NOT CLEAR 3.5:1 ON WHITE
// (≈2.6:1). Owner, 2026-09-01: the phone matches the ChatGPT iPhone app one-to-one — "font spacing
// icons literally everything" — so the colour is the reference's, not a contrast-adjusted cousin.
// Every OTHER swatch is still synthesized and still clears the floor.
Deno.test("the light Default is the reference's green; every other accent clears 3.5:1", () => {
  const light = buildColors("light", DEFAULT_ACCENT_ID);
  assertEquals(light.accent, "#53b559");
  assertEquals(light.accentFaint, "#def3e5");
  assertEquals(light.onAccent, "#ffffff");
  for (const swatch of ACCENT_SWATCHES) {
    if (swatch.id === DEFAULT_ACCENT_ID) continue;
    for (const mode of ["dark", "light"] as const) {
      const colors = buildColors(mode, swatch.id);
      const ratio = contrastRatio(colors.accent, colors.bg);
      assertEquals(ratio >= 3.5, true, `${swatch.id} on ${mode} bg: ${ratio.toFixed(2)}`);
    }
  }
  const darkDefault = buildColors("dark", DEFAULT_ACCENT_ID);
  assertEquals(contrastRatio(darkDefault.accent, darkDefault.bg) >= 3.5, true);
});

Deno.test("status colours read on the light background; Delete is the reference's red exactly", () => {
  const light = buildColors("light", DEFAULT_ACCENT_ID);
  for (const key of ["warn", "info", "good"] as const) {
    const ratio = contrastRatio(light[key], light.bg);
    assertEquals(ratio >= 4.5, true, `${key} on light bg: ${ratio.toFixed(2)}`);
  }
  // Measured on IMG_6536 (the … menu's Delete row). Under 4.5:1 on white, kept anyway: one-to-one.
  assertEquals(light.danger, "#e0423b");
});

Deno.test("unknown accent ids fall back to the default swatch", () => {
  const colors = buildColors("dark", "not-a-swatch");
  assertEquals(colors.accent, buildColors("dark", DEFAULT_ACCENT_ID).accent);
});

// Measured off the owner's ChatGPT iPhone screenshots, 2026-09-01 (see palette.ts LIGHT_BASE).
Deno.test("light mode = the reference's measured palette", () => {
  const light = buildColors("light", DEFAULT_ACCENT_ID);
  assertEquals(light.bg, "#ffffff");
  assertEquals(light.bg2, "#ffffff");
  assertEquals(light.bgGrouped, "#f2f2f6");
  assertEquals(light.surface, "#f9f9f9");
  assertEquals(light.surface2, "#f3f3f3");
  assertEquals(light.text, "#0d0d0d");
  assertEquals(light.text2, "#8f8f8f");
  assertEquals(light.text3, "#8a8a8d");
  assertEquals(light.textHint, "#8e8e8e");
  assertEquals(light.blue, "#3a83f7");
  assertEquals(light.blueFaint, "#e8f3fe");
  assertEquals(contrastRatio(light.text, light.bg) >= 10, true);
});

Deno.test("dark mode keeps the flat white text with one hint tone; light mode has the reference's grey tiers", () => {
  const dark = buildColors("dark", DEFAULT_ACCENT_ID);
  assertEquals(dark.text, dark.text2);
  assertEquals(dark.text2, dark.text3);
  assertEquals(dark.textHint !== dark.text, true);
  const hint = contrastRatio(dark.textHint, dark.bg);
  assertEquals(hint > 1.5 && hint < contrastRatio(dark.text, dark.bg), true);
  const light = buildColors("light", DEFAULT_ACCENT_ID);
  // Secondary text is a real grey now (the reference's), sitting between the page and the body.
  for (const key of ["text2", "text3", "textHint"] as const) {
    const ratio = contrastRatio(light[key], light.bg);
    assertEquals(ratio > 1.5 && ratio < contrastRatio(light.text, light.bg), true, key);
  }
});


// ── the seven, and the ten they replaced ────────────────────────────────────

Deno.test("the palette is the web app's seven, in the same order", () => {
  assertEquals(ACCENT_SWATCHES.map((s) => s.id), [
    "default",
    "blue",
    "green",
    "yellow",
    "pink",
    "orange",
    "purple",
  ]);
});

// A null hue means achromatic. Synthesizing it through hslToHex with any
// stand-in hue is exactly how a "no colour" accent ends up faintly coloured.
// A null hue means achromatic in DARK mode, where Default is still the web's neutral grey. In
// light mode Default is the reference's green (see above); the coloured swatches stay coloured.
Deno.test("Default is a true grey in dark mode, the reference's green in light, and blue reads blue", () => {
  const grey = buildColors("dark", DEFAULT_ACCENT_ID).accent;
  const [, r, g, b] = /^#(..)(..)(..)$/.exec(grey) ?? [];
  assertEquals(r, g, `dark accent ${grey}`);
  assertEquals(g, b, `dark accent ${grey}`);
  assertEquals(buildColors("light", DEFAULT_ACCENT_ID).accent, "#53b559");
  const blue = buildColors("dark", "blue").accent;
  const [, br, , bb] = /^#(..)(..)(..)$/.exec(blue) ?? [];
  assertEquals(parseInt(bb ?? "0", 16) > parseInt(br ?? "0", 16), true, `blue should read blue: ${blue}`);
});

Deno.test("no accent is still the retired crimson", () => {
  for (const swatch of ACCENT_SWATCHES) {
    for (const mode of ["dark", "light"] as const) {
      const accent = buildColors(mode, swatch.id).accent.toLowerCase();
      assertEquals(accent === "#ff2740" || accent === "#cc1f33", false, `${swatch.id}/${mode}`);
    }
  }
});

// A phone last set to "teal" in June holds an id that no longer exists. Without
// the migration it falls through to whatever swatch happens to be first.
Deno.test("a retired accent id maps onto the nearest survivor", () => {
  assertEquals(normalizeAccentId("teal"), "green");
  assertEquals(normalizeAccentId("azure"), "blue");
  assertEquals(normalizeAccentId("amber"), "yellow");
  assertEquals(normalizeAccentId("magenta"), "pink");
  assertEquals(normalizeAccentId("crimson"), "default");
  assertEquals(normalizeAccentId("nonsense"), "default");
  assertEquals(normalizeAccentId(null), "default");
  assertEquals(normalizeAccentId("purple"), "purple", "a live id passes through");
});

Deno.test("buildColors survives a retired id without falling to the wrong swatch", () => {
  assertEquals(buildColors("dark", "teal").accent, buildColors("dark", "green").accent);
  assertEquals(buildColors("dark", "crimson").accent, buildColors("dark", "default").accent);
});

Deno.test("the Default swatch dot is a grey", () => {
  const [, r, g, b] = /^#(..)(..)(..)$/.exec(accentSwatchHex(null)) ?? [];
  assertEquals(r, g);
  assertEquals(g, b);
});
