// Deno unit tests (repo convention) for the Graph screen's color-heatmap helpers.
// Run: deno test --no-check apps/mobile/src/lib/graph-palette.test.ts
import { assert, assertEquals, assertMatch, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { accentHue, graphNodeColor, hslToHex } from "./graph-palette.ts";

// null, not 351: the Default accent is a neutral graphite now, and answering
// "crimson" for anything achromatic would have left the graph red after the red
// came out of everything else.
Deno.test("accentHue reads primary hues, and answers null when there is none", () => {
  assertEquals(accentHue("#ff0000"), 0);
  assertEquals(accentHue("#00ff00"), 120);
  assertEquals(accentHue("#0000ff"), 240);
  assertEquals(accentHue("rgb(255, 0, 0)"), 0);
  assertEquals(accentHue("#808080"), null, "a grey has no hue to borrow");
  assertEquals(accentHue("#6e6e6e"), null, "the default accent");
  assertEquals(accentHue("#3f3f46"), null, "and a faintly cool near-grey is still not an accent");
  assertEquals(accentHue("not-a-color"), null, "unparseable input");
});

// Saturation cannot carry the heatmap without a hue, so lightness has to.
Deno.test("a grey accent gives a grey graph that still reads as a heatmap", () => {
  const channels = (hex: string) => /^#(..)(..)(..)$/.exec(hex)!.slice(1);
  for (const node of [{ degree: 0, ghost: true }, { degree: 0, ghost: false }, { degree: 5, ghost: false }]) {
    const [r, g, b] = channels(graphNodeColor(node, "#6e6e6e", 9));
    assertEquals(r, g);
    assertEquals(g, b);
  }
  const lonely = graphNodeColor({ degree: 1, ghost: false }, "#6e6e6e", 9);
  const hub = graphNodeColor({ degree: 9, ghost: false }, "#6e6e6e", 9);
  assertNotEquals(lonely, hub, "every node the same colour is not a heatmap");
  assert(parseInt(channels(hub)[0], 16) < parseInt(channels(lonely)[0], 16), "hubs go darker");
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
