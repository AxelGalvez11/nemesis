// Nemesis phone theme engine — the pure half (no react-native imports, so it
// Deno-tests like lib/library-sync.ts). Mirrors the desktop's appearance model
// (src/themes/accent-tint.ts + color.ts in nemesis-desktop): ONE monochrome
// identity per mode, and the student picks an accent HUE from the same curated
// ten swatches; every accent is synthesized at fixed saturation with mode-tuned
// lightness and contrast-guarded against the surface so it always reads.
// Crimson (the default) is the designer-approved brand hex verbatim — in dark
// mode the whole accent family matches the pre-theming constants byte-for-byte,
// so "default look" means "exactly the shipped look".

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedMode = "dark" | "light";

export interface AccentSwatch {
  id: string;
  label: string;
  hue: number;
}

// Same ten swatches, same hues, same default as the desktop app.
export const ACCENT_SWATCHES: readonly AccentSwatch[] = [
  { hue: 353, id: "crimson", label: "Crimson" },
  { hue: 12, id: "ember", label: "Ember" },
  { hue: 32, id: "amber", label: "Amber" },
  { hue: 265, id: "violet", label: "Violet" },
  { hue: 224, id: "indigo", label: "Indigo" },
  { hue: 205, id: "azure", label: "Azure" },
  { hue: 180, id: "teal", label: "Teal" },
  { hue: 158, id: "jade", label: "Jade" },
  { hue: 320, id: "magenta", label: "Magenta" },
  { hue: 20, id: "copper", label: "Copper" },
];

export const DEFAULT_ACCENT_ID = "crimson";
const BRAND_CRIMSON = "#ff2740";
const ACCENT_SAT = 0.82;
const ACCENT_DARK_L = 0.66;
const ACCENT_LIGHT_L = 0.46;
const MIN_TEXT_CONTRAST = 4.5;

// --- color math (ported from the desktop's themes/color.ts) -----------------

export function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)) as [number, number, number];
}

const rgbToHex = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b]
    .map((n) =>
      Math.round(Math.min(255, Math.max(0, n)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

export function hslToHex(h: number, s: number, l: number): string {
  const hue = (((h % 360) + 360) % 360) / 60;
  const sat = Math.min(1, Math.max(0, s));
  const lig = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs((hue % 2) - 1));
  const m = lig - c / 2;
  const [r, g, b] =
    hue < 1 ? [c, x, 0]
    : hue < 2 ? [x, c, 0]
    : hue < 3 ? [0, c, x]
    : hue < 4 ? [0, x, c]
    : hue < 5 ? [x, 0, c]
    : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

export function mix(a: string, b: string, amount: number): string {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  return ar && br
    ? rgbToHex([ar[0] + (br[0] - ar[0]) * amount, ar[1] + (br[1] - ar[1]) * amount, ar[2] + (br[2] - ar[2]) * amount])
    : a;
}

const linearize = (channel: number): number =>
  channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => linearize(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

export function ensureContrast(color: string, bg: string, min: number): string {
  if (contrastRatio(color, bg) >= min) return color;
  const towards = relativeLuminance(bg) < 0.5 ? "#ffffff" : "#000000";
  let best = color;
  for (let amount = 0.2; amount <= 1.0001; amount += 0.2) {
    best = mix(color, towards, Math.min(amount, 1));
    if (contrastRatio(best, bg) >= min) return best;
  }
  return best;
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/** Vivid, mode-independent chip color for the accent picker (desktop parity). */
export function accentSwatchHex(hue: number): string {
  return hslToHex(hue, 0.74, 0.52);
}

// --- the palette -------------------------------------------------------------

export interface ThemeColors {
  // surfaces & lines
  bg: string;
  bg2: string;
  surface: string;
  surface2: string;
  raised: string;
  /** Translucent panel fill (the mission screens' tokens.json `surface`). */
  glass: string;
  /** Semi-opaque frosted fill for glass BUTTONS + MENUS — readable, but translucent
   *  enough to let the blur show through (unlike the opaque bg2). */
  glassPanel: string;
  /** Near-opaque backing for MENU panels — glass edge stays, but the page behind
   *  can no longer bleed through the panel (owner 2026-07-20). */
  glassMenu: string;
  /** The drawer page's edge-shadow color (alpha baked in). Dark keeps the shipped
   *  50% black; light is FAINT — at full strength it read as a gray vertical band
   *  on the sidebar (owner 2026-07-20: keep the shadow, kill the band). */
  pageShadow: string;
  line: string;
  line2: string;
  /** tokens.json `mutedBorder` twin. */
  lineMuted: string;
  // text
  text: string;
  text2: string;
  text3: string;
  // accent family
  accent: string;
  accentDim: string;
  accentDeep: string;
  onAccent: string;
  accentFaint: string;
  accentLine: string;
  // status
  warn: string;
  danger: string;
  info: string;
  good: string;
  warnFaint: string;
  warnLine: string;
  dangerFaint: string;
  dangerLine: string;
  scrim: string;
}

// Dark surfaces = the shipped constants, verbatim (no visual change by default).
const DARK_BASE = {
  bg: "#0e0e0e",
  bg2: "#0a0a0a",
  surface: "#161617",
  surface2: "#1b1b1d",
  raised: "#202023",
  glass: "rgba(233,234,238,0.045)",
  glassPanel: "rgba(24,24,27,0.72)",
  glassMenu: "rgba(20,20,23,0.94)",
  pageShadow: "rgba(0,0,0,0.5)",
  line: "rgba(233,234,238,0.09)",
  line2: "rgba(233,234,238,0.16)",
  lineMuted: "rgba(154,157,166,0.20)",
  text: "#e9eaee",
  text2: "#9a9da6",
  text3: "#6f7278",
  scrim: "rgba(0,0,0,0.58)",
} as const;

// Light = the same monochrome identity on paper. Pure white page (owner
// 2026-07-21: match ChatGPT's plain white, not the old bluish #f8faff seed);
// secondary fills are neutral grays so cards/menus still read on white.
const LIGHT_BASE = {
  bg: "#ffffff",
  bg2: "#f4f4f5",
  surface: "#ffffff",
  surface2: "#f2f2f3",
  raised: "#ffffff",
  glass: "rgba(20,21,24,0.05)",
  glassPanel: "rgba(255,255,255,0.8)",
  glassMenu: "rgba(255,255,255,0.96)",
  pageShadow: "rgba(24,26,32,0.16)",
  line: "rgba(22,24,29,0.10)",
  line2: "rgba(22,24,29,0.18)",
  lineMuted: "rgba(90,94,104,0.22)",
  text: "#16181d",
  text2: "#5a5e68",
  text3: "#8b8f99",
  scrim: "rgba(0,0,0,0.35)",
} as const;

const STATUS_BASE = { warn: "#f5b23b", danger: "#ff5c4d", info: "#7fb2ff", good: "#7ee081" } as const;

// The exact pre-theming crimson family (dark mode): keeping these verbatim makes
// the default theme byte-identical to what shipped before appearance settings.
const CRIMSON_DARK = {
  accent: "#ff2740",
  accentDim: "#ff5165",
  accentDeep: "#cc1f33",
  onAccent: "#ffffff",
  accentFaint: "rgba(255,39,64,0.12)",
  accentLine: "rgba(255,39,64,0.35)",
} as const;

function accentFamily(accentId: string, dark: boolean, bg: string): Pick<
  ThemeColors,
  "accent" | "accentDim" | "accentDeep" | "onAccent" | "accentFaint" | "accentLine"
> {
  if (accentId === DEFAULT_ACCENT_ID && dark) return { ...CRIMSON_DARK };

  const swatch = ACCENT_SWATCHES.find((entry) => entry.id === accentId) ?? ACCENT_SWATCHES[0];
  const base =
    swatch.id === DEFAULT_ACCENT_ID ? BRAND_CRIMSON : hslToHex(swatch.hue, ACCENT_SAT, dark ? ACCENT_DARK_L : ACCENT_LIGHT_L);
  const accent = ensureContrast(base, bg, MIN_TEXT_CONTRAST);
  const onAccent = contrastRatio("#ffffff", accent) >= contrastRatio("#1a1a1a", accent) ? "#ffffff" : "#1a1a1a";

  return {
    accent,
    accentDim: mix(accent, dark ? "#ffffff" : "#000000", 0.16),
    accentDeep: mix(accent, "#000000", 0.2),
    onAccent,
    accentFaint: rgba(accent, 0.12),
    accentLine: rgba(accent, 0.35),
  };
}

/** Build the full palette for a resolved mode + accent id. Pure. */
export function buildColors(mode: ResolvedMode, accentId: string): ThemeColors {
  const dark = mode === "dark";
  const base = dark ? DARK_BASE : LIGHT_BASE;
  // Status colors keep their hue but get pushed until they read on this surface
  // (matters in light mode, where the dark-tuned pastels wash out as text).
  const warn = ensureContrast(STATUS_BASE.warn, base.bg, MIN_TEXT_CONTRAST);
  const danger = ensureContrast(STATUS_BASE.danger, base.bg, MIN_TEXT_CONTRAST);
  const info = ensureContrast(STATUS_BASE.info, base.bg, MIN_TEXT_CONTRAST);
  const good = ensureContrast(STATUS_BASE.good, base.bg, MIN_TEXT_CONTRAST);

  return {
    ...base,
    ...accentFamily(accentId, dark, base.bg),
    warn,
    danger,
    info,
    good,
    warnFaint: rgba(warn, 0.09),
    warnLine: rgba(warn, 0.3),
    dangerFaint: rgba(danger, 0.1),
    dangerLine: rgba(danger, 0.32),
  };
}
