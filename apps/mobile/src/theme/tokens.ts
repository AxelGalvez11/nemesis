// Nemesis mobile design tokens — the phone's half of the shared visual identity with the
// desktop app. Values mirror theme/tokens.json (the desktop dark-mode seeds, owner-specified
// 2026-07-16): monochrome near-black surfaces, ONE crimson accent, tight radii. React Native
// has no CSS variables, so these are plain typed constants consumed by StyleSheet. If
// tokens.json is regenerated from the desktop export, re-derive these values to match.

export const c = {
  // surfaces & lines (monochrome near-black; bg2 = chrome/drawer, matching the desktop sidebar)
  bg: "#0e0e0e",
  bg2: "#0a0a0a",
  surface: "#161617",
  surface2: "#1b1b1d",
  raised: "#202023",
  line: "rgba(233,234,238,0.09)",
  line2: "rgba(233,234,238,0.16)",

  // text
  text: "#e9eaee",
  text2: "#9a9da6",
  text3: "#6f7278",

  // Nemesis accent — the one crimson, reserved for primary actions
  accent: "#ff2740",
  accentDim: "#ff5165",
  accentDeep: "#cc1f33",
  onAccent: "#ffffff",

  // status
  warn: "#f5b23b",
  danger: "#ff5c4d",
  info: "#7fb2ff",
  good: "#7ee081",

  // source-family dots (legacy evidence components only)
  pubmed: "#a78bfa",
  trial: "#f59e0b",
  fda: "#5b9bff",

  // translucent accents
  accentFaint: "rgba(255,39,64,0.12)",
  accentLine: "rgba(255,39,64,0.35)",
  warnFaint: "rgba(245,178,59,0.09)",
  warnLine: "rgba(245,178,59,0.30)",
  dangerFaint: "rgba(255,92,77,0.10)",
  dangerLine: "rgba(255,92,77,0.32)",
  scrim: "rgba(0,0,0,0.58)",
} as const;

// Matches tokens.json radius seeds (card 8 / input 10) at radiusScalar 1.0.
export const radius = { sm: 8, md: 10, lg: 14, xl: 18, pill: 999 } as const;

// 4pt spacing grid.
export const space = (n: number): number => n * 4;

// Type ramp bumped ~110% for on-phone readability (owner call 2026-07-18). Values below are
// the desktop tokens.json sizes × 1.1, rounded to 0.5pt. This lifts every token-driven text
// style app-wide; fixed-size controls (buttons, icons) are tuned per-screen, not here — so a
// later "make controls bigger too" pass stays a separate change. To revert to desktop parity,
// divide these back by 1.1.
export const type = {
  // System font, same as the desktop app (tokens.json font.family = "system").
  family: undefined as string | undefined,
  h1: { fontSize: 28.5, lineHeight: 35, fontWeight: "700" as const },
  h2: { fontSize: 21, lineHeight: 27.5, fontWeight: "700" as const },
  title: { fontSize: 17.5, lineHeight: 24, fontWeight: "600" as const },
  body: { fontSize: 17, lineHeight: 26.5, fontWeight: "400" as const },
  bodyStrong: { fontSize: 17, lineHeight: 26.5, fontWeight: "500" as const },
  small: { fontSize: 14.5, lineHeight: 21, fontWeight: "400" as const },
  micro: { fontSize: 12, lineHeight: 16.5, fontWeight: "500" as const },
} as const;

export const shadow = {
  // soft elevation for the composer + drawer (RN cross-platform shadow)
  raise: {
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  accent: {
    shadowColor: c.accent,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;
