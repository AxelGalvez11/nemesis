// Deno unit tests (repo convention) for the theme engine's pure half.
// Run: deno test --no-check apps/mobile/src/theme/palette.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACCENT_SWATCHES,
  buildColors,
  contrastRatio,
  DEFAULT_ACCENT_ID,
} from "./palette.ts";

Deno.test("default dark = the shipped constants, byte for byte", () => {
  const colors = buildColors("dark", DEFAULT_ACCENT_ID);
  assertEquals(colors.bg, "#0e0e0e");
  assertEquals(colors.bg2, "#0a0a0a");
  assertEquals(colors.surface, "#161617");
  assertEquals(colors.text, "#e9eaee");
  assertEquals(colors.accent, "#ff2740");
  assertEquals(colors.accentDim, "#ff5165");
  assertEquals(colors.accentDeep, "#cc1f33");
  assertEquals(colors.onAccent, "#ffffff");
  assertEquals(colors.accentFaint, "rgba(255,39,64,0.12)");
  assertEquals(colors.accentLine, "rgba(255,39,64,0.35)");
  assertEquals(colors.glass, "rgba(233,234,238,0.045)");
  assertEquals(colors.line, "rgba(233,234,238,0.09)");
});

Deno.test("every accent clears 4.5:1 against both backgrounds", () => {
  for (const swatch of ACCENT_SWATCHES) {
    for (const mode of ["dark", "light"] as const) {
      const colors = buildColors(mode, swatch.id);
      const ratio = contrastRatio(colors.accent, colors.bg);
      assertEquals(ratio >= 4.5, true, `${swatch.id} on ${mode} bg: ${ratio.toFixed(2)}`);
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

Deno.test("light mode swaps surfaces to paper and keeps text dark", () => {
  const light = buildColors("light", DEFAULT_ACCENT_ID);
  // Pure white page (owner 2026-07-21: ChatGPT-style white, not the old #f8faff tint).
  assertEquals(light.bg, "#ffffff");
  assertEquals(light.surface, "#ffffff");
  assertEquals(contrastRatio(light.text, light.bg) >= 10, true);
});
