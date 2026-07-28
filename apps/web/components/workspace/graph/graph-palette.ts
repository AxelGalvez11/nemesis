// Palette resolution + connectivity-heatmap node color — verbatim algorithm
// from desktop graph/index.tsx §B.3. CSS custom properties are resolved to
// rgb() off-DOM because three.js can't parse Chrome's `color(srgb ...)`
// serialization.

export interface GraphPalette {
  accent: string;
  background: string;
  ghost: string;
  label: string;
  link: string;
  node: string;
}

/** Convert Chrome's CSS Color 4 serialization into the RGB syntax consumed by
 * three-spritetext/polished. Keep other browser-supported formats unchanged. */
export function normalizeGraphCssColor(value: string, fallback: string): string {
  const match = /^color\(srgb\s+(.+)\)$/i.exec(value.trim());
  if (!match?.[1]) return value || fallback;
  const [rawChannels, rawAlpha] = match[1].split("/").map((part) => part?.trim());
  const channels = rawChannels?.split(/\s+/).map(Number) ?? [];
  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) return fallback;
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255));
  if (!rawAlpha) return `rgb(${red}, ${green}, ${blue})`;
  const alpha = Number(rawAlpha);
  if (!Number.isFinite(alpha)) return fallback;
  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, alpha))})`;
}

function resolveCssColor(value: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  try {
    const span = document.createElement("span");
    span.style.color = value;
    span.style.display = "none";
    document.body.appendChild(span);
    const resolved = getComputedStyle(span).color;
    document.body.removeChild(span);
    return normalizeGraphCssColor(resolved, fallback);
  } catch {
    return fallback;
  }
}

export function readGraphPalette(mode: "dark" | "light"): GraphPalette {
  const dark = mode === "dark";
  return {
    accent: resolveCssColor("var(--theme-primary)", "#b3382e"),
    background: resolveCssColor("var(--ui-bg-editor)", dark ? "#0e0e0e" : "#fafafa"),
    ghost: resolveCssColor(
      "color-mix(in srgb, var(--ui-text-primary) 38%, transparent)",
      dark ? "rgba(232,232,232,0.38)" : "rgba(28,28,30,0.38)",
    ),
    label: resolveCssColor("var(--ui-text-primary)", dark ? "#eeeeee" : "#1c1c1e"),
    link: resolveCssColor(
      "color-mix(in srgb, var(--ui-text-primary) 32%, transparent)",
      dark ? "rgba(232,232,232,0.32)" : "rgba(28,28,30,0.32)",
    ),
    node: resolveCssColor("var(--ui-text-secondary)", dark ? "#c8c8c8" : "#3f3f43"),
  };
}

function parseColor(value: string): { r: number; g: number; b: number } | null {
  const rgbMatch = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
  }
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hexMatch?.[1]) {
    const hex = hexMatch[1];
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
  }
  return null;
}

/**
 * Hue (0-360) of a resolved accent color, or null when there is no hue to
 * borrow — an unreadable value, or a grey.
 *
 * Null matters: the Default accent is a neutral graphite now (owner 2026-07-28
 * retired the crimson), and this used to answer "351" for anything achromatic.
 * That would have left the graph rendering in red after the red was taken out
 * of everything else.
 */
function accentHue(color: string): number | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Not `delta === 0`. The shipped greys are true neutrals, but a later tweak to
  // something faintly cool — zinc-700 #3f3f46, say — has more blue than red and
  // would sail through an exact test, painting the whole graph blue. Nothing
  // this washed out is ever a deliberate accent.
  const delta = max - min;
  if (delta < 0.06) return null;
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
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
 * saturation climbs 0.45→0.95 with degree. */
export function graphNodeColor(node: { ghost: boolean; degree: number }, palette: GraphPalette, maxDegree: number): string {
  const hue = accentHue(palette.accent);
  const degree = node.degree ?? 0;
  const t = maxDegree > 1 ? Math.min(1, (degree - 1) / (maxDegree - 1)) : 1;

  // A grey accent has no hue, so the heatmap has to be carried by LIGHTNESS
  // instead: saturation 0 with the old 0.56→0.64 ramp would make every node
  // look identical. Well-connected notes go darker, the same way they go more
  // saturated under a coloured accent.
  if (hue === null) {
    if (node.ghost) return hslToHex(0, 0, 0.74);
    if (degree <= 0) return hslToHex(0, 0, 0.68);
    return hslToHex(0, 0, 0.66 - 0.3 * t);
  }

  if (node.ghost) return hslToHex(hue, 0.05, 0.72);
  if (degree <= 0) return hslToHex(hue, 0.05, 0.62);
  return hslToHex(hue, 0.45 + 0.5 * t, 0.56 + 0.08 * t);
}

/** Blends `color` toward `background` by `ratio` (0-1) — dims non-neighbor
 * nodes/links on hover/select. */
export function dimColor(color: string, background: string, ratio: number): string {
  const from = parseColor(color);
  const to = parseColor(background);
  if (!from || !to) return color;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * ratio);
  return `rgb(${mix(from.r, to.r)}, ${mix(from.g, to.g)}, ${mix(from.b, to.b)})`;
}
