// Making occlusion cards from a diagram in the LEARNER'S OWN DOCUMENT.
//
// 🔴🔴 THE REFERENCE CORPUS WAS THE ONLY SOURCE UNTIL 2026-08-30, AND THE OWNER CALLED IT: when a
// deck's material is a lecture PDF with a labelled figure in it, the picture worth covering is THAT
// one, not a licensed lookalike found by name. The corpus lane still exists and still matters (most
// material has no figure at all), but it is now the fallback rather than the whole story.
//
// 🔴 IT REUSES BOTH HALVES OF WHAT IS ALREADY THERE. The figures come from `canvasFigures`, which
// the slide-deck lane has extracted from filed sources for months; the vision read goes through
// `/api/study/occlusion`, the route built for a picture the learner supplied. Nothing new is
// invented to hold either end.
//
// 🔴🔴 AND IT MUST NEVER TOUCH `figure_occlusion_cache`. That table is keyed by SUBJECT and shared
// across every learner, which is exactly right for a public licensed diagram and exactly wrong for
// a page out of somebody's coursework: caching it would serve one learner's document to another
// under a subject name. The route this path uses has no cache, which is the reason to use it.
//
// PURE except for `labelCanvasFigure`. The matcher is separated so it can be tested without a
// network, a signature or a vision bill.

import { labelQuality, type LabelBox } from "./occlusion-source";
import { signDeckFigures } from "./deck-figures";
import { readFigureBoxes } from "@/lib/workspace/occlusion-suggest-api";
import type { DeckFigure } from "../export/deck-plan";
import type { LabelledFigure } from "./occlusion-from-labels";

/** Words too small or too common to carry a match on their own. Structural, not subject-matter:
 *  this product is field-agnostic and a stop list of topic words would scope it to one discipline. */
const NOISE = new Set(["a", "an", "and", "diagram", "figure", "for", "in", "of", "the", "with"]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !NOISE.has(word));
}

/**
 * The learner's own figure that the named subject is about, or null.
 *
 * 🔴 IT ASKS FOR MOST OF THE SUBJECT, NOT ANY OF IT. The model names the thing it wants a picture
 * of ("four-stroke engine"); a document's captions are noisy ("Figure 4.2: the four-stroke cycle").
 * Requiring every word would miss that, and requiring one word would match "cell cycle" to "cell
 * membrane" and hand the learner a confidently wrong diagram. Half the subject's significant words,
 * plus at least one substantial word in common, is the line.
 *
 * 🔴 A TIE GOES TO THE FIRST FIGURE, which is document order: the earliest matching figure in the
 * earliest source. Deterministic, and the alternative (best score wins) makes the choice turn on
 * caption wording rather than on what the learner is reading.
 */
export function pickCanvasFigure(subject: string, figures: readonly DeckFigure[]): DeckFigure | null {
  const asked = words(subject);
  if (asked.length === 0) return null;
  // 🔴 SIXTY PER CENT, WITH A FLOOR OF TWO WORDS WHERE THERE ARE TWO TO GIVE. A half-of-the-words
  // rule reads fine and collapses on the commonest case: a two-word subject then needs ONE word, so
  // "cell cycle" matches a caption reading "the cell membrane" and the learner is handed a
  // confidently wrong diagram. Caught by its own test before it shipped.
  const needed = Math.max(Math.min(asked.length, 2), Math.ceil(asked.length * 0.6));
  for (const figure of figures) {
    const caption = new Set(words(`${figure.caption} ${figure.source}`));
    const shared = asked.filter((word) => caption.has(word));
    if (shared.length >= needed && shared.some((word) => word.length >= 4)) return figure;
  }
  return null;
}

/** What a figure's boxes have to clear before it becomes cards.
 *
 *  🔴 IT ASKS `labelQuality`, IT DOES NOT RE-DERIVE THE RULE. That module already owns what makes a
 *  figure worth asking about (enough distinct sayable names, spread far enough apart to be pointing
 *  at different things) and it learned those thresholds from production. A second copy of the
 *  arithmetic here would be a second answer the day either moved. */
export function figureIsUsable(boxes: readonly LabelBox[]): boolean {
  return labelQuality(boxes).usable;
}

/**
 * Read the learner's figure and hand back something `occlusionCards` can use, or null.
 *
 * 🔴 IT NEVER THROWS, for the same reason `findLabelledFigure` never does: a deck that could have
 * had pictures and does not is a smaller deck, and a deck that crashed is no deck. Every failure
 * path here (no signature, an unreachable object, vision off, a numbered-key figure) returns null
 * and the caller carries on with the corpus or with the written cards alone.
 */
export async function labelCanvasFigure(figure: DeckFigure): Promise<LabelledFigure | null> {
  try {
    const [signed] = await signDeckFigures([figure]);
    if (!signed?.url) return null;

    const response = await fetch(signed.url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;

    const { boxes } = await readFigureBoxes(new File([blob], "figure", { type: blob.type }));
    if (boxes.length === 0) return null;

    // 🔴 THE SAME QUALITY BAR AS THE CORPUS LANE, AND SKIPPING IT HERE WOULD BE THE WORSE MISTAKE.
    // `occlusion-source.ts` records what a numbered-key diagram produces: "which part is covered?
    // 3 / 7 / 11 / F", a question about numerals. A learner's own textbook figure is MORE likely to
    // be keyed that way than a Commons diagram, not less.
    if (!figureIsUsable(boxes)) return null;

    const width = signed.width ?? 0;
    const height = signed.height ?? 0;
    // Boxes are fractions, so a size we do not know cannot be turned into masks. Refuse rather
    // than guess: a wrong size renders the framed empty box this codebase has shipped once.
    if (width <= 0 || height <= 0) return null;

    return { boxes, caption: figure.caption, height, src: signed.url, width };
  } catch {
    return null;
  }
}

/**
 * Written cards that the picture already asks better, dropped.
 *
 * 🔴🔴 A PROMPT RULE IS NOT A GUARANTEE, AND THIS IS THE PROOF. The card prompt forbids writing
 * about a diagram's parts in as many words, including as a cloze. Run live on heart material, the
 * model obeyed it ten times and broke it once: *"The diagram of the heart labels the chambers, the
 * four valves, the great vessels, and the {{c1::pericardium}}."* Pericardium is one of the fourteen
 * parts the image cards were about to cover properly, so the deck carried the same fact twice, once
 * well and once as a sentence about what a diagram contains.
 *
 * 🔴 SO THE LAST WORD IS CODE, NOT PROSE. The instruction stays (it improved the odds from seven
 * bad cards in thirteen to one in eleven), but the labels are known here, and a duplicate that can
 * be recognised deterministically should not depend on a model remembering an instruction.
 *
 * 🔴🔴 ONLY A CLOZE, AND THE FIRST VERSION OF THIS WAS WRONG IN A WAY ONLY A LIVE RUN SHOWED. It
 * dropped any card whose ANSWER was a part name, which sounds right and cost five good cards:
 * "which valve does blood pass through from the right atrium to the right ventricle?" answers "the
 * tricuspid valve", and that is a question about the path blood takes. The image card asks where
 * the tricuspid valve SITS. Same words, different knowledge, and the deck needs both.
 *
 * A cloze that hides a part name is the case that is genuinely redundant: hiding a label inside a
 * sentence tests naming the part, which is exactly what the picture does and does better. That is
 * narrow enough to be safe, and it is the shape the live failure took.
 */
export function dropCardsCoveredByFigure<T extends { front: string; back: string }>(
  cards: readonly T[],
  labels: readonly string[],
): T[] {
  const covered = new Set(labels.map((label) => bareName(label)).filter(Boolean));
  if (covered.size === 0) return [...cards];
  return cards.filter((card) => {
    const hidden = card.front.match(/\{\{c\d+::(.+?)(?:::.*?)?\}\}/)?.[1];
    return !(hidden && covered.has(bareName(hidden)));
  });
}

/** A label reduced to the words that name it: case, punctuation and a leading article removed. */
function bareName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/^\s*(the|a|an)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}
