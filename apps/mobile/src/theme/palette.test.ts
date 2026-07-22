// Deno unit tests (repo convention) for the theme engine's pure half.
// Run: deno test --no-check apps/mobile/src/theme/palette.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACCENT_SWATCHES,
  buildColors,
  contrastRatio,
  DEFAULT_ACCENT_ID,
} from "./palette.ts";

Deno.test("dark mode = pure black pages, pure white text (owner 2026-07-21)", () => {
  const colors = buildColors("dark", DEFAULT_ACCENT_ID);
  assertEquals(colors.bg, "#000000");
  assertEquals(colors.bg2, "#000000");
  assertEquals(colors.text, "#ffffff");
  assertEquals(colors.text2, "#ffffff");
  assertEquals(colors.text3, "#ffffff");
  // The brand crimson family is still byte-identical to what shipped.
  assertEquals(colors.accent, "#ff2740");
  assertEquals(colors.accentDim, "#ff5165");
  assertEquals(colors.accentDeep, "#cc1f33");
  assertEquals(colors.onAccent, "#ffffff");
  assertEquals(colors.accentFaint, "rgba(255,39,64,0.12)");
  assertEquals(colors.accentLine, "rgba(255,39,64,0.35)");
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
