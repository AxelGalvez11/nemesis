// Turning `<sub>2</sub>` and `<sup>-9</sup>` into characters that are ACTUALLY raised and lowered.
//
// Why this file exists at all, and why it is a lookup table rather than a style:
//
// 🔴 REACT NATIVE CANNOT SHIFT A BASELINE. CHECKED IN THE ENGINE, NOT ASSUMED. Every text style
// the renderer understands is listed in `TextAttributes.h`
// (`node_modules/react-native/ReactCommon/react/renderer/attributedstring/`), and it carries no
// baseline-offset field of any kind — iOS has `NSBaselineOffsetAttributeName`, React Native simply
// does not expose it. `fontVariant` is no way round it either: its enum (`primitives.h`) runs
// small-caps, oldstyle/lining/tabular/proportional numerals and the stylistic sets, with no
// superscript or subscript OpenType feature among them. So a nested <Text> can be made SMALLER,
// but it cannot be made LOWER — it stays on the paragraph's baseline. "H" with a small "2" beside
// it at full height is not H₂O; it reads as a typo.
//
// The web app has the opposite problem and the opposite answer: `apps/web/lib/workspace/
// chat-markdown.tsx` rewrites the tags into links and renders real `<sub>`/`<sup>` elements, which
// the browser shifts for free. That answer does not port, so the phone uses the one thing that is
// genuinely raised and lowered without engine support: Unicode's own sub/superscript characters.
// The FONT draws them in position, so they need no styling, they survive copy-and-paste, and a
// screen reader reads "H two O" rather than "H sub two".
//
// 🔴 THE TABLES ARE INCOMPLETE ON PURPOSE, AND THE GAPS ARE UNICODE'S, NOT OVERSIGHTS. There is no
// subscript "b", "c", "d", "f", "g", "q", "w", "y" or "z" in Unicode, and no superscript "q".
// Anything containing one of those cannot be spelled this way at all, which is exactly why
// `toUnicodeScript` is ALL-OR-NOTHING: half a word in raised glyphs and half in ordinary ones
// looks like a rendering fault. When any character is missing the caller gets null and falls back
// to small same-baseline text — not correct, but honest, legible, and far better than printing
// the literal tag. Capitals are left out of both tables for the same reason: Unicode has no
// superscript C, F, Q, S, X, Y or Z, so admitting the ones that do exist would produce a word in
// two different heights.
//
// Chemistry and exponents — the whole of what the owner actually reported — are digits and signs,
// and those are complete in both tables.

/** Lowercase letters, digits and signs that have a Unicode SUBSCRIPT form. */
const SUBSCRIPT: Readonly<Record<string, string>> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  // Both the ASCII hyphen and the real minus sign: a model writing an ion charge may type either.
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ",
  n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

/** Lowercase letters, digits and signs that have a Unicode SUPERSCRIPT form. */
const SUPERSCRIPT: Readonly<Record<string, string>> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ",
  j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ",
  t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
};

export type ScriptKind = "sub" | "sup";

/**
 * The Unicode sub/superscript spelling of `text`, or null when even one character has no such
 * form. Null is the signal to fall back — see this file's header for why it is all-or-nothing.
 *
 * Case-insensitive on input because the tables are lowercase and Unicode has no usable capitals;
 * "N" in a superscript comes back as "ⁿ", which is the accepted convention for exponents and is
 * still incomparably better than the literal tag the reader sees today.
 */
export function toUnicodeScript(text: string, kind: ScriptKind): string | null {
  if (!text) return null;
  const table = kind === "sub" ? SUBSCRIPT : SUPERSCRIPT;
  let out = "";
  // Iterating the string yields whole code points, so an emoji or accented letter arrives in one
  // piece and simply misses the table rather than being split into halves that each miss it.
  for (const character of text) {
    const mapped = table[character.toLowerCase()];
    if (mapped === undefined) return null;
    out += mapped;
  }
  return out;
}
