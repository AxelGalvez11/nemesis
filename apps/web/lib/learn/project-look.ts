// What a project looks like: its glyph's colour, in one place.
//
// 🔴🔴 THE COLOUR CAME BACK, AND IT IS NOT THE ACCENT COMING BACK WITH IT. Owner, 2026-09-03:
// *"allow projects to have color too. and allow user to choose that color in the project
// settings."* This reverses his own 2026-09-03 removal (*"remove any color accents throughout the
// app"*), and the distinction is the same one #1097 drew when the file-kind tints were restored
// hours after the same sweep took them:
//
//   * THE ACCENT is the character's colour. The learner picks it once, it changes, and it means
//     "act here" — which is why it reaches the mascot, the send button and the chat bubble and
//     nothing else. `accent.test.ts` still guards that boundary and nothing here touches it.
//   * A PROJECT COLOUR is an identity the learner assigned to one project so they can find it in a
//     list. It never means "act here", it never moves, and it is theirs rather than the product's.
//
// A green flask in the sidebar was what prompted the original sweep, and it was a fair complaint:
// at the time the colour was applied with no way to change or clear it. It is a setting now.
//
// 🔴 STORED AS A HEX, RENDERED AS A TOKEN, AND THAT IS THE WHOLE TRICK. `folders.color` carries a
// `CHECK (color ~ '^#[0-9a-fA-F]{6}$')` constraint, so the database wants a literal. But a literal
// hex is a single value for two themes: a mid-tone that reads on white is dim on near-black and
// vice versa, and neither can be checked once. So each swatch is stored as its LIGHT hex and drawn
// through the matching `--ui-kind-*` custom property, which desktop-ui.css already defines twice —
// once per theme, both already checked at the 3:1 bar when #1097 restored them. One palette,
// contrast-checked once, used for two different jobs.
//
// PURE. No React, no I/O.

/** One choice a learner can make: the value stored, and the token it draws through. */
export interface ProjectColor {
  /** What goes in `folders.color`. Must satisfy the database's `#RRGGBB` shape constraint. */
  readonly hex: string;
  /** The custom property NAME, without `var()`. Defined for both themes in desktop-ui.css. */
  readonly token: string;
  /** For the swatch's own label. */
  readonly name: string;
}

/**
 * 🔴 THE LIGHT-THEME VALUES OF `--ui-kind-*`, VALUE FOR VALUE. They are not copied here to be a
 * second palette — they are the KEY that finds the token, so a swatch and its token can never
 * disagree about which colour it is. If a value in desktop-ui.css changes, change it here too;
 * `project-customization.test.ts` reads the stylesheet and holds the two together.
 */
export const PROJECT_COLORS: readonly ProjectColor[] = [
  { hex: "#2f6fd0", name: "Blue", token: "--ui-kind-blue" },
  { hex: "#cf2d56", name: "Red", token: "--ui-kind-red" },
  { hex: "#1f8a65", name: "Green", token: "--ui-kind-green" },
  { hex: "#c08532", name: "Amber", token: "--ui-kind-amber" },
  { hex: "#7a6fc0", name: "Purple", token: "--ui-kind-purple" },
  { hex: "#3f7d8c", name: "Teal", token: "--ui-kind-cyan" },
];

/**
 * The style a project's glyph should wear, or `undefined` for the default.
 *
 * 🔴 AN UNKNOWN HEX IS DRAWN LITERALLY RATHER THAN DISCARDED. `folders.color` has held whatever
 * anyone picked since 2026-08-30, including from a palette that no longer exists. Ignoring those
 * rows would silently reset a colour the learner chose; drawing them as themselves is honest, and
 * the moment they open the picker they land on a real swatch.
 *
 * 🔴 `undefined`, NOT `{}`. A style object that sets nothing still re-renders as a new object every
 * call; returning undefined lets the glyph inherit, which is what "no colour" means.
 */
export function projectTint(project: { color?: string | null } | null | undefined): { color: string } | undefined {
  const chosen = project?.color?.trim();
  if (!chosen) return undefined;
  const known = PROJECT_COLORS.find((entry) => entry.hex.toLowerCase() === chosen.toLowerCase());
  return { color: known ? `var(${known.token})` : chosen };
}
