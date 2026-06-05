// Design tokens — the primitive scales (doc-13 design system, slice 1).
//
// These are MODE-INDEPENDENT raw values: color ramps, spacing, radii, the type
// scale, and shadows. Semantic roles (what's a "background" vs "primary") live in
// theme.ts and are composed from these. Keeping primitives separate means a future
// rebrand changes one ramp here, not every screen.
//
// Pure data — unit-tested under Deno (`deno test --no-check`). No RN imports.

// --- color ramps -----------------------------------------------------------
// Brand teal (Clinical+ accent). 500 is the canonical brand color (#0EA5A4).
export const teal = {
  50: "#EFFCFB",
  100: "#D2F5F3",
  200: "#A6EAE7",
  300: "#6FD9D5",
  400: "#34BFBB",
  500: "#0EA5A4",
  600: "#0B8584",
  700: "#0C6A6A",
  800: "#0E5453",
  900: "#103E3E",
} as const;

// Neutral slate. 0=white … 950=near-black (matches the app icon background).
export const slate = {
  0: "#FFFFFF",
  50: "#F8FAFC",
  100: "#F1F5F9",
  200: "#E2E8F0",
  300: "#CBD5E1",
  400: "#94A3B8",
  500: "#64748B",
  600: "#475569",
  700: "#334155",
  800: "#1E293B",
  900: "#0F172A",
  950: "#0B1220",
} as const;

// Evidence-strength + status hues (green → amber → red), light and bright variants
// so each theme can pick the readable one.
export const hue = {
  emerald600: "#059669",
  emerald700: "#047857",
  emerald400: "#34D399",
  amber600: "#D97706",
  amber400: "#FBBF24",
  orange600: "#EA580C",
  orange400: "#FB923C",
  red600: "#DC2626",
  red400: "#F87171",
  redBg: "#FEF2F2",
} as const;

// --- spacing (4-pt base) ---------------------------------------------------
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// --- radii -----------------------------------------------------------------
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

// --- type scale ------------------------------------------------------------
// fontFamily omitted → platform system face (SF / Roboto). A custom face (Inter)
// is a later enhancement; it needs expo-font + an asset and isn't worth the boot
// cost in slice 1. Weights are strings to satisfy RN's TextStyle typing.
export type TypeToken = {
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500" | "600" | "700" | "800";
  letterSpacing?: number;
};

export const type: Record<
  "display" | "h1" | "h2" | "h3" | "body" | "bodyStrong" | "bodySm" | "caption" | "label",
  TypeToken
> = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -0.5 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.3 },
  h2: { fontSize: 21, lineHeight: 28, fontWeight: "700", letterSpacing: -0.2 },
  h3: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: "600" },
  bodySm: { fontSize: 13, lineHeight: 19, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  label: { fontSize: 13, lineHeight: 16, fontWeight: "600", letterSpacing: 0.4 },
};

// --- shadow / elevation ----------------------------------------------------
// iOS shadow* + Android elevation. Dark themes override opacity (shadows read as
// noise on near-black) — see theme.ts.
export type ShadowToken = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export const shadow: Record<"sm" | "md" | "lg", ShadowToken> = {
  sm: { shadowColor: slate[900], shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: slate[900], shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  lg: { shadowColor: slate[900], shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 6 },
};

// The 7 evidence grades (doc-09). Kept here as the canonical ordering so the theme
// grade-color map and any legend render in strength order.
export const EVIDENCE_GRADES = [
  "very_strong",
  "strong",
  "moderate",
  "weak",
  "very_weak",
  "unknown",
  "not_applicable",
] as const;

export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];
