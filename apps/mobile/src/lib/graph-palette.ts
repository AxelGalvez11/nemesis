// Connectivity-heatmap node coloring for the phone Graph screen (2D and 3D) —
// ported from the web Graph's graph-palette.ts (apps/web/components/
// workspace/graph/graph-palette.ts). Node color there is NOT a fixed
// palette: it's a heatmap keyed to how connected a note is, hue pinned to
// whatever the live theme accent is, so a hub note reads as a bright,
// saturated dot and an isolated note reads as a pale one, in any accent
// swatch the student picked.
//
// The web file also parses Chrome's `color(srgb ...)` CSS Color 4
// serialization and resolves CSS custom properties off-DOM (three.js can't
// consume either); neither concern exists on the phone — theme/palette.ts
// already hands every screen ready RGB/hex strings — so only the pure
// color-math half is ported: hue-from-accent, HSL->hex, and the
// degree-driven heatmap itself. `dimColor` (web: blends a color toward the
// canvas background to fake translucency for contexts with no real alpha
// compositing — a WebGL/Canvas2D workaround) is deliberately NOT ported:
// React Native Views and react-native-svg both support real alpha (View
// `opacity`/rgba backgroundColor, SVG `opacity`/`fillOpacity`), so ghost-node
// translucency is plain opacity at the call site instead — see
// GraphNodeView.tsx.
//
// Dependency-free, like note-graph.ts, so this Deno-tests.

export interface GraphNodeLike {
  ghost: boolean;
  degree: number;
}

function parseColor(value: string): { r: number; g: number; b: number } | null {
  const rgbMatch = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (rgbMatch) {
    return { b: Number(rgbMatch[3]), g: Number(rgbMatch[2]), r: Number(rgbMatch[1]) };
  }
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hexMatch?.[1]) {
    const hex = hexMatch[1];
    const full = hex.length === 3 ? hex.split("").map((ch) => ch + ch).join("") : hex;
    return { b: parseInt(full.slice(4, 6), 16), g: parseInt(full.slice(2, 4), 16), r: parseInt(full.slice(0, 2), 16) };
  }
  return null;
}

/** Hue (0-360) of a resolved accent color, or null when there is no hue to
 * borrow — an unreadable value, or a grey. Null matters: the Default accent is
 * a neutral graphite now, and answering "351" for anything achromatic would
 * leave the graph red after the red came out of everything else. Same rule as
 * the web's graph-palette.ts. Accepts any `rgb()`/`rgba()`/hex string — exactly
 * what ThemeColors.accent already is. */
export function accentHue(color: string): number | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Not `delta === 0`. A faintly cool grey has more blue than red and would
  // sail through an exact test, painting the whole graph blue. Nothing this
  // washed out is ever a deliberate accent.
  const delta = max - min;
  if (delta < 0.06) return null;
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/** Verbatim HSL->hex, same as web's graph-palette.ts. */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

/** Node color = connectivity heatmap, not a fixed palette — degree-driven,
 * hue pinned to the live theme accent. Lightness stays high (never black);
 * saturation climbs 0.45→0.95 with degree. A ghost gets a fixed pale,
 * low-saturation tone in the SAME hue family (so it still reads as "this
 * accent's app", not a random gray) rather than joining the heatmap.
 * Verbatim algorithm from web's graph-palette.ts graphNodeColor. */
export function graphNodeColor(node: GraphNodeLike, accentColor: string, maxDegree: number): string {
  const hue = accentHue(accentColor);
  const degree = node.degree ?? 0;
  const t = maxDegree > 1 ? Math.min(1, (degree - 1) / (maxDegree - 1)) : 1;

  // Saturation cannot carry the heatmap without a hue, so lightness does:
  // saturation 0 over the old 0.56→0.64 ramp would make every node identical.
  if (hue === null) {
    if (node.ghost) return hslToHex(0, 0, 0.74);
    if (degree <= 0) return hslToHex(0, 0, 0.68);
    return hslToHex(0, 0, 0.66 - 0.3 * t);
  }

  if (node.ghost) return hslToHex(hue, 0.05, 0.72);
  if (degree <= 0) return hslToHex(hue, 0.05, 0.62);
  return hslToHex(hue, 0.45 + 0.5 * t, 0.56 + 0.08 * t);
}
