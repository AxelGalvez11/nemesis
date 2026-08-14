// What a labelled diagram names, and where (§46.6).
//
// 🔴 THIS IS THE FIRST LINK OF THE CHAIN, AND IT WAS THE MISSING ONE. §46.6 asks for image
// occlusion — "hiding labels or regions, asking the learner to identify them, progressive reveal,
// spatial recall". Every one of those needs to know WHAT is named and WHERE it sits. Figures
// already survive parsing (`kind: "figure"`), and vision already described them, but the
// description is PROSE: `Map<string, string>`. You cannot occlude a sentence. Nothing downstream —
// no spatial knowledge object, no occlusion interaction — could be built until a figure could say
// "this word is at this point", which is what this module parses.
//
// 🔴 AND IT COSTS NO EXTRA MODEL CALL. The labels are asked for in `FIGURE_PROMPT`, on the batch
// that was already being sent. Vision is the one primitive in this product with no entitlement and
// no counter, so a second pass per figure would have been a real recurring cost; a longer reply on
// the same request is not.
//
// PURE. No I/O, no React, no provider. What a label MEANS is decided here; fetching the bytes is
// somebody else's job, which is what makes every rule below a test rather than a promise.

/** One thing a diagram names, and where it sits. */
export interface FigureLabel {
  /** The word printed in the image, verbatim. */
  readonly text: string;
  /** Centre of the label, as a fraction of image width. 0 is the left edge, 1 the right. */
  readonly x: number;
  /** Centre of the label, as a fraction of image height. 0 is the top edge, 1 the bottom. */
  readonly y: number;
}

/**
 * 🔴 NORMALISED, NEVER PIXELS. The bytes a learner is shown are not the bytes the model saw: a
 * figure is extracted at its native size, rendered into a reading column at whatever width the
 * viewport allows, and shown again on a phone. A pixel coordinate is correct exactly once, in a
 * rendering nobody kept. Fractions survive every one of those, which is what lets the same label
 * be occluded on a laptop and on a phone without re-reading the image.
 */
const MIN_FRACTION = 0;
const MAX_FRACTION = 1;

/**
 * A diagram needs at least this many labels before it is worth treating as spatial knowledge.
 *
 * 🔴 TWO, BECAUSE ONE LABEL IS NOT A SPATIAL RELATIONSHIP. A picture with a single caption pinned
 * to it is an illustration: occluding the only label leaves nothing to reason from, so the
 * question degenerates into "what is this picture called", which is an association and is already
 * served by the association lane. Spatial knowledge is knowing where things are RELATIVE TO EACH
 * OTHER, and that needs a second thing.
 */
export const MIN_LABELS_FOR_SPATIAL = 2;

/** Longest label text kept. Anything longer is a sentence the model wrote, not a printed label. */
const MAX_LABEL_CHARS = 60;

/**
 * Pull the `LABELS:` line out of one figure's reply.
 *
 * 🔴 IT REFUSES ON ANYTHING IT DOES NOT FULLY UNDERSTAND, AND THAT ASYMMETRY IS DELIBERATE. A
 * missing label costs one question that never gets asked. A WRONG label puts a box over the wrong
 * part of a diagram and then marks the learner incorrect for reading the picture correctly — the
 * system confidently teaching a falsehood about material the learner can see with their own eyes.
 * So a coordinate outside 0–1, a missing pair, an unparseable number and a duplicated name all
 * drop that label rather than being repaired into something plausible.
 *
 * PURE.
 */
export function parseFigureLabels(entry: string): FigureLabel[] {
  // 🔴 NOT ANCHORED TO A LINE START, AND THE ROUND-TRIP TEST IS WHY. The first version used
  // `/^\s*LABELS:/im` and passed every one of its own fixtures. It then found nothing at all on a
  // real reply, because `parseFigureDescriptions` joins an entry's continuation lines with a SPACE
  // — by the time this sees the text there is no newline left to anchor to. This is the sixth
  // structural field in this repo to nearly die at a boundary after passing its own parser's
  // tests, which is exactly what `document-boundary.test.ts` exists to stop.
  const line = /LABELS:\s*([^\n]+)/i.exec(entry);
  if (!line?.[1]) return [];
  const labels: FigureLabel[] = [];
  const claimed = new Set<string>();
  for (const piece of line[1].split(";")) {
    const at = piece.lastIndexOf("@");
    if (at <= 0) continue;
    const text = piece.slice(0, at).trim().replace(/^[-•*]\s*/, "");
    const coords = piece.slice(at + 1).split(",");
    if (coords.length !== 2) continue;
    const x = Number.parseFloat((coords[0] ?? "").trim());
    const y = Number.parseFloat((coords[1] ?? "").trim());
    if (!text || text.length > MAX_LABEL_CHARS) continue;
    if (!inFrame(x) || !inFrame(y)) continue;
    // 🔴 THE SAME NAME TWICE IS DROPPED, NOT KEPT TWICE. Occluding one of two boxes that carry the
    // same word leaves the answer printed on the diagram, so the learner is asked to recall
    // something still in front of them and the evidence records a demonstration that never happened.
    const key = text.toLowerCase();
    if (claimed.has(key)) continue;
    claimed.add(key);
    labels.push({ text, x, y });
  }
  return labels;
}

/** Strip the labels line, leaving the prose description the existing callers expect. */
export function descriptionWithoutLabels(entry: string): string {
  // Same reason as above: after the entry splitter there is no line to anchor to.
  return entry.replace(/\s*LABELS:[^\n]*/i, "").trim();
}

/** Whether this figure carries enough named parts to be taught spatially. */
export function isOccludable(labels: readonly FigureLabel[]): boolean {
  return labels.length >= MIN_LABELS_FOR_SPATIAL;
}

/**
 * Which label to hide when asking about this diagram.
 *
 * 🔴 A FUNCTION OF THE ROUND, NOT A RANDOM CHOICE. Random would re-ask the same label twice in a
 * row often enough to be noticed, and — worse — is not reproducible, so a learner's evidence could
 * never be replayed to work out what they were actually shown. The round index walks the labels in
 * order and wraps, so the whole diagram gets covered before anything repeats.
 */
export function labelForRound(labels: readonly FigureLabel[], round: number): FigureLabel | null {
  if (labels.length === 0) return null;
  const safe = Number.isFinite(round) && round >= 0 ? Math.floor(round) : 0;
  return labels[safe % labels.length] ?? null;
}

function inFrame(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_FRACTION && value <= MAX_FRACTION;
}
