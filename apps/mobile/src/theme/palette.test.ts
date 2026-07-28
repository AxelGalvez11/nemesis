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
Deno.test("every accent clears 3.5:1 against both backgrounds", () => {
  for (const swatch of ACCENT_SWATCHES) {
    for (const mode of ["dark", "light"] as const) {
      const colors = buildColors(mode, swatch.id);
      const ratio = contrastRatio(colors.accent, colors.bg);
      assertEquals(ratio >= 3.5, true, `${swatch.id} on ${mode} bg: ${ratio.toFixed(2)}`);
    }
  }
});

Deno.test("status colors read on the light background too", () => {
  const light = buildColors("light", DEFAULT_ACCENT_ID);
  for (const key of ["warn", "danger", "info", "good"] as const) {
    const ratio = contrastRatio(light[key], light.bg);
    assertEquals(ratio >= 4.5, true, `${key} on light bg: ${ratio.toFixed(2)}`);
  }
});

Deno.test("unknown accent ids fall back to the default swatch", () => {
  const colors = buildColors("dark", "not-a-swatch");
  assertEquals(colors.accent, buildColors("dark", DEFAULT_ACCENT_ID).accent);
});

Deno.test("light mode = pure white paper, pure black text", () => {
  const light = buildColors("light", DEFAULT_ACCENT_ID);
  // Pure white page (owner 2026-07-21: ChatGPT-style white, not the old #f8faff tint).
  assertEquals(light.bg, "#ffffff");
  assertEquals(light.surface, "#ffffff");
  assertEquals(light.text, "#000000");
  assertEquals(light.text2, "#000000");
  assertEquals(light.text3, "#000000");
  assertEquals(contrastRatio(light.text, light.bg) >= 10, true);
});

Deno.test("textHint is the ONLY muted text tone, in both modes (owner 2026-07-22)", () => {
  for (const mode of ["dark", "light"] as const) {
    const colors = buildColors(mode, DEFAULT_ACCENT_ID);
    // It is genuinely gray — not another alias of the flat tier.
    assertEquals(colors.textHint !== colors.text, true);
    assertEquals(colors.textHint !== colors.text2, true);
    assertEquals(colors.textHint !== colors.text3, true);
    // ...and it sits BETWEEN the page and the body text, so it reads as a
    // hint rather than as content, but is never invisible.
    const hint = contrastRatio(colors.textHint, colors.bg);
    assertEquals(hint > 1.5, true);
    assertEquals(hint < contrastRatio(colors.text, colors.bg), true);
    // The global flatten is untouched — this token is an addition, not a
    // re-introduction of the old three-tier gray ramp.
    assertEquals(colors.text, colors.text2);
    assertEquals(colors.text2, colors.text3);
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
Deno.test("Default is a true grey in both modes, and nothing else is", () => {
  for (const mode of ["dark", "light"] as const) {
    const grey = buildColors(mode, DEFAULT_ACCENT_ID).accent;
    const [, r, g, b] = /^#(..)(..)(..)$/.exec(grey) ?? [];
    assertEquals(r, g, `${mode} accent ${grey}`);
    assertEquals(g, b, `${mode} accent ${grey}`);
  }
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
