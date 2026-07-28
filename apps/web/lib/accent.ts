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
