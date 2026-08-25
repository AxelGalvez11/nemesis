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
export function isAnswerableLabel(text: string): boolean {
  const label = text.trim();
  if (label.length < 2) return false;
  return /\p{L}/u.test(label);
}
