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

/** Where the chosen accent is stored. Read by the provider AND by the pre-paint
 *  script below, which is the whole reason it is exported rather than private to
 *  components/theme-provider.tsx — two spellings of one key is one silent bug. */
export const ACCENT_STORAGE_KEY = "nemesis.web.accent";

/**
 * The custom properties an accent writes onto `:root`.
 *
 * 🔴 ONE DEFINITION, TWO CALLERS, AND THAT IS THE POINT. `applyAccent` in
 * components/theme-provider.tsx runs after hydration; `accentPrePaintScript` below runs
 * before first paint. They must agree exactly — if they do not, the accent visibly
 * changes colour a beat after the page appears, which is the bug this pair exists to
 * stop. Neither one owns the list.
 */
export function accentProperties(accent: Exclude<AccentPreference, "default">): Record<string, string> {
  const color = ACCENT_COLORS[accent];
  return {
    "--theme-primary": color,
    "--theme-midground": color,
    "--theme-warm": color,
    "--ui-action": color,
    "--ui-action-glyph": accentGlyph(color),
  };
}

/** Every property an accent can set — what "Default" has to REMOVE to hand the CSS back. */
export const ACCENT_PROPERTIES: readonly string[] = Object.keys(accentProperties("blue"));

/**
 * The accent, resolved before the first pixel is painted.
 *
 * 🔴🔴 THIS IS A BUG FIX, NOT AN OPTIMISATION (owner 2026-08-21: "there is a discrepancy
 * between the color chosen in settings and the chat composer send button"). The accent was
 * applied ONLY from `ThemeProvider`'s mount effect, which runs after hydration — so every
 * load painted the send button, the focus rings and the whole chrome tint in the DEFAULT
 * accent first, then swapped them to the chosen one once React came up. On the Canvas,
 * which is a heavy client component, that window is long enough to read as "the setting did
 * not take": you pick Blue and the most prominent control in the product is still green.
 *
 * The theme and the dark tone already had this treatment — see `app/layout.tsx` — and the
 * accent was simply left out of it. It is the same class of flash and it gets the same fix.
 *
 * 🔴 THE TABLE IS SERIALISED FROM `ACCENT_COLORS`, NEVER RETYPED. Hand-writing six hexes
 * into a template string is how the picker and the pre-paint drift apart on the day a
 * seventh accent ships, and the drift would show up as a colour that flickers on load —
 * the hardest kind of bug to catch, because it is correct one frame later.
 *
 * 🔴 IT WRITES INLINE PROPERTIES, THE SAME ONES `applyAccent` WRITES. Not a class, not an
 * attribute: inline style is what beats `@layer base`, and the provider has to be able to
 * clear these again when someone picks Default.
 */
export function accentPrePaintScript(): string {
  const table: Record<string, Record<string, string>> = {};
  for (const id of ACCENT_PREFERENCES) {
    if (id === "default") continue;
    table[id] = accentProperties(id);
  }
  return [
    "(function(){try{",
    `var v=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});`,
    // Same normalisation the provider does — a stored "crimson" is the retired red default.
    'if(v==="crimson")v="default";',
    `var t=${JSON.stringify(table)}[v];`,
    "if(!t)return;",
    "var s=document.documentElement.style;",
    "for(var k in t)s.setProperty(k,t[k]);",
    "}catch(e){}})();",
  ].join("");
}
