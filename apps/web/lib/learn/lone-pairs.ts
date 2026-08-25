// The dots an arrow comes from.
//
// 🔴🔴🔴 THE OWNER SENT A TEXTBOOK MECHANISM AND ASKED WHY OURS DOES NOT LOOK LIKE IT, 2026-08-25.
// The first answer is these: every curly arrow in that picture starts ON a pair of dots. Without
// them an arrow has nothing to come from, so it reads as decoration drawn over a molecule rather
// than as electrons moving, which is the whole content of a mechanism.
//
// 🔴 COUNTED, NOT GUESSED, AND NOT ASKED OF THE MODEL EITHER. How many lone pairs an atom carries
// is arithmetic on its element, its charge, its hydrogens and its bonds. All four are facts the
// depiction already holds, so this is the same house rule as everywhere else: the model names the
// molecule, trusted code works out what to draw. A model stating dot counts would be a model
// drawing, and it would be confidently wrong on exactly the charged intermediates that matter.
//
// PURE. No DOM, no drawer. Given numbers, returns points.

/**
 * Valence electrons, for the main-group elements a mechanism is written with.
 *
 * 🔴 NO TRANSITION METALS. Their electron count is not this arithmetic, and a d-block atom that
 * fell through to a wrong number would put confident nonsense on a picture the learner is being
 * marked against. An element that is not here draws no dots at all, which is honest.
 */
const VALENCE: Readonly<Record<string, number>> = {
  As: 5,
  B: 3,
  Br: 7,
  C: 4,
  Cl: 7,
  F: 7,
  I: 7,
  N: 5,
  O: 6,
  P: 5,
  S: 6,
  Se: 6,
  Si: 4,
  Te: 6,
};

/** Eight electrons around one atom is four pairs, and chloride really does carry all four. */
const MAX_PAIRS = 4;

export interface LonePairAtom {
  /** The element symbol, as the notation spells it: "O", "Cl", "N". */
  readonly element: string;
  /** Formal charge. Negative adds an electron, positive removes one. */
  readonly charge: number;
  /** Hydrogens attached, implicit ones included. */
  readonly hydrogens: number;
  /** The sum of the bond ORDERS to heavy atoms: a double bond counts two. */
  readonly bondOrder: number;
}

/**
 * How many lone pairs this atom carries.
 *
 * Worked through on the cases a mechanism actually contains:
 *
 *   ether O, two single bonds        (6 − 0 − 2 − 0) / 2 = 2
 *   carbonyl O, one double bond      (6 − 0 − 2 − 0) / 2 = 2
 *   alkoxide O⁻, one bond            (6 + 1 − 1 − 0) / 2 = 3
 *   amine N, three bonds             (5 − 0 − 3 − 0) / 2 = 1
 *   amide anion N⁻, two bonds + H    (5 + 1 − 2 − 1) / 2 = 1
 *   ammonium N⁺, four bonds          (5 − 1 − 4 − 0) / 2 = 0
 *   chloride Cl⁻, no bonds           (7 + 1 − 0 − 0) / 2 = 4
 *   a skeletal CH3 carbon            (4 − 0 − 1 − 3) / 2 = 0
 *
 * 🔴 IT ROUNDS DOWN, WHICH IS WHAT MAKES AROMATIC NITROGEN COME OUT RIGHT. A pyridine N sits in two
 * aromatic bonds worth 1.5 each, so 5 − 3 = 2, one pair, and the picture shows the pair that does
 * the chemistry. A pyrrole N also carries an H, leaving half a pair, and rounding down draws none:
 * that lone pair is in the ring's π system and a textbook does not put dots on it either.
 */
export function lonePairCount(atom: LonePairAtom): number {
  const valence = VALENCE[atom.element];
  if (valence === undefined) return 0;
  const spare = valence - atom.charge - atom.bondOrder - atom.hydrogens;
  if (!Number.isFinite(spare)) return 0;
  return Math.max(0, Math.min(MAX_PAIRS, Math.floor(spare / 2)));
}

const TAU = Math.PI * 2;
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU;

/**
 * Directions to hang `count` lone pairs in, given where this atom's bonds already point.
 *
 * 🔴 THE DOTS GO IN THE GAPS, because that is both where a chemist draws them and the only place
 * they can be read. A fixed arrangement (north, south, east, west) puts a pair on top of a bond on
 * most atoms, and on a mechanism picture the reader then cannot tell a lone pair from a bond end.
 *
 * The widest gap is taken first and then split, so a halogen with one bond gets its three pairs
 * spread around the far side rather than stacked, and an ether oxygen gets one pair either side.
 */
export function lonePairDirections(bondAngles: readonly number[], count: number): number[] {
  if (count <= 0) return [];
  const bonds = [...bondAngles].map(wrap).sort((a, b) => a - b);
  // A bare ion has no bonds to avoid, so the pairs simply space themselves.
  if (!bonds.length) return Array.from({ length: count }, (_, index) => wrap(Math.PI / 2 + (index * TAU) / count));

  let slots = bonds.map((angle, index) => {
    const next = index + 1 < bonds.length ? bonds[index + 1]! : bonds[0]! + TAU;
    return { from: angle, to: next };
  });
  const chosen: number[] = [];
  while (chosen.length < count) {
    slots.sort((a, b) => b.to - b.from - (a.to - a.from));
    const widest = slots.shift();
    if (!widest) break;
    const middle = (widest.from + widest.to) / 2;
    chosen.push(middle);
    slots = [...slots, { from: widest.from, to: middle }, { from: middle, to: widest.to }];
  }
  return chosen.map(wrap);
}

export interface LonePairDots {
  /** Where the pair sits, for an arrow that starts from it. */
  readonly at: { readonly x: number; readonly y: number };
  /** The two dots themselves. */
  readonly dots: readonly { readonly x: number; readonly y: number }[];
}

/**
 * The dots for one atom, in the drawing's own units.
 *
 * 🔴 THE PAIR'S OWN POINT IS RETURNED ALONGSIDE ITS DOTS, and that is what makes the arrows right.
 * A mechanism arrow does not start at an atom's centre, it starts at the pair that is moving, so
 * the geometry that draws the dots is the same geometry the arrow has to begin from.
 */
export function lonePairDots(
  centre: { readonly x: number; readonly y: number },
  bondAngles: readonly number[],
  count: number,
  reach: number | ((angle: number) => number),
  gap: number,
): LonePairDots[] {
  // 🔴 HOW FAR OUT DEPENDS ON WHICH WAY, BECAUSE A LABEL IS NOT A CIRCLE. "Br" and "O⁻H" are far
  // wider than they are tall, so one radius for every direction puts the sideways pairs INSIDE the
  // lettering — measured on the first render of this feature. The caller passes the real half-width
  // of the drawn text for each direction; a plain number still works for anything round.
  const reachAt = typeof reach === "function" ? reach : () => reach;
  return lonePairDirections(bondAngles, count).map((angle) => {
    const radius = reachAt(angle);
    const at = { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
    // The two dots straddle that point, square on to the direction they hang in.
    const px = -Math.sin(angle) * (gap / 2);
    const py = Math.cos(angle) * (gap / 2);
    return { at, dots: [{ x: at.x + px, y: at.y + py }, { x: at.x - px, y: at.y - py }] };
  });
}
