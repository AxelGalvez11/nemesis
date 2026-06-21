// PharmaOrb mobile design tokens — the dark, ChatGPT/Claude-style palette ported verbatim from the web
// app's `:root[data-theme="dark"]` (apps/web/app/globals.css) so mobile and web read as one brand.
// React Native has no CSS variables, so these are plain typed constants consumed by StyleSheet.

export const c = {
  // surfaces & lines (true near-black)
  bg: "#0a0a0b",
  bg2: "#0e0e10",
  surface: "#141417",
  surface2: "#1a1a1e",
  raised: "#1f1f24",
  line: "#232329",
  line2: "#2c2c33",

  // text
  text: "#f4f4f5",
  text2: "#a6a6ad",
  text3: "#8c8c95",

  // PharmaOrb accent — lime on near-black
  acid: "#bcff3c",
  acidDim: "#9bd92e",
  acidDeep: "#74a81e",
  onAcid: "#0a0a0b",

  // status
  warn: "#f5b23b",
  danger: "#ff5c4d",
  info: "#7fb2ff",
  good: "#7ee081",

  // source-family dots (match the web evidence panel)
  pubmed: "#a78bfa",
  trial: "#f59e0b",
  fda: "#5b9bff",

  // translucent accents
  acidFaint: "rgba(188,255,60,0.10)",
  acidLine: "rgba(188,255,60,0.28)",
  warnFaint: "rgba(245,178,59,0.09)",
  warnLine: "rgba(245,178,59,0.30)",
  dangerFaint: "rgba(255,92,77,0.10)",
  dangerLine: "rgba(255,92,77,0.32)",
  scrim: "rgba(0,0,0,0.58)",
} as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

// 4pt spacing grid.
export const space = (n: number): number => n * 4;

export const type = {
  // Inter ships as the app font (loaded in the root layout); falls back to system.
  family: undefined as string | undefined, // set per-platform in the root layout if a custom font is loaded
  // sizes / line-heights tuned to the web composer + chat body
  h1: { fontSize: 26, lineHeight: 32, fontWeight: "700" as const },
  h2: { fontSize: 19, lineHeight: 25, fontWeight: "700" as const },
  title: { fontSize: 16, lineHeight: 22, fontWeight: "600" as const },
  body: { fontSize: 15.5, lineHeight: 24, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15.5, lineHeight: 24, fontWeight: "500" as const },
  small: { fontSize: 13, lineHeight: 19, fontWeight: "400" as const },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: "500" as const },
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
  acid: {
    shadowColor: c.acid,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;
