// The accent palette, as pure data.
//
// 🔴 A COPY OF apps/web/lib/accent.ts, TRIMMED. This site has its own workspace and Vercel
// deploys `landing/` alone, so it cannot import from the app — the same reason the avatar
// engine is copied beside it. What is dropped is everything only a picker needs: there is
// no settings screen here and no stored preference, so there is no storage key, no
// pre-paint script and no list of properties to clear. What is KEPT is the part the two
// have to agree on — the twelve hues and the rule for making one of them legible on a
// surface. If the palette moves in the app, copy this again.

export type AccentPreference =
  | "black"
  | "brown"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "pink"
  | "default"
  | "cream";

/** Picker order. Two rows of six in the owner's screenshot; grey is eleventh. */
export const ACCENT_PREFERENCES: readonly AccentPreference[] = [
  "black",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "default",
  "cream",
];

/**
 * The hues, exactly as the owner gave them.
 *
 * 🔴 NOT ADJUSTED. The previous palette pulled every hue darker than its swatch "so white
 * button text stays legible", which meant the dot in the picker was never quite the colour
 * you got. These are the screenshot's own values and they are what the swatch shows and
 * what the character wears. Where a colour genuinely cannot carry a control — near-black on
 * a black page, near-white on a white one — `accentFill` moves it for THAT SURFACE ONLY,
 * as little as it can. See below.
 */
export const ACCENT_COLORS: Record<Exclude<AccentPreference, "default">, string> = {
  black: "#0a0a0c",
  brown: "#8b5e3c",
  red: "#e8483f",
  orange: "#f08a24",
  yellow: "#f0b429",
  green: "#3ecf8e",
  teal: "#2fbfa0",
  blue: "#3b93f0",
  purple: "#8b5cf6",
  pink: "#e152b0",
  cream: "#f1efe9",
};

/** Human labels for the picker. */
export const ACCENT_LABELS: Record<AccentPreference, string> = {
  black: "Black",
  brown: "Brown",
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  default: "Default",
  cream: "Cream",
};

/** The swatch drawn for "Default" — the grey from the screenshot. What it applies is the
 *  theme's own neutral, a light/dark pair one dot cannot show. */
export const DEFAULT_ACCENT_SWATCH = "#a3a3a3";

export function isAccent(value: string | null): value is AccentPreference {
  return value !== null && (ACCENT_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Reads a stored choice that an older build wrote.
 *
 * 🔴 A NAME THAT SURVIVED KEEPS ITS SETTING EVEN THOUGH ITS HEX MOVED. `blue` was
 * #4c7ef3 and is now #3b93f0; someone who picked Blue still has Blue. Only ids that no
 * longer exist are mapped, and they map to the nearest thing rather than resetting —
 * silently dropping someone back to Default is the failure this function exists to stop.
 */
export function normalizeStoredAccent(value: string | null): string | null {
  // "crimson" was the retired red default; "grey" was a removed theme id.
  if (value === "crimson" || value === "grey") return "default";
  return value;
}

// ── Making a hue usable on a surface ────────────────────────────────────────────

/** The page behind a control, per theme. Dark's ground is pure black — see desktop-ui.css. */
const GROUND_LIGHT = "#ffffff";
const GROUND_DARK = "#000000";

/**
 * How far a fill must separate from the page to read as a control at all.
 *
 * Below this the button is invisible and only its glyph shows, which reads as a floating
 * arrow rather than as a send button.
 *
 * 🔴 1.8 IS DELIBERATELY LOW, AND 2.2 WAS TRIED FIRST. This is not the WCAG figure for
 * non-text contrast (3:1) because these controls are not carried by their edge — they are
 * large, filled, and carry a glyph that IS held to AA. Set at 2.2 it dragged `yellow` and
 * `green` darker as collateral, so the dot in the picker stopped matching the button, which
 * is the exact failure the previous palette had. At 1.8 the only colours that move are the
 * ones that are genuinely invisible, and the other nine are pixel-exact in both themes.
 */
const MIN_AGAINST_GROUND = 1.8;

/** WCAG AA for the glyph that sits on the fill. */
const MIN_GLYPH = 4.5;

/**
 * The accent as a filled control, in one theme.
 *
 * 🔴 NINE OF THE TWELVE COME BACK UNTOUCHED, AND THAT IS THE DESIGN. This is not a
 * blanket "darken everything until it is safe" — that is what the last palette did, and it
 * is why the picker's dots did not match what you got. It moves a colour only when the
 * colour genuinely cannot do this job:
 *
 *   - `black` on the dark theme reads 1.02:1 against a pure black page. Invisible.
 *   - `cream` on the light theme reads 1.15:1 against white. Invisible.
 *   - `purple` carries neither a white nor a near-black glyph at AA — it sits at 4.23:1
 *     against both, in the gap between them.
 *
 * Everything else is returned exactly as authored, in both themes.
 *
 * 🔴 IT NUDGES RATHER THAN INVERTS. Lifting `black` all the way to the theme's near-white
 * ink would make it identical to `cream` in dark mode, so two different choices would
 * produce one colour. Stepping just far enough keeps it recognisably the near-black one.
 */
export function accentFill(hex: string, dark: boolean): string {
  const ground = dark ? GROUND_DARK : GROUND_LIGHT;
  let fill = hex;
  // Away from the page: lighter on a dark ground, darker on a light one.
  for (let i = 0; i < 100 && contrastRatio(fill, ground) < MIN_AGAINST_GROUND; i++) {
    fill = mix(fill, dark ? "#ffffff" : "#000000", 0.02);
  }
  // And then far enough from the middle that a glyph can be read on it. Toward black,
  // because a white glyph on a slightly deeper hue keeps the hue; the other direction
  // washes it out.
  for (let i = 0; i < 100 && bestGlyphRatio(fill) < MIN_GLYPH; i++) {
    fill = mix(fill, "#000000", 0.02);
  }
  return fill;
}

const bestGlyphRatio = (hex: string): number =>
  Math.max(contrastRatio(hex, "#ffffff"), contrastRatio(hex, GLYPH_DARK));

/** Blends `amount` of `to` into `from`. Plain sRGB — these are small steps. */
function mix(from: string, to: string, amount: number): string {
  const channel = (offset: number): string => {
    const a = parseInt(from.slice(offset, offset + 2), 16);
    const b = parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/**
 * The glyph colour that sits ON an accent fill — the send button's arrow, the "finish
 * dictation" check, the recorder's label.
 *
 * 🔴 COMPUTED, NOT PICKED, BECAUSE THE OBVIOUS ANSWER IS WRONG FOR MOST OF THEM. White
 * looks like the safe choice and is the worse one on nine of these twelve: on `yellow` it
 * lands at 1.86:1 and on `cream` at 1.15:1, both unreadable, while a near-black glyph
 * clears 9:1 and 15:1. Deciding per-accent by luminance also means a thirteenth colour
 * cannot silently ship a failing button: whatever hue is added, the glyph follows it.
 */
export function accentGlyph(hex: string): string {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, GLYPH_DARK) ? "#ffffff" : GLYPH_DARK;
}

/** Near-black rather than pure black: matches --dt-primary-foreground, the glyph colour
 *  every other filled control in the workspace already uses. */
const GLYPH_DARK = "#1a1a1a";

function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** WCAG 2.1 relative luminance. Expects `#rrggbb`. */
function relativeLuminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
