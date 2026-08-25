// Two rules learned by running the thing in production, 2026-08-25.
//
// Both were invisible from the code and from every unit test, and both are the same kind of
// finding: the chain WORKED and produced something useless.
//
// ── 1. A LABEL YOU CANNOT SAY OUT LOUD IS NOT AN ANSWER ─────────────────────────────────────────
//
// Measured: `subject: "nephron"` returned a real, correct, licensed Commons diagram with 18 boxes
// found — and these were the labels:
//
//   "1" "2" "3" "4" "5" "6" "7" "8" "9" "10" "11" "12" "F" "R" "S" "E" "Cortex" "Medulla"
//
// It is a NUMBERED-KEY diagram: the picture prints digits and the names live in a legend beside
// it. Vision read it perfectly. But "Which part is covered? — 3 / 7 / 11 / F" is not a question
// about the kidney, it is a question about which numeral was under a box, and a learner who gets
// it wrong has learned nothing about anything.
//
// 🔴 THE RULE IS STRUCTURAL, NOT SUBJECT-MATTER (CLAUDE.md). It does not know what a nephron is.
// It asks whether the text could be spoken as the answer to "what is this part called" — which is
// false for a bare numeral and false for a lone letter, in every discipline. A law diagram, a
// circuit and a musical score all key their figures the same way.
//
// ── 2. A BIG PICTURE TIMES THE WHOLE ROUTE OUT ─────────────────────────────────────────────────
//
// Measured: `subject: "neuron"` returned **504 Gateway Timeout**. The route budgets 60s and spends
// it on a repository search, an image download and a vision read of a 1280px PNG — and vision on a
// picture that size regularly takes more than the rest of the budget leaves.
//
// 🔴 THE FIX IS TO ASK FOR A SMALLER PICTURE, NOT A LONGER TIMEOUT. Every asset the reference lane
// may serve comes from `upload.wikimedia.org` (`REFERENCE_ASSET_HOSTS`), and Wikimedia thumbnails
// carry their width IN THE PATH, so a smaller rendering is one string away. Nothing is lost: masks
// are stored as fractions of whatever we measured, the learner is looking at a diagram in a chat
// column a few hundred pixels wide, and a smaller file loads faster on their phone too.
//
// PURE. No I/O, no React.

/**
 * The width we ask Wikimedia to render a diagram at.
 *
 * 🔴 800, WHICH IS ABOUT WHAT A LEARNER ACTUALLY SEES. The canvas column is under 700px and the
 * review card caps at `max-h-[min(52vh,34rem)]`, so a 1280px source was already being scaled down
 * on every screen it has ever appeared on. Going lower starts to cost vision its ability to read
 * small printed labels, which is the one thing this whole path depends on.
 */
export const OCCLUSION_READ_WIDTH = 800;

/**
 * Wikimedia thumbnail URLs name their width in the path:
 *   /commons/thumb/d/dc/File.svg/1280px-File.svg.png
 * Only that number is rewritten, and only when the path is genuinely a thumbnail.
 */
const WIKIMEDIA_THUMB = /\/(\d{2,5})px-/;

/**
 * The same picture at a smaller width, to TRY — never to trust.
 *
 * 🔴🔴🔴 WIKIMEDIA ONLY SERVES WIDTHS IT HAS ALREADY RENDERED, AND WHICH ONES THOSE ARE IS
 * UNPREDICTABLE PER FILE. Measured on the real nephron diagram, 2026-08-25:
 *
 *   1280px → 200      960px → 200
 *    800px → 400      640px → 400      1024px → 400      1200px → 400
 *
 * The first version of this rewrote every URL to a fixed 800px and returned it as fact. Every
 * lookup then died at `image-unreachable` in 1.4 seconds — the feature was completely broken, and
 * it looked exactly like "no diagram found". So this function now proposes a candidate and the
 * CALLER must fall back to the original when it does not answer. There is no width that is safe
 * to assume, which is why `readableThumbnail` cannot be the last word.
 *
 * Returns null when there is nothing worth trying: not a thumbnail, or already small enough.
 */
export function smallerThumbnail(url: string, width = OCCLUSION_READ_WIDTH): string | null {
  const match = WIKIMEDIA_THUMB.exec(url);
  if (!match) return null;
  const present = Number(match[1]);
  // 🔴 NEVER WIDENS. Asking for a rendering larger than the one on offer is a guaranteed refusal.
  if (!Number.isFinite(present) || present <= width) return null;
  return url.replace(WIKIMEDIA_THUMB, `/${width}px-`);
}

/**
 * Could this text be spoken as the answer to "what is this part called"?
 *
 * 🔴 IT MUST CONTAIN A LETTER. "3", "12", "3.5" and "II" — no: those are keys into a legend, and
 * the name they stand for is printed somewhere this picture's boxes do not cover.
 *
 * 🔴 AND IT MUST BE LONGER THAN ONE CHARACTER. "F", "R", "S", "E" came off a real kidney diagram
 * as legend keys. This is the rule's one real cost: a physics figure that labels a force "F" loses
 * that label. That trade is taken deliberately — a lone letter is far more often a key than a
 * name, and the failure it prevents (a learner asked to choose between "F" and "R") is much worse
 * than the one it causes (one fewer question).
 */
/**
 * The longest a printed part name gets.
 *
 * 🔴 GENEROUS ON PURPOSE. "thick ascending limb of the loop of Henle" is 41 characters and is a
 * name a real diagram really prints. What is being excluded is an order of magnitude bigger, so
 * the cap does not need to be tight to catch it — and tightening it far enough to also exclude a
 * short SENTENCE would start excluding names like that one.
 */
const MAX_LABEL_CHARS = 60;

export function isAnswerableLabel(text: string): boolean {
  // 🔴🔴🔴 A LABEL IS ONE LINE. Measured on the live route, 2026-08-25, one fix later: after the
  // numbered nephron diagram was correctly rejected, the NEXT picture came back with "labels" like
  // `"Glucose\nAmino acids\nProtein\nVitamins\nLactate\nUrea\nUric acid\nNa+\nK+\nCa2+…"` — the
  // solute lists printed beside each tubule segment. Vision found real text in a real place; it is
  // simply not a NAME, and "Which part is covered?" answered by a fourteen-item list is not a
  // question.
  //
  // `OCCLUSION_VISION_PROMPT` already asks it to ignore body paragraphs and it does not always
  // oblige, so the rule lives here where it is a test rather than a request. A newline is the
  // sharpest signal available: a printed part name does not contain one.
  if (/[\n\r]/.test(text)) return false;
  const label = plainLabel(text);
  if (label.length < 2 || label.length > MAX_LABEL_CHARS) return false;
  return /\p{L}/u.test(label);
}

/**
 * A leading legend key: `F:`, `1.`, `b)`, `A -`.
 *
 * 🔴 STRIPPED FOR DISPLAY, because "F: Filtration" is not how anybody says the answer. The letter
 * is also a CUE — the learner can read "F" off the diagram and match it to the option without
 * knowing what filtration is, which is the recognition-instead-of-recall failure this whole
 * interaction exists to avoid.
 */
/**
 * 🔴 ONE LETTER, OR ONE TO TWO DIGITS — NOT "ANY TWO CHARACTERS". The first spelling allowed two
 * letters and ate the front of `"pH: measured at the surface"`, turning a real label into
 * "measured at the surface". A figure key is a single letter (`F:`) or a small number (`12.`);
 * two letters is already a word in some discipline.
 */
const LEGEND_KEY = /^(?:\p{L}|\d{1,2})\s*[:.)\]–—-]\s+/u;

/** The label as a learner would say it, with any legend key taken off the front. */
export function plainLabel(text: string): string {
  return text.trim().replace(LEGEND_KEY, "").trim();
}

/**
 * How many of a picture's labels are usable as answers, and how many are legend keys.
 *
 * 🔴🔴🔴 THIS IS THE CHECK THE OWNER ASKED FOR, 2026-08-25: *"make sure the images that it uses
 * for image occlusion or any visuals actually have the content in it… the one for the nephron
 * actually didn't even have proper labels."* He was right, and the failure was mine: I filtered
 * the unusable labels OUT and then accepted whatever was left, instead of rejecting the PICTURE.
 *
 * The real nephron diagram labels its parts `1 2 3 … 12` and prints the names in a key beside the
 * figure. Covering a legend line is not occluding an anatomical part, and the question that came
 * out of it ("F: Filtration" vs "R: Reabsorption") tested nothing about a kidney.
 *
 * So a picture is only suitable when it prints NAMES ON THE PARTS. Structurally that means: enough
 * named labels to make a real question, and names outnumbering keys — because a diagram that is
 * mostly numbers IS a keyed diagram, whatever else it also prints.
 */
export interface LabelQuality {
  /** DISTINCT names, not named boxes. */
  readonly named: number;
  readonly keyed: number;
  /** How far the named labels are spread, as a fraction of the picture's diagonal. */
  readonly spread: number;
  readonly usable: boolean;
}

/**
 * The fewest named parts worth building a check from.
 *
 * 🔴 FOUR, NOT TWO. Two is the floor for one honest question (`MIN_LABELS_FOR_SPATIAL`), and that
 * floor is right where a picture is all we have. But when we are CHOOSING between pictures, two
 * named parts means a two-option question repeated — which is what the nephron produced. Four
 * gives a four-option question and room for the check to ask about different parts.
 */
export const MIN_NAMED_PARTS = 4;

/**
 * How far apart the named labels sit, as a fraction of the picture's diagonal.
 *
 * 🔴🔴🔴 THIS IS THE ONE CHECK THAT LOOKS AT THE PICTURE RATHER THAN THE WORDS, AND IT IS THE
 * ANSWER TO "how do we know the picture really labels its parts?" Everything else here grades the
 * TEXT vision reported, which means trusting the report. This grades WHERE that text sits, which
 * the report cannot fake without also getting the boxes wrong — and if the boxes are wrong the
 * masks land in the wrong place, which is visible immediately.
 *
 * A legend is a BLOCK: four lines stacked in a corner, tight in both axes. Labels on a diagram are
 * spread across it, because the parts are. Measured on the real nephron figure, the four legend
 * entries ("F: Filtration" and friends) sat inside a box a few percent of the image wide and a few
 * percent tall — while the good diagram's nine labels spanned most of it.
 *
 * 🔴 THE DIAGONAL, NOT EITHER AXIS ALONE. A layered diagram — skin, rock strata, the atmosphere —
 * legitimately puts every label in a single left-hand column: tiny x-span, huge y-span. Requiring
 * spread in BOTH axes would reject those, and they are perfectly good occlusion figures.
 */
export const MIN_LABEL_SPREAD = 0.35;

function spreadOf(boxes: readonly LabelBox[]): number {
  if (boxes.length < 2) return 0;
  const xs = boxes.map((box) => box.x + box.w / 2);
  const ys = boxes.map((box) => box.y + box.h / 2);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** What `labelQuality` needs off a box: its text and where it sits, in fractions of the picture. */
export interface LabelBox {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function labelQuality(boxes: readonly LabelBox[]): LabelQuality {
  const named = boxes.filter((box) => isAnswerableLabel(box.label));
  const keyed = boxes.length - named.length;
  // 🔴 DISTINCT NAMES, NOT JUST NAMED BOXES. Vision sometimes reports the same caption twice at two
  // positions; four copies of one word is not four parts, and the question would offer the right
  // answer as several of its own options.
  const distinct = new Set(named.map((box) => plainLabel(box.label).toLowerCase())).size;
  const spread = spreadOf(named);
  return {
    keyed,
    named: distinct,
    spread,
    // 🔴 NAMES MUST OUTNUMBER KEYS. The nephron scored 8 named against 12 numbers, which is the
    // whole point: a keyed diagram that happens to also print a legend and two arrows.
    usable: distinct >= MIN_NAMED_PARTS && distinct > keyed && spread >= MIN_LABEL_SPREAD,
  };
}
