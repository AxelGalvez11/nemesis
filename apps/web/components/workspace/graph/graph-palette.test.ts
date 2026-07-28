import assert from "node:assert/strict";

import { graphNodeColor, normalizeGraphCssColor, type GraphPalette } from "./graph-palette";

assert.equal(normalizeGraphCssColor("color(srgb 0.5 0.25 1)", "fallback"), "rgb(128, 64, 255)");
assert.equal(normalizeGraphCssColor("color(srgb 0.1 0.2 0.3 / 0.4)", "fallback"), "rgba(26, 51, 77, 0.4)");
assert.equal(normalizeGraphCssColor("rgb(1, 2, 3)", "fallback"), "rgb(1, 2, 3)");
assert.equal(normalizeGraphCssColor("color(srgb nope)", "fallback"), "fallback");

// ── node colour follows the live accent ──────────────────────────────────────
// The Default accent is a neutral graphite now (owner 2026-07-28 retired the
// crimson). accentHue used to answer "351" for anything it could not read a hue
// from, INCLUDING a grey — which would have left the graph rendering in red
// after the red was taken out of everything else.

const paletteWith = (accent: string): GraphPalette => ({
  accent,
  background: "#ffffff",
  ghost: "rgba(0,0,0,0.38)",
  label: "#1c1c1e",
  link: "rgba(0,0,0,0.32)",
  node: "#3f3f43",
});

const channels = (hex: string) => {
  const m = /^#(..)(..)(..)$/.exec(hex);
  assert.ok(m, `not a hex colour: ${hex}`);
  return [m[1], m[2], m[3]];
};

// #3f3f46 is the near-grey guard: faintly cool, still not an accent.
for (const grey of ["#404040", "#6e6e6e", "rgb(142, 142, 142)", "#3f3f46"]) {
  const [r, g, b] = channels(graphNodeColor({ degree: 4, ghost: false }, paletteWith(grey), 6));
  assert.equal(r, g, `grey accent ${grey} must stay grey`);
  assert.equal(g, b, `grey accent ${grey} must stay grey`);
}

// Saturation cannot carry the heatmap without a hue, so lightness has to: a
// well-connected note must not come out the same colour as a lonely one.
{
  const grey = paletteWith("#404040");
  const lonely = graphNodeColor({ degree: 1, ghost: false }, grey, 9);
  const hub = graphNodeColor({ degree: 9, ghost: false }, grey, 9);
  assert.notEqual(lonely, hub, "every node the same colour is not a heatmap");
  assert.ok(parseInt(channels(hub)[0]!, 16) < parseInt(channels(lonely)[0]!, 16), "hubs go darker");
}

// A chosen colour still tints the graph.
{
  const [r, g, b] = channels(graphNodeColor({ degree: 4, ghost: false }, paletteWith("#4c7ef3"), 6));
  assert.ok(parseInt(b!, 16) > parseInt(r!, 16), "a blue accent should read blue");
  assert.notEqual(r, g);
}

// An unreadable accent falls back to grey rather than to the retired crimson.
{
  const [r, g, b] = channels(graphNodeColor({ degree: 3, ghost: false }, paletteWith("nonsense"), 5));
  assert.equal(r, g);
  assert.equal(g, b);
}

console.log("graph-palette.test.ts OK");
