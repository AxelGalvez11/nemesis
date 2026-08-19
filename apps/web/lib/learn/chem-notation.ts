// A canonical chemical structure, checked before anything draws it (§42).
//
// 🔴 THIS IS THE EQUATION LANE WITH A DIFFERENT NOTATION, AND THAT IS THE WHOLE DESIGN. A model
// asked for a structure does not produce pixels and does not produce SVG: it produces a SMILES
// string, exactly as it produces LaTeX for an equation, and trusted code below this boundary owns
// every atom that reaches the screen. A benzene ring has an exact answer, so generating one as
// pixels is the wrong instrument — an image model draws what such a picture usually looks like,
// which for chemistry means plausible bonds in the wrong places.
//
// 🔴 A SHAPE CHECK, NOT A CHEMISTRY ENGINE, AND THE SPLIT IS DELIBERATE. This module cannot tell
// you that a valence is impossible or that a ring is aromatic; the depiction library's own parser
// does that at draw time and refuses what it cannot read. What this catches is the class of input
// that must never reach a parser at all — prose where notation belongs, markup, something
// unbounded — plus the two structural errors a grammar accepts and a chemist would not: unbalanced
// brackets and a ring bond opened and never closed.
//
// 🔴 IT HAS NO DEPENDENCIES ON PURPOSE. `canvas-visual.ts` is imported by pure tests that run with
// no packages installed; reaching for the depiction library here would make the spec layer need a
// browser bundle to answer "is this a plausible string". Same reason `canvas-visual.ts` refuses
// `\href` by name rather than asking KaTeX.

/**
 * Which canonical form the value is written in.
 *
 * 🔴 REACTIONS ARE A SEPARATE NOTATION, NOT A SMILES THAT HAPPENS TO CONTAIN `>`. Auto-detecting
 * one from the other would make "we do not draw reactions" indistinguishable from "that reaction
 * was malformed", and the `structure-unsupported-notation` refusal exists precisely to keep a
 * capability gap countable. Naming it also means the teaching model has to decide which it is
 * asking for, which is the decision a reaction question turns on.
 */
export type ChemNotation = "reaction-smiles" | "smiles";

/**
 * Every character SMILES may contain.
 *
 * 🔴 AN ALLOW LIST, AND IT IS THE ONE CHECK THAT MATTERS MOST. SMILES has an unusually small
 * alphabet, so anything outside it is not a molecule that failed — it is prose, a sentence, a
 * markup fragment, or a model narrating instead of answering. Refusing on the alphabet means the
 * common failure never reaches a parser at all.
 *
 * Included beyond the obvious: `@` for stereocentres, `/` and `\` for double-bond geometry, `%`
 * for two-digit ring closures, `.` for disconnected components (a salt), `+`/`-` for charges.
 */
const SMILES_ALPHABET = /^[A-Za-z0-9@+\-[\]()=#$:/\\%.*]+$/;

/**
 * The longest structure Nemesis will draw.
 *
 * 🔴 A TEACHING BOUND, NOT A PARSER ONE. Aspirin is 21 characters and a hard exam molecule rarely
 * passes 120; past this the depiction is a hairball no learner reads, and the right representation
 * is a macromolecular one Nemesis does not have (§42). Bounding here means the cost of a runaway
 * string is a named refusal rather than a browser laying out ten thousand atoms.
 */
export const MAX_SMILES_LENGTH = 300;

/**
 * The longest reaction Nemesis will draw.
 *
 * Three molecule lists rather than one, so the bound is larger than `MAX_SMILES_LENGTH` — but not
 * three times larger. A scheme past this is a synthesis route, which wants to be several steps the
 * learner walks through rather than one picture they squint at.
 */
export const MAX_REACTION_LENGTH = 600;

/**
 * The reaction separator, and the two it divides.
 *
 * Reaction SMILES is `reactants>agents>products` — agents (catalysts, solvents, the conditions
 * over the arrow) sit in the middle and may be empty, which is why `A>>B` is legal and common.
 */
const REACTION_PARTS = 3;

export type ChemRefusal =
  /** Not a string, or empty after trimming. */
  | "structure-empty"
  /** Past `MAX_SMILES_LENGTH`. */
  | "structure-too-long"
  /** A character SMILES does not contain — prose, markup, or a model narrating. */
  | "structure-not-notation"
  /** `(`, `[` or an unmatched partner. A grammar catches this; naming it is cheaper than a throw. */
  | "structure-unbalanced"
  /**
   * A ring bond opened and never closed — `C1CC`.
   *
   * 🔴 ITS OWN REASON BECAUSE THE GRAMMAR ACCEPTS IT. Measured against the depiction library's own
   * parser: `C1CC` parses without error and then draws a molecule missing the ring that was the
   * whole point of the request. A structure that renders WRONG is worse than one that refuses,
   * because nothing downstream can tell it happened.
   */
  | "structure-unclosed-ring"
  /** A notation no trusted depiction owns. */
  | "structure-unsupported-notation"
  /**
   * A reaction that is not `reactants>agents>products`.
   *
   * 🔴 ITS OWN REASON RATHER THAN `structure-not-notation`, because the mistake is different in
   * kind. A missing `>` is a model that wrote one molecule where a reaction was asked for — a
   * misunderstanding of the question, not a typo in the chemistry — and the two want different
   * corrections.
   */
  | "structure-not-a-reaction"
  /** A reaction with no reactants or no products. An arrow needs both ends. */
  | "structure-half-a-reaction";

export type ChemValidation =
  | { ok: true; value: string }
  | { detail: string; ok: false; reason: ChemRefusal };

/**
 * Is this a string a chemical depiction library may safely be handed?
 *
 * Returns the trimmed value on success, so callers store what was checked rather than what arrived.
 */
export function validateSmiles(raw: unknown): ChemValidation {
  if (typeof raw !== "string") {
    return { detail: `expected a string, received ${typeof raw}`, ok: false, reason: "structure-empty" };
  }
  const value = raw.trim();
  if (!value) return { detail: "the structure is empty", ok: false, reason: "structure-empty" };
  if (value.length > MAX_SMILES_LENGTH) {
    return {
      detail: `${value.length} characters, past the ${MAX_SMILES_LENGTH} a learner can read as a drawing`,
      ok: false,
      reason: "structure-too-long",
    };
  }
  if (!SMILES_ALPHABET.test(value)) {
    const offending = [...value].find((character) => !SMILES_ALPHABET.test(character)) ?? "";
    return {
      detail: `${JSON.stringify(offending)} is not a SMILES character — this looks like prose rather than a structure`,
      ok: false,
      reason: "structure-not-notation",
    };
  }

  const brackets = balanced(value);
  if (brackets) return { detail: brackets, ok: false, reason: "structure-unbalanced" };

  const ring = unclosedRing(value);
  if (ring) return { detail: ring, ok: false, reason: "structure-unclosed-ring" };

  return { ok: true, value };
}

/**
 * Validate a reaction: `reactants>agents>products`.
 *
 * 🔴 EACH SIDE IS CHECKED AS ORDINARY SMILES, WHICH IS WHY THIS IS SHORT. A reaction is three
 * molecule lists separated by arrows, and every rule that makes a molecule drawable — the alphabet,
 * the balance, the ring closures — applies unchanged to each side. `detail` names WHICH side failed,
 * because "the products are malformed" and "the reactants are malformed" send a model to different
 * places.
 */
export function validateReaction(raw: unknown): ChemValidation {
  if (typeof raw !== "string") {
    return { detail: `expected a string, received ${typeof raw}`, ok: false, reason: "structure-empty" };
  }
  const value = raw.trim();
  if (!value) return { detail: "the reaction is empty", ok: false, reason: "structure-empty" };
  if (value.length > MAX_REACTION_LENGTH) {
    return {
      detail: `${value.length} characters, past the ${MAX_REACTION_LENGTH} a reaction scheme can stay readable at`,
      ok: false,
      reason: "structure-too-long",
    };
  }

  const parts = value.split(">");
  if (parts.length !== REACTION_PARTS) {
    return {
      detail:
        parts.length < REACTION_PARTS
          ? `a reaction is reactants>agents>products — this has ${parts.length - 1} arrow${parts.length === 2 ? "" : "s"}, not 2`
          : `a reaction has exactly 2 arrows — this has ${parts.length - 1}`,
      ok: false,
      reason: "structure-not-a-reaction",
    };
  }

  const [reactants, agents, products] = parts;
  if (!reactants.trim() || !products.trim()) {
    return {
      detail: !reactants.trim() ? "the reaction has no reactants" : "the reaction has no products",
      ok: false,
      reason: "structure-half-a-reaction",
    };
  }

  // 🔴 AGENTS MAY BE EMPTY AND THAT IS NORMAL. `A>>B` is the ordinary way to write a reaction whose
  // conditions are stated in words rather than as molecules, which is most of what a lesson shows.
  const sides: Array<[string, string]> = [["reactants", reactants], ["products", products]];
  if (agents.trim()) sides.push(["agents", agents]);
  for (const [side, text] of sides) {
    const checked = validateSmiles(text);
    if (!checked.ok) return { detail: `${side}: ${checked.detail}`, ok: false, reason: checked.reason };
  }

  return { ok: true, value };
}

/** Validate a value under a named notation. Anything unnamed is refused rather than guessed at. */
export function validateStructure(notation: unknown, value: unknown): ChemValidation {
  if (notation === "smiles") return validateSmiles(value);
  if (notation === "reaction-smiles") return validateReaction(value);
  return {
    detail: `no trusted depiction owns ${JSON.stringify(notation)} — resolve it to SMILES first`,
    ok: false,
    reason: "structure-unsupported-notation",
  };
}

/** `(` against `)` and `[` against `]`, reported by which one went wrong. */
function balanced(value: string): string | null {
  let round = 0;
  let square = 0;
  for (const character of value) {
    if (character === "(") round += 1;
    if (character === ")") round -= 1;
    if (character === "[") square += 1;
    if (character === "]") square -= 1;
    if (round < 0) return "a closing parenthesis with nothing open";
    if (square < 0) return "a closing bracket with nothing open";
  }
  if (round !== 0) return `${round} branch${round === 1 ? "" : "es"} opened and never closed`;
  if (square !== 0) return `${square} atom bracket${square === 1 ? "" : "s"} opened and never closed`;
  return null;
}

/**
 * Ring-closure digits must pair.
 *
 * 🔴 DIGITS INSIDE `[...]` ARE NOT RING BONDS, and missing that would refuse every charged or
 * isotopic atom. `[NH4+]` and `[13C]` carry digits that are counts and masses; only digits at the
 * top level close rings. `%12` is a single two-digit label rather than labels 1 and 2.
 */
function unclosedRing(value: string): string | null {
  const open = new Map<string, number>();
  let inBracket = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "[") { inBracket = true; continue; }
    if (character === "]") { inBracket = false; continue; }
    if (inBracket) continue;
    let label: string | null = null;
    if (character === "%") {
      label = value.slice(index + 1, index + 3);
      index += 2;
      if (label.length < 2 || !/^\d\d$/.test(label)) return "a % ring label is not two digits";
    } else if (/\d/.test(character)) {
      label = character;
    }
    if (label === null) continue;
    const count = (open.get(label) ?? 0) + 1;
    if (count === 2) open.delete(label);
    else open.set(label, count);
  }
  const dangling = [...open.keys()];
  if (dangling.length === 0) return null;
  return `ring bond${dangling.length === 1 ? "" : "s"} ${dangling.join(", ")} opened and never closed, so the ring would be drawn broken`;
}

/**
 * Does this structure state stereochemistry?
 *
 * 🔴 REPORTED RATHER THAN REQUIRED, AND IT IS THE FIELD A TEACHING SURFACE ACTUALLY NEEDS. Whether
 * a depiction shows a wedge is a question about the INPUT, not about the renderer: a SMILES with no
 * `@` and no `/` has no stereochemistry to lose, and a learner asked to identify a chiral centre on
 * a structure that never carried one has been asked an unanswerable question.
 */
export function statesStereochemistry(value: string): boolean {
  return /@|\/|\\/.test(value);
}
