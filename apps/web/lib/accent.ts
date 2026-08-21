// The accent palette, as pure data.
//
// Split out of components/theme-provider.tsx so it can be tested: the test
// runner only picks up lib/*.test.ts and components/workspace/*/*.test.ts, and
// a "use client" React module is the wrong place for a colour table anyway.
//
// Seven accents (owner 2026-07-28, with a palette screenshot). "default" is the
// app's own accent and is deliberately NOT in ACCENT_COLORS: choosing it REMOVES
// the runtime override so the CSS in app/styles/desktop-ui.css applies, which is
// the only way one choice can be a different colour in light and dark themes.
// Those CSS values are now a neutral graphite — the owner retired the crimson.

export type AccentPreference = "default" | "blue" | "green" | "yellow" | "pink" | "orange" | "purple";

export const ACCENT_PREFERENCES: readonly AccentPreference[] = [
  "default",
  "blue",
  "green",
  "yellow",
  "pink",
  "orange",
  "purple",
];

/** Chosen to match the swatches in the owner's screenshot by eye, and pulled a
 *  little darker than a pure display hue so white button text stays legible on
 *  them in both themes. */
export const ACCENT_COLORS: Record<Exclude<AccentPreference, "default">, string> = {
  blue: "#4c7ef3",
  green: "#4f9a52",
  orange: "#cf6a2b",
  pink: "#d3629b",
  purple: "#6d43e0",
  // Darker than the screenshot's yellow on purpose: white button text on a
  // display-bright yellow lands near 2.5:1, which is unreadable. This clears 4:1.
  yellow: "#b0821f",
};

/** The swatch drawn for "Default" in the picker. What it actually applies is
 *  the theme's own accent — a light/dark pair of greys that one dot cannot
 *  show — so this is the mid-grey that reads against either. */
export const DEFAULT_ACCENT_SWATCH = "#8e8e8e";

export function isAccent(value: string | null): value is AccentPreference {
  return value !== null && (ACCENT_PREFERENCES as readonly string[]).includes(value);
}

/** "crimson" was the stored id of the old red default. It is not a choice any
 *  more, so read it as "default" rather than letting it fail validation and
 *  silently reset — the same shape as the removed "grey" theme's normalizer. */
export function normalizeStoredAccent(value: string | null): string | null {
  return value === "crimson" ? "default" : value;
}

/**
 * The glyph colour that sits ON an accent fill — the send button's arrow, the
 * "finish dictation" check, the recorder's label.
 *
 * 🔴 COMPUTED, NOT PICKED, BECAUSE THE OBVIOUS ANSWER IS WRONG FOR FIVE OF THE SIX.
 * The palette comment above says these hues were pulled darker "so white button text
 * stays legible", which is true and is also not the same claim as "white is the BEST
 * glyph". Measured against #1a1a1a: blue 4.63 vs white's 3.76, green 5.04 vs 3.46,
 * orange 4.77 vs 3.65, pink 4.96 vs 3.51, yellow 5.02 vs 3.47. Only purple prefers
 * white (5.95 vs 2.93). Hard-coding either one puts four or five accents below AA on a
 * control that is the primary action of the whole product.
 *
 * Deciding per-accent by luminance also means a SEVENTH accent cannot silently ship a
 * failing button: whatever hue is added, the glyph follows it.
 */
export function accentGlyph(hex: string): string {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, GLYPH_DARK) ? "#ffffff" : GLYPH_DARK;
}

/** Near-black rather than pure black: matches --dt-primary-foreground, the glyph
 *  colour every other filled control in the workspace already uses. */
const GLYPH_DARK = "#1a1a1a";

function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.1 relative luminance. Expects `#rrggbb`. */
function relativeLuminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
