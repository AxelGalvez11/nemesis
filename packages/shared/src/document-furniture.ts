/**
 * Running page furniture — the header and footer a document repeats on every
 * page — identified from repetition and geometry the parser already has.
 *
 * WHY THIS EXISTS. An external benchmark measured Nemesis localising blocks well
 * (F1 85.6) and naming them badly (23.6), with `Page-header` and `Page-footer`
 * both at exactly 0.0 because Nemesis had no concept of running furniture at
 * all. Downstream that means a course name and "Page 3 of 30" are indistinguish-
 * able from body prose: repeated thirty times in chat context, and thirty near
 * identical chunks competing with real content in retrieval.
 *
 * 🔴 CLASSIFIED AS FURNITURE IS NOT DELETED. The block stays in `blocks` with
 * its rect, its unit and its text, so it remains citable, locatable and
 * readable. What changes is that it stops being poured into ordinary prose flow.
 * `documentFurniture()` hands it back to any consumer that wants it — the course
 * name in a running header is sometimes the only place a document names itself.
 *
 * ── WHAT THE SIGNALS ACTUALLY ARE, MEASURED ────────────────────────────────
 *
 * On 35 real multi-page PDFs (393 pages) the distributions are:
 *
 *     where REPEATED text sits:  top≤0.12 23.5% · bottom≥0.88 32.4% · middle 44.1%
 *     where UNIQUE   text sits:  top≤0.12 12.3% · bottom≥0.88  2.3% · middle 85.4%
 *
 * 🔴 POSITION ALONE IS NOT ENOUGH, AND THAT IS THE WHOLE DESIGN. 12.3% of
 * ordinary one-off text sits in the top band — those are headings, which open a
 * page. A rule that called the top of a page "header" would relabel section
 * headings as furniture and drop them out of the reading flow. Equally,
 * repetition alone is not enough: 44.1% of repeated strings sit mid-page, and
 * those are repeated body content such as a table's repeated header row.
 *
 * So all three must hold together — repeated across pages, at a STABLE y, and in
 * an edge band. Every one of the 14 blocks meeting all three in that sample was
 * genuine furniture: "page # of #", a form's OMB number, a filing URL, "- # -".
 *
 * 🔴 UNCERTAIN STAYS ORDINARY TEXT. A single-page document has no repetition
 * signal, so nothing is classified — deliberately. Guessing furniture from
 * position on one page is how a title becomes a header.
 */

import type { DocBlock, DocumentModel } from "./document-model.ts";

/** How near a page edge a running element sits. Measured: unique text is in the
 *  bottom band only 2.3% of the time, so this is a strong conjunct, not a guess. */
const TOP_BAND = 0.12;
const BOTTOM_BAND = 0.88;

/** How little its y may wander between pages. Furniture is printed by the
 *  template at a fixed offset; body text that merely recurs is not. */
const Y_DRIFT = 0.02;

/** Fewest pages a string must appear on before repetition means anything. Two
 *  pages can share a sentence by coincidence; three begins to be a pattern. */
const MIN_PAGES = 3;

/** And it must be on at least this share of the document's pages. */
const MIN_SHARE = 0.5;

/**
 * A running element's identity.
 *
 * 🔴 DIGITS ARE COLLAPSED SO A PAGE NUMBER STILL COUNTS AS REPETITION. "Page 3
 * of 30" and "Page 4 of 30" are the same furniture; comparing them literally
 * makes every page's footer unique and the signal vanishes entirely.
 */
function runningKey(text: string): string {
  return text.trim().toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").slice(0, 120);
}

/**
 * The same, but without collapsing digits — so two strings match only if they
 * are genuinely identical.
 *
 * 🔴 A HEADING MUST CLEAR THIS HIGHER BAR, AND A TEST CAUGHT WHY. With digits
 * collapsed, "Section 1: Absorption" and "Section 2: Distribution" share the key
 * "section #: …" only when the rest matches — but numbered headings that DO
 * share wording ("Chapter 1 — Overview" style running titles, or a deck where
 * every page is "Lecture 3") collapse onto one key and would be relabelled as
 * furniture and dropped out of the reading flow.
 *
 * The parser has already judged this block to look like a heading. Overriding
 * that judgement needs stronger evidence than "it rhymes with the page number",
 * so a heading qualifies only by repeating EXACTLY. A genuine running title —
 * a course name printed on every page — does repeat exactly, so nothing real is
 * lost by asking.
 */
function exactKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

export type Furniture = "pageHeader" | "pageFooter";

/**
 * Which blocks are running furniture, and which end of the page they belong to.
 * Returns block ids so callers can decide what to do rather than having the
 * decision made for them.
 */
export function findFurniture(doc: DocumentModel): Map<string, Furniture> {
  const out = new Map<string, Furniture>();
  const pageCount = doc.units.length;
  // Nothing to compare against. Stated as a limit rather than approximated.
  if (pageCount < MIN_PAGES) return out;

  const groups = new Map<string, DocBlock[]>();
  for (const block of doc.blocks) {
    // Only blocks the format placed. Without a rect there is no geometry to
    // reason about, and a text-only lane must not be guessed at.
    if (!block.rect || !block.text.trim()) continue;
    // A table is never furniture. A repeated grid is a repeated grid, and
    // suppressing one would delete a page of data to tidy a margin.
    if (block.kind === "table" || block.kind === "figure") continue;
    // A heading is grouped by its exact text; everything else may collapse its
    // digits, which is what lets "Page 3 of 30" and "Page 4 of 30" be one thing.
    const key = block.kind === "heading" ? `=${exactKey(block.text)}` : `~${runningKey(block.text)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(block);
    else groups.set(key, [block]);
  }

  const needed = Math.max(MIN_PAGES, Math.ceil(pageCount * MIN_SHARE));

  // Every group that repeats on enough pages at a stable y, with where it sits.
  const running: { blocks: DocBlock[]; y: number }[] = [];
  for (const blocks of groups.values()) {
    const pages = new Set(blocks.map((b) => b.unit));
    if (pages.size < needed) continue;
    const ys = blocks.map((b) => b.rect!.y);
    if (Math.max(...ys) - Math.min(...ys) > Y_DRIFT) continue;
    running.push({ blocks, y: ys[0]! });
  }

  // 🔴 IF THE DOCUMENT REPEATS MATERIAL MID-PAGE, ITS REPETITION IS A TEMPLATE,
  // NOT FURNITURE — AND A REAL DOCUMENT PROVED IT. A recitation worksheet
  // reprints the same lettered answer bank on all 12 slides. Three fragments of
  // that one list repeat at stable positions: y=0.242, y=0.594 and y=0.913. Only
  // the last falls inside the footer band, so classifying by band alone silently
  // deleted the list's final two options — "I. Formoterol J. Trandolapril" — and
  // left the rest, which is the worst possible shape for the error to take.
  //
  // A page whose repeated content reaches the middle is a page built from a
  // template. Nothing on it is classified, because the margin material cannot be
  // told apart from the fragment of body that happens to land in the margin.
  // Declining to classify leaves it as ordinary text, which is the direction
  // this must always fail in.
  const templated = running.some(({ y }) => y > TOP_BAND && y < BOTTOM_BAND);
  if (templated) return out;

  for (const { blocks, y } of running) {
    const where: Furniture = y <= TOP_BAND ? "pageHeader" : "pageFooter";
    for (const block of blocks) out.set(block.id, where);
  }
  return out;
}

/** The furniture blocks themselves, for a consumer that wants them — the course
 *  name in a running header is sometimes the only place a document names itself. */
export function documentFurniture(doc: DocumentModel): { block: DocBlock; where: Furniture }[] {
  const found = findFurniture(doc);
  return doc.blocks
    .filter((b) => found.has(b.id))
    .map((block) => ({ block, where: found.get(block.id)! }));
}

/** The blocks that carry the document's prose, furniture excluded. */
export function readingFlow(doc: DocumentModel): DocBlock[] {
  const found = findFurniture(doc);
  return doc.blocks.filter((b) => !found.has(b.id));
}
