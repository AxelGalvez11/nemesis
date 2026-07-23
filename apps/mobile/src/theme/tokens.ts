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

// THE CONTROL SCALE — the same idea as the text scale below, for the round
// icon buttons (owner 2026-07-23: "make sure all buttons and liquid glass
// components have standardize size. make sure there arent any square
// buttons"). Before this the app shipped 28 · 32 · 34 · 36 · 38 · 40 · 44 · 46
// across nine files, each tuned in isolation, and two of them were rounded
// SQUARES rather than circles.
//
// TWO RULES, and they're the whole standard:
//  1. A square-aspect control takes width AND height from here.
//  2. Its borderRadius is exactly half that, so it is a circle — never a
//     rounded square.
//
// Deliberately NOT in this ladder, because they aren't icon buttons: calendar
// day cells, colour swatches, the delete-account checkbox (a checkbox is square
// by convention), sheet grab handles, and status dots.
export const control = {
  /** Primary floating actions — the Study modes FAB, the note toolbar's row of
   *  six. Deliberately larger than a header button (owner 2026-07-22: "make the
   *  buttons bigger in the notes library, because they look a bit small"). */
  xl: 52,
  /** Floating chrome and screen headers — 44pt, iOS's comfortable minimum.
   *  These buttons sit alone over content, with no neighbours to aim by. */
  lg: 44,
  /** Inline in a card or a composer row, where the row itself guides the thumb. */
  md: 36,
  /** Dismissing a sheet, clearing a chip — the surface behind it is the real
   *  target, so the control can sit back. */
  sm: 32,
} as const;

// 4pt spacing grid.
export const space = (n: number): number => n * 4;

// Type ramp bumped ~1.155× the desktop tokens.json sizes for on-phone readability. Two owner
// calls stacked here: the first ~1.1× pass (2026-07-18), then a further slight ~1.05× nudge
// (owner: "increase app scale slightly", 2026-07-18). This is STILL a text-only change — every
// token-driven text style lifts, but fixed-size controls (buttons, icons, FABs) are tuned
// per-screen, not here, so enlarging them stays a separate pass (kept apart deliberately: bigger
// controls can re-open the very clipping/edge issues fixed in the same batch). Rounded to 0.5pt;
// revert to desktop parity by dividing these back by ~1.155.
// THE TEXT SCALE. Every piece of prose or UI copy in the app takes its size
// from here (owner 2026-07-23: "make sure all text size is standardized across
// the app") — a screen should never write its own `fontSize`.
//
// Four kinds of thing are deliberately exempt, and a `fontSize` you find in one
// of them is intentional, not an oversight:
//  - GLYPHS used as icons — the ‹ › chevrons, the ··· dots, the ✕. They're
//    sized like icons because that's what they are.
//  - theme/markdown.ts, which carries its own scale ~1.15x this one (owner
//    2026-07-19: the app-wide size bump hadn't reached AI answers, which render
//    through that map rather than these tokens).
//  - Text inside a drawing — SVG numerals in note-toolbar-icons.tsx, and the
//    graph's node labels, which live in a canvas that zooms.
//  - review.tsx's 20pt card body: a flashcard is read at arm's length, and that
//    screen is a self-contained reading surface.
export const type = {
  // System font, same as the desktop app (tokens.json font.family = "system").
  family: undefined as string | undefined,
  /** Big standalone figures — a Study stat, an avatar's initial. Sits between
   *  h1 and h2 because those numbers read as ornament, not as a page heading;
   *  it exists so they stop being ad-hoc fontSizes (owner 2026-07-23: "make
   *  sure all text size is standardized across the app"). */
  display: { fontSize: 26, lineHeight: 32, fontWeight: "700" as const },
  h1: { fontSize: 30, lineHeight: 37, fontWeight: "700" as const },
  h2: { fontSize: 22, lineHeight: 29, fontWeight: "700" as const },
  title: { fontSize: 18.5, lineHeight: 25, fontWeight: "600" as const },
  body: { fontSize: 18, lineHeight: 28, fontWeight: "400" as const },
  bodyStrong: { fontSize: 18, lineHeight: 28, fontWeight: "500" as const },
  small: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
  micro: { fontSize: 12.5, lineHeight: 17.5, fontWeight: "500" as const },
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
