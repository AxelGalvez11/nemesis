// Semantic themes (doc-13). Maps the primitive ramps in tokens.ts onto ROLES
// ("background", "primary", "textMuted", …) for light and dark. Components read
// roles, never raw ramps, so a screen never hardcodes a hex value.
//
// Pure data + one pure helper (evidenceGradeColor). Unit-tested under Deno; the
// test asserts the contract: both modes define every role, and every one of the
// 7 evidence grades resolves to a color (so a new grade can't silently render as
// undefined).

import { type EvidenceGrade, hue, type ShadowToken, shadow, slate, teal } from "./tokens.ts";

export type ThemeMode = "light" | "dark";

/** Semantic color roles. Every role MUST exist in both light and dark. */
export interface ThemeColors {
  // surfaces
  background: string; // app canvas
  surface: string; // cards, sheets
  surfaceAlt: string; // sunken / secondary fill
  // lines
  border: string;
  borderStrong: string;
  // text
  text: string;
  textMuted: string;
  textSubtle: string;
  inverseText: string; // text on a primary-filled surface
  // brand / primary
  primary: string;
  primaryHover: string;
  primaryMuted: string; // tinted background
  onPrimaryMuted: string; // text/icon on primaryMuted
  focusRing: string;
  // feedback
  danger: string;
  dangerMuted: string;
  success: string;
  warning: string;
  // form
  inputBg: string;
  inputBorder: string;
  placeholder: string;
  // scrim
  overlay: string;
}

export interface Theme {
  mode: ThemeMode;
  color: ThemeColors;
  grade: Record<EvidenceGrade, string>;
  shadow: Record<"sm" | "md" | "lg", ShadowToken>;
}

const lightColors: ThemeColors = {
  background: slate[50],
  surface: slate[0],
  surfaceAlt: slate[100],
  border: slate[200],
  borderStrong: slate[300],
  text: slate[900],
  textMuted: slate[500],
  textSubtle: slate[400],
  inverseText: slate[0],
  primary: teal[500],
  primaryHover: teal[600],
  primaryMuted: teal[50],
  onPrimaryMuted: teal[700],
  focusRing: teal[400],
  danger: hue.red600,
  dangerMuted: hue.redBg,
  success: hue.emerald600,
  warning: hue.amber600,
  inputBg: slate[0],
  inputBorder: slate[300],
  placeholder: slate[400],
  overlay: "rgba(15,23,42,0.45)",
};

const darkColors: ThemeColors = {
  background: slate[950],
  surface: "#131F33",
  surfaceAlt: "#1B2942",
  border: "#26344C",
  borderStrong: "#33425E",
  text: slate[100],
  textMuted: slate[400],
  textSubtle: slate[500],
  inverseText: "#052E2D", // dark teal-ink on the brighter dark-mode primary
  primary: teal[400],
  primaryHover: teal[300],
  primaryMuted: "rgba(52,191,187,0.14)",
  onPrimaryMuted: teal[300],
  focusRing: teal[400],
  danger: hue.red400,
  dangerMuted: "rgba(248,113,113,0.12)",
  success: hue.emerald400,
  warning: hue.amber400,
  inputBg: "#0F1A2E",
  inputBorder: "#2A3850",
  placeholder: slate[500],
  overlay: "rgba(0,0,0,0.6)",
};

// Evidence-grade hues per mode (brighter on dark for contrast on near-black).
const lightGrade: Record<EvidenceGrade, string> = {
  very_strong: hue.emerald700,
  strong: hue.emerald600,
  moderate: hue.amber600,
  weak: hue.orange600,
  very_weak: hue.red600,
  unknown: slate[500],
  not_applicable: slate[400],
};

const darkGrade: Record<EvidenceGrade, string> = {
  very_strong: hue.emerald400,
  strong: hue.emerald400,
  moderate: hue.amber400,
  weak: hue.orange400,
  very_weak: hue.red400,
  unknown: slate[400],
  not_applicable: slate[500],
};

// Dark shadows are mostly inert (a near-black canvas hides them); depth comes from
// borders + surface lift instead.
const darkShadow: Record<"sm" | "md" | "lg", ShadowToken> = {
  sm: { ...shadow.sm, shadowOpacity: 0, elevation: 0 },
  md: { ...shadow.md, shadowColor: "#000000", shadowOpacity: 0.4, elevation: 2 },
  lg: { ...shadow.lg, shadowColor: "#000000", shadowOpacity: 0.5, elevation: 4 },
};

export const lightTheme: Theme = { mode: "light", color: lightColors, grade: lightGrade, shadow };
export const darkTheme: Theme = { mode: "dark", color: darkColors, grade: darkGrade, shadow: darkShadow };

export function themeFor(mode: ThemeMode): Theme {
  return mode === "dark" ? darkTheme : lightTheme;
}

/** Resolve an evidence grade to its themed color, falling back to `unknown` for an
 *  unrecognized value (fail-soft: never returns undefined into a style). */
export function evidenceGradeColor(theme: Theme, grade: string): string {
  return theme.grade[grade as EvidenceGrade] ?? theme.grade.unknown;
}

// WCAG relative luminance of a solid hex color.
function relativeLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const channel = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(channel(0)) + 0.7152 * lin(channel(2)) + 0.0722 * lin(channel(4));
}

/** Pick readable ink (near-black or white) for text on a SOLID hex background. Used
 *  by badges so a bright (dark-mode) grade color doesn't get unreadable white text,
 *  and a pale neutral doesn't either. Non-hex inputs fall back to white. */
export function onColor(bg: string): string {
  if (!bg.startsWith("#")) return "#FFFFFF";
  return relativeLuminance(bg) > 0.34 ? slate[950] : "#FFFFFF";
}
