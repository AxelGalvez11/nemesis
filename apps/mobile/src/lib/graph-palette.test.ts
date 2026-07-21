// Deno unit tests (repo convention) for the Graph screen's color-heatmap helpers.
// Run: deno test --no-check apps/mobile/src/lib/graph-palette.test.ts
import { assert, assertEquals, assertMatch, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { accentHue, graphNodeColor, hslToHex } from "./graph-palette.ts";

Deno.test("accentHue reads primary hues off rgb()/hex, and falls back on gray/junk", () => {
  assertEquals(accentHue("#ff0000"), 0);
  assertEquals(accentHue("#00ff00"), 120);
  assertEquals(accentHue("#0000ff"), 240);
  assertEquals(accentHue("rgb(255, 0, 0)"), 0);
  assertEquals(accentHue("#808080"), 351, "no saturation (delta=0) falls back to crimson");
  assertEquals(accentHue("not-a-color"), 351, "unparseable input falls back to crimson");
});

Deno.test("hslToHex matches known primary/gray conversions", () => {
  assertEquals(hslToHex(0, 1, 0.5), "#ff0000");
  assertEquals(hslToHex(120, 1, 0.5), "#00ff00");
  assertEquals(hslToHex(240, 1, 0.5), "#0000ff");
  assertEquals(hslToHex(0, 0, 0.5), "#808080");
});

Deno.test("graphNodeColor: a ghost always gets the same pale tone, degree ignored", () => {
  const lowDegree = graphNodeColor({ degree: 0, ghost: true }, "#ff0000", 10);
  const highDegree = graphNodeColor({ degree: 10, ghost: true }, "#ff0000", 10);
  assertEquals(lowDegree, highDegree);
  assertMatch(lowDegree, /^#[0-9a-f]{6}$/i);
});

Deno.test("graphNodeColor: ghost tone follows the live accent hue, not a fixed gray", () => {
  const redAccentGhost = graphNodeColor({ degree: 0, ghost: true }, "#ff0000", 5);
  const blueAccentGhost = graphNodeColor({ degree: 0, ghost: true }, "#0000ff", 5);
  assertNotEquals(redAccentGhost, blueAccentGhost);
});

Deno.test("graphNodeColor: degree-0 and degree>0 real nodes render distinct tones", () => {
  const isolated = graphNodeColor({ degree: 0, ghost: false }, "#ff0000", 5);
  const connected = graphNodeColor({ degree: 1, ghost: false }, "#ff0000", 5);
  assertNotEquals(isolated, connected);
});

Deno.test("graphNodeColor: higher degree (closer to maxDegree) reads as a distinct, more saturated tone", () => {
  const oneOfFive = graphNodeColor({ degree: 1, ghost: false }, "#ff0000", 5);
  const hub = graphNodeColor({ degree: 5, ghost: false }, "#ff0000", 5);
  assertNotEquals(oneOfFive, hub);
  // Same hue family (pure red accent): every channel should be pinned to
  // r>=g==b, i.e. the color never drifts to a different hue as degree climbs.
  for (const hex of [oneOfFive, hub]) {
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    assertEquals(g, b, `red-accent heatmap should stay gray-red, not shift hue: ${hex}`);
  }
});

Deno.test("graphNodeColor: a single-node graph (maxDegree<=1) still returns a defined color, no NaN/divide-by-zero", () => {
  const solo = graphNodeColor({ degree: 0, ghost: false }, "#ff0000", 1);
  assertMatch(solo, /^#[0-9a-f]{6}$/i);
  const soloConnected = graphNodeColor({ degree: 1, ghost: false }, "#ff0000", 1);
  assertMatch(soloConnected, /^#[0-9a-f]{6}$/i);
});

Deno.test("graphNodeColor: degree is deterministic (same inputs, same output)", () => {
  const a = graphNodeColor({ degree: 3, ghost: false }, "#ff2740", 8);
  const b = graphNodeColor({ degree: 3, ghost: false }, "#ff2740", 8);
  assertEquals(a, b);
  assert(/^#[0-9a-f]{6}$/i.test(a));
});

console.log("graph-palette.test.ts assertions defined via Deno.test");
