// Nemesis phone theme engine — the pure half (no react-native imports, so it
// Deno-tests like lib/library-sync.ts). ONE monochrome identity per mode, and
// the student picks an accent from a curated set; every accent is synthesized at
// fixed saturation with mode-tuned lightness and contrast-guarded against the
// surface so it always reads.
//
// Owner 2026-07-28 replaced the ten desktop hues with the same seven the web app
// now offers — Default, Blue, Green, Yellow, Pink, Orange, Purple — and RETIRED
// THE CRIMSON: Default is a neutral grey. That is why AccentSwatch.hue is
// nullable. A null hue is not "missing", it means achromatic, and the synthesis
// below builds it at saturation 0 rather than borrowing a hue from anywhere.

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedMode = "dark" | "light";

export interface AccentSwatch {
  id: string;
  label: string;
  /** null = achromatic. Only "default" has this. */
  hue: number | null;
}

// The web app's seven, same order, hues taken from its hex values so a student
// with both surfaces sees one colour.
export const ACCENT_SWATCHES: readonly AccentSwatch[] = [
  { hue: null, id: "default", label: "Default" },
  { hue: 223, id: "blue", label: "Blue" },
  { hue: 123, id: "green", label: "Green" },
  { hue: 42, id: "yellow", label: "Yellow" },
  { hue: 328, id: "pink", label: "Pink" },
  { hue: 25, id: "orange", label: "Orange" },
  { hue: 258, id: "purple", label: "Purple" },
];

export const DEFAULT_ACCENT_ID = "default";

// The ten hues that shipped before. A phone that has been sitting on "teal"
// since June must not wake up on a value that no longer exists — map the old
// ids onto the nearest survivor, and anything unrecognised onto Default.
const RETIRED_ACCENT_IDS: Readonly<Record<string, string>> = {
  amber: "yellow",
  azure: "blue",
  copper: "orange",
  crimson: "default",
  ember: "orange",
  indigo: "blue",
  jade: "green",
  magenta: "pink",
  teal: "green",
  violet: "purple",
};

/** Resolve a stored accent id to one that still exists. */
export function normalizeAccentId(stored: string | null | undefined): string {
  if (!stored) return DEFAULT_ACCENT_ID;
  if (ACCENT_SWATCHES.some((swatch) => swatch.id === stored)) return stored;
  return RETIRED_ACCENT_IDS[stored] ?? DEFAULT_ACCENT_ID;
}
// Owner 2026-07-22: "the colors in appearance settings should be bright colors
// not darkish colors." Saturation and lightness both went up, but the real
// culprit was the contrast floor: forcing every accent past 4.5:1 on white
// dragged the light-mode picks down to muddy values (teal landed on #0d8080,
// amber on a brown #aa6311). Accents get their own, lower floor — 3.5:1, above
// the 3:1 that WCAG asks of UI components and large text — while the status
// colors below keep the stricter 4.5:1, since those carry warnings.
const ACCENT_SAT = 0.86;
const ACCENT_DARK_L = 0.7;
const ACCENT_LIGHT_L = 0.52;
const MIN_TEXT_CONTRAST = 4.5;
const MIN_ACCENT_CONTRAST = 3.5;

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

export function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/** Vivid, mode-independent chip color for the accent picker (desktop parity).
 *  Brightened 2026-07-22 alongside the applied accent — the old 0.74/0.52 pair
 *  read deep rather than bright in the picker. */
export function accentSwatchHex(hue: number | null): string {
  // The dot for Default. What it applies is a light/dark pair one dot cannot
  // show, so this is the mid-grey that reads against either.
  if (hue === null) return "#8e8e8e";
  return hslToHex(hue, 0.85, 0.6);
}

// --- the palette -------------------------------------------------------------

export interface ThemeColors {
  // surfaces & lines
  bg: string;
  bg2: string;
  surface: string;
  surface2: string;
  raised: string;
  /** iOS grouped-table page background — the Settings sheet's grey behind white cards. */
  bgGrouped: string;
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
  /** Wash laid over the pushed page as the drawer opens (owner 2026-07-22:
   *  "the page being swiped should gradually turn a grayish color"). Dark mode
   *  pages are true black, so the wash has to be WHITE to lift them toward
   *  gray — a black scrim would be invisible. Light mode stays transparent:
   *  those pages are pure white by owner mandate and dimming them fights it. */
  pageDim: string;
  line: string;
  line2: string;
  /** tokens.json `mutedBorder` twin. */
  lineMuted: string;
  /** Skeleton-placeholder fill. A SOLID tone, deliberately not one of the line
   *  colours: those are 16-22% alpha, and a loading pulse that multiplies that
   *  by 0.45 lands around 7% against the card — running, but invisible (owner
   *  2026-07-23: "the skeleton previews are there but they are not animating").
   *  Sits a clear step off surface2 in both modes. */
  skeleton: string;
  // text — since 2026-07-21 all three tiers resolve to pure #000 (light) /
  // #fff (dark) (owner: no gray text anywhere). The 3-token split survives
  // so the 200+ existing call sites didn't have to churn, and so a future
  // re-introduction of hierarchy is a 2-line palette change.
  text: string;
  text2: string;
  text3: string;
  /** The ONE deliberately-muted text tone (owner 2026-07-22). The flatten
   *  above is global and stays that way; this token exists for the two places
   *  the owner asked to keep gray — the chat composer's placeholder and the
   *  landing chat suggestions — because both are prompts for text that isn't
   *  there yet, and at full strength they read as content the student wrote.
   *  Hint text is exempt from the body contrast floor by design; do NOT route
   *  it through the accent/status contrast machinery, and do NOT reach for it
   *  as a general "secondary text" shade — that's what the flatten removed. */
  textHint: string;
  /** The composer card's fill — measured #FBFBFB on the reference (IMG_6529/6532), a hair off
   *  the page so the hairline border and shadow carry the card, not a grey fill. */
  composer: string;
  /** The reference's blue: capability chips in the composer, "Upgrade plan", links. */
  blue: string;
  blueFaint: string;
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

// Dark = pure black (owner 2026-07-21: "dark mode should be completely black
// for all pages", OLED-style). Pages sit at true #000000; cards/menus get
// only a whisper of lift and lean on the existing hairline borders for their
// edges. ALL text is pure white — same owner ask killed every gray text tier
// (the old #e9eaee/#9a9da6/#6f7278 ramp is in git history).
const DARK_BASE = {
  bgGrouped: "#000000",
  composer: "#161617",
  blue: "#3a83f7",
  blueFaint: "rgba(58,131,247,0.16)",
  bg: "#000000",
  bg2: "#000000",
  surface: "#0a0a0a",
  surface2: "#101010",
  raised: "#141414",
  glass: "rgba(233,234,238,0.045)",
  glassPanel: "rgba(10,10,10,0.72)",
  glassMenu: "rgba(8,8,8,0.94)",
  pageShadow: "rgba(0,0,0,0.5)",
  pageDim: "rgba(255,255,255,0.11)",
  line: "rgba(233,234,238,0.09)",
  line2: "rgba(233,234,238,0.16)",
  lineMuted: "rgba(154,157,166,0.20)",
  // A clear step up from surface2 (#101010) so the pulse actually reads.
  skeleton: "#262626",
  text: "#ffffff",
  text2: "#ffffff",
  text3: "#ffffff",
  // The old mid-gray tier, kept alive for hint text only (see textHint).
  textHint: "#9a9da6",
  scrim: "rgba(0,0,0,0.58)",
} as const;

// Light = the ChatGPT iPhone app's palette, MEASURED off the owner's reference screenshots
// (2026-09-01, ~/Downloads/chatgptios, sampled at 3x): page #FFFFFF, menus #F9F9F9, chips and
// tiles #F3F3F3, primary text #0D0D0D, secondary #8F8F8F / #8A8A8D, placeholder #8E8E8E. The
// owner's instruction was one-to-one — "font spacing icons literally everything" — so these are
// the reference's numbers, not a Nemesis interpretation of them. The 2026-07-21 "no gray text"
// flatten is superseded by that instruction: the reference's secondary text IS grey.
const LIGHT_BASE = {
  bg: "#ffffff",
  bg2: "#ffffff",
  bgGrouped: "#f2f2f6",
  composer: "#fbfbfb",
  surface: "#f9f9f9",
  surface2: "#f3f3f3",
  raised: "#ffffff",
  glass: "rgba(20,21,24,0.05)",
  glassPanel: "rgba(255,255,255,0.86)",
  glassMenu: "rgba(249,249,249,0.97)",
  pageShadow: "rgba(24,26,32,0.16)",
  pageDim: "transparent",
  line: "rgba(0,0,0,0.08)",
  line2: "rgba(0,0,0,0.14)",
  lineMuted: "rgba(0,0,0,0.12)",
  skeleton: "#e6e6e6",
  text: "#0d0d0d",
  text2: "#8f8f8f",
  text3: "#8a8a8d",
  textHint: "#8e8e8e",
  blue: "#3a83f7",
  blueFaint: "#e8f3fe",
  scrim: "rgba(0,0,0,0.35)",
} as const;

const STATUS_BASE = { warn: "#f5b23b", danger: "#ff5c4d", info: "#7fb2ff", good: "#7ee081" } as const;

// The neutral Default family. Pinned rather than synthesized so it matches the
// web app's --theme-primary exactly (#404040 light / #6e6e6e dark) — the same
// value in both places is the whole point of one palette across surfaces.
const NEUTRAL_ACCENT = {
  dark: {
    accent: "#6e6e6e",
    accentDim: "#8b8b8b",
    accentDeep: "#585858",
    onAccent: "#ffffff",
    accentFaint: "rgba(110,110,110,0.12)",
    accentLine: "rgba(110,110,110,0.35)",
  },
  // Light Default = the reference's green, measured: send button #53B559, sidebar pill #52B357,
  // the learner's bubble #DEF3E5 with #48A04C text. The other swatches still apply their own
  // hue on top of this base, so a learner who wants a different colour keeps that setting.
  light: {
    accent: "#53b559",
    accentDim: "#4aa350",
    accentDeep: "#3f8f45",
    onAccent: "#ffffff",
    accentFaint: "#def3e5",
    accentLine: "rgba(83,181,89,0.35)",
  },
} as const;

function accentFamily(accentId: string, dark: boolean, bg: string): Pick<
  ThemeColors,
  "accent" | "accentDim" | "accentDeep" | "onAccent" | "accentFaint" | "accentLine"
> {
  const swatch = ACCENT_SWATCHES.find((entry) => entry.id === normalizeAccentId(accentId)) ?? ACCENT_SWATCHES[0];
  // A null hue is achromatic, so there is nothing to synthesize from — and
  // running it through hslToHex with some stand-in hue is exactly how a "no
  // colour" accent ends up faintly coloured.
  if (swatch.hue === null) return { ...(dark ? NEUTRAL_ACCENT.dark : NEUTRAL_ACCENT.light) };

  const base = hslToHex(swatch.hue, ACCENT_SAT, dark ? ACCENT_DARK_L : ACCENT_LIGHT_L);
  const accent = ensureContrast(base, bg, MIN_ACCENT_CONTRAST);
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
  // The reference's Delete red (#E0423B, measured) sits under the 4.5:1 floor on white; the
  // owner's one-to-one instruction wins for that one colour in light mode.
  const danger = dark ? ensureContrast(STATUS_BASE.danger, base.bg, MIN_TEXT_CONTRAST) : "#e0423b";
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
