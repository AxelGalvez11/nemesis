// Turning an extracted document into something a generated block can honestly cite.
//
// 🔴 WHY EXCERPTS, AND WHY THEY NOW CARRY PAGE NUMBERS TOO.
//
// The rule has always been: never hand the model a locator it cannot know, because it will
// confidently invent one. So we split the text ourselves, give each piece an id we minted, and
// require the model to cite those ids. "Where did this come from?" then shows the learner the
// actual sentences the block was built from — real provenance, nothing fabricated. That stays.
//
// What changed on 2026-09-03 is that the invention is no longer the risk it was. `unitsFromModel`
// measures `anchor.page` and `anchor.unitKind` off the stored document for every block of a
// paginated file, and this builder simply threw both away. The owner's 83-page lecture reached the
// model as 354 excerpts that knew their heading and not their page, so "what is on page 40?" was
// unanswerable about a document we had read completely.
//
// So an excerpt carries `locator` when — and only when — the parse measured one. A Word document
// is one flowing `body` unit and a transcript one undifferentiated column; both still get nothing,
// enforced in ONE place (`unitPhrase` in @nemesis/shared) rather than judged again here. The
// excerpt id remains the thing the model must cite: it addresses the exact text, which a page
// number cannot.
//
// Labels are only ever copied from headings the extractor genuinely emitted (it writes
// "## Slide 12" for decks). No heading, no label.

import { unitPhrase, type DocumentModel } from "@nemesis/shared";

import {
  readableUnits,
  resolveQuote,
  sectionOf,
  sourceContextFromModel,
  type CanonicalSourceAnchor,
  type SourceContext,
} from "@/lib/sources/source-context";

import type { CanvasSource, SourceExcerpt, SourceRef } from "./canvas-model";

/** Longer than this and one excerpt stops being a quotable unit. */
const MAX_EXCERPT_CHARS = 2400;
/** Total grounding sent to the model. Well under the 150k the chat lane already tolerates,
 *  because the lesson prompt and the answer have to fit alongside it. */
const MAX_GROUNDING_CHARS = 120_000;

/** A markdown-style heading line, which is what the extractor emits for slide/section units. */
const HEADING = /^#{1,6}\s+(.+?)\s*$/;

/** Split extracted text into citable excerpts with stable ids.
 *
 *  Deterministic: the same text always produces the same ids, so a canvas reloaded from
 *  storage still resolves the citations it saved. */
export function buildExcerpts(sourceId: string, text: string): SourceExcerpt[] {
  const excerpts: SourceExcerpt[] = [];
  let label: string | null = null;

  for (const paragraph of text.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const heading = HEADING.exec(trimmed);
    if (heading) {
      // A heading names what follows; it is not itself a quotable claim.
      label = heading[1]?.trim() || null;
      continue;
    }

    // One paragraph is one excerpt. Short ones are kept separate rather than glued to a
    // neighbour: on a slide deck the short lines ARE the content, and merging them would make
    // a citation point at text the block did not use.
    for (const piece of splitLong(trimmed)) {
      excerpts.push({ id: `${sourceId}:e${excerpts.length + 1}`, label, text: piece });
    }
  }

  return excerpts;
}

/**
 * The same excerpts, built from the document's STRUCTURE instead of its flattened text.
 *
 * 🔴 WHY THIS EXISTS BESIDE `buildExcerpts` RATHER THAN REPLACING IT. The parser has always
 * produced a real document model — typed blocks, heading paths, tables kept as grids — and
 * every consumer received `documentToText(model)`, a string. `buildExcerpts` then re-derived
 * the structure back out of that string with a regular expression. Two things were lost in
 * the round trip, and both are live defects rather than theory:
 *
 *   * A TABLE ARRIVED AS PIPE-SOUP. `blockToText` renders a grid to markdown; splitting on
 *     blank lines then cuts it wherever it happens to land, so a dosing table or a grading
 *     rubric reached the lesson as a paragraph of `|` characters, and a citation could point
 *     at a row separated from its own headers. The chunker has always protected tables
 *     (`ATOMIC`); this path did not. Here a table is exactly one excerpt, always.
 *   * A LABEL WAS A GUESS. The regex `/^#{1,6}\s+(.+?)\s*$/` recovers a heading only when the
 *     renderer happened to emit one, and it cannot tell a heading from a line of prose that
 *     starts with a hash. `headingPath` is the exact ancestor trail the parser recorded.
 *
 * 🔴 A FIGURE NOBODY LOOKED AT IS NOT EVIDENCE. `blockToText` renders such a block as the
 * literal string "[Figure — not examined]", which the text path turned into a citable
 * excerpt — so a model could cite our own disclosure as though it were the document's
 * content. A figure is included here only when it carries a caption or a description; the
 * fact that it exists and was not examined is already carried by `coverage`, which is where
 * a disclosure belongs.
 *
 * Ids use the same `${sourceId}:e${n}` scheme and are assigned in reading order, so this is a
 * drop-in for the string version.
 *
 * 🔴 IT IS NOW A WRAPPER, AND THE INDIRECTION IS THE POINT. This function used to carry its own
 * copy of the splitting rules — skip headings, never cut a table, break a long paragraph on
 * sentences, take the label from the heading path or else the unit's own name — and so does the
 * canonical path. Two copies of a rule are two rules the moment one is edited, and the failure
 * would be silent and specific: a citation made from an upload response would point somewhere
 * slightly different from the same citation made after a reload, with every test on both sides
 * still green. There is one implementation, and both callers go through it.
 */
export function buildExcerptsFromModel(sourceId: string, model: DocumentModel): SourceExcerpt[] {
  // `sourceKind` only ever feeds parse QUALITY, which nothing downstream of here reads, so the
  // model's own format is the honest answer rather than a guess about the file it came from.
  const context = sourceContextFromModel({ model, sourceId, sourceKind: model.format });
  return excerptsFromSourceContext(sourceId, context);
}

/**
 * The same excerpts again, built from the CANONICAL BOUNDARY rather than from a document model
 * handed over in an upload response.
 *
 * 🔴 WHY A THIRD BUILDER RATHER THAN A THIRD COPY OF THE RULES. `buildExcerptsFromModel` reads a
 * `DocumentModel` — which Canvas only ever has for a file it just uploaded, in the seconds before
 * the response is discarded. Everything that has to work later reads the PERSISTED parse instead:
 * a canvas reopened tomorrow, a second canvas built on the same lecture, an extractor asked what
 * this source teaches. Those must not re-derive structure from a different input than the one that
 * survived, or "what the canvas cites" and "what actually got stored" drift apart with nothing
 * able to notice.
 *
 * So this takes a `SourceContext`, which is read out of `parsed_documents` through the real
 * envelope validator. The splitting rules are identical on purpose — a table is one excerpt, a
 * heading is not itself quotable, a long paragraph breaks on sentences — because a citation made
 * on one path has to mean the same thing as a citation made on the other.
 *
 * 🔴 AND EVERY EXCERPT REMEMBERS ITS UNIT. `unitId` is what later lets a durable
 * `CanonicalSourceAnchor` be resolved into a canvas citation without anyone assuming a block id
 * and an excerpt id are the same string.
 */
export function excerptsFromSourceContext(sourceId: string, context: SourceContext): SourceExcerpt[] {
  const excerpts: SourceExcerpt[] = [];

  const push = (text: string, label: string | null, unitId: string, locator: string | null) => {
    excerpts.push({ id: `${sourceId}:e${excerpts.length + 1}`, label, text, unitId, ...(locator ? { locator } : {}) });
  };

  for (const unit of readableUnits(context)) {
    // A heading names what follows; it is not itself a quotable claim. It already lives in the
    // `headingPath` of every unit beneath it, so dropping it here loses nothing.
    if (unit.type === "heading") continue;

    const text = (unit.text ?? "").trim();
    if (!text) continue;

    // The innermost enclosing heading, else what the document itself calls the page or slide.
    // Never generated: a unit with neither gets `null`, exactly as the other two builders do.
    const label = sectionOf(unit) ?? unit.unitLabel ?? null;

    // 🔴 THE PARSE HAS ALWAYS KNOWN THIS AND NEVER PASSED IT ON. `unitsFromModel` writes
    // `anchor.page` and `anchor.unitKind` for every block of a paginated document; this builder
    // dropped both, so the model was handed 354 excerpts of an 83-page lecture with no way to say
    // which page any of them came from. Rendered through the one shared helper, so a document
    // with no pages still gets nothing rather than "page 1".
    const locator =
      unit.anchor?.page !== undefined && unit.anchor.unitKind
        ? unitPhrase(unit.anchor.unitKind, unit.anchor.page - 1)
        : null;

    // 🔴 A TABLE IS NEVER SPLIT, WHATEVER ITS SIZE — the same rule the chunker follows, for the
    // same reason: a grid with some of its rows is a different grid, and its cells only mean
    // anything beside their headers.
    if (unit.type === "table") {
      push(text, label, unit.id, locator);
      continue;
    }

    for (const piece of splitLong(text)) push(piece, label, unit.id, locator);
  }

  return excerpts;
}

/**
 * Resolve a durable canonical anchor into a citation this canvas can actually render.
 *
 * 🔴 THE EXPLICIT BOUNDARY THE TWO LOCATOR SYSTEMS MEET AT, AND THE REASON IT IS A FUNCTION RATHER
 * THAN A CAST. Extraction records where something sits in the SOURCE — durable, quote-based,
 * meaningful to any canvas and still valid after the document is reparsed by a better parser. A
 * canvas cites where something sits in ITS OWN excerpt list — `s1:e7`, meaningless anywhere else.
 * They are not the same identifier and converting between them by assuming they match would
 * produce a citation that resolves to real text from the wrong place, which is worse than no
 * citation at all: a broken locator that passes every check.
 *
 * Returns null rather than a best guess. A source that was never filed, an anchor from a document
 * this canvas does not hold, or a quote that no longer exists after a reparse all mean "we cannot
 * honestly point at this", and the caller must show no citation instead of a plausible one.
 */
export function groundCanonicalAnchor(
  sources: readonly CanvasSource[],
  anchor: CanonicalSourceAnchor,
): SourceRef | null {
  // Matched on the DURABLE id, never on the canvas-local one. Every canvas calls its first
  // attachment "s1", so matching on that would resolve an anchor from a different document.
  const source = sources.find((candidate) => candidate.librarySourceId === anchor.sourceId);
  if (!source) return null;

  const fromUnit = source.excerpts.filter((excerpt) => excerpt.unitId === anchor.unitId);
  if (fromUnit.length === 0) return null;

  // One unit can have been split into several excerpts, so the quote decides which. Without a
  // quote there is only one honest answer — the first piece of that unit — and it is right
  // whenever the unit was not split at all, which is the ordinary case.
  const quote = anchor.quote;
  if (!quote) return { excerptId: fromUnit[0]!.id, sourceId: source.id };

  const hit = fromUnit.find((excerpt) => resolveQuote(excerpt.text, quote) >= 0);
  return hit ? { excerptId: hit.id, sourceId: source.id } : null;
}

/** Break an over-long paragraph on sentence boundaries. A quote cut mid-word is unusable as
 *  evidence, so we never cut on a raw character count when a sentence end is available. */
function splitLong(text: string): string[] {
  if (text.length <= MAX_EXCERPT_CHARS) return [text];

  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [text];
  const out: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && current.length + sentence.length > MAX_EXCERPT_CHARS) {
      out.push(current.trim());
      current = "";
    }
    // A single "sentence" over the cap has no punctuation to break on — transcripts and OCR
    // output routinely produce these. Fall back to word boundaries, never mid-word.
    if (sentence.length > MAX_EXCERPT_CHARS) {
      for (const chunk of splitOnWords(sentence)) out.push(chunk);
      continue;
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function splitOnWords(text: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && current.length + word.length + 1 > MAX_EXCERPT_CHARS) {
      out.push(current);
      current = "";
    }
    current = current ? `${current} ${word}` : word;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * The grounding the model reads, with every excerpt tagged by the id it must cite.
 *
 * 🔴🔴 THE HEADER USED TO EDITORIALISE, AND ITS EDITORIAL WAS WRONG ABOUT 24 DOCUMENTS IN 27.
 * Every source carrying any coverage note at all was introduced to the model as
 * `(Nemesis could not read all of this: ...)` — a flat claim of incomplete reading, hardcoded,
 * with no idea what the note underneath it actually said. On production 2026-09-03, 24 of the 27
 * partially-parsed documents have `unitsUnread: 0`: their text and tables are whole and only
 * pictures were capped. So the model met TWO assertions that the lecture was half-read before it
 * reached a single excerpt, and it passed them on (canvas
 * `c9749731-2c62-4598-862f-48b0adca48f5`: "partly unreadable to me, 11 of 83 pages ... didn't come
 * through", about a document whose every page was read).
 *
 * `coverageNoticeForModel` states what WAS read before what was not, and forbids exactly that
 * claim when the text is whole. It is a complete sentence and it needs no introduction. A wrapper
 * that adds a verdict the note does not support is a second owner of the claim, and the two
 * disagreed.
 */
export function groundingBlock(sources: readonly CanvasSource[]): string {
  if (sources.length === 0) return "";

  const headers = sources.map(
    (source) => `### SOURCE ${source.id} — ${source.title}${source.coverageNote ? `\n${source.coverageNote}` : ""}`,
  );
  // The locator leads the heading: "page 12 · Spirometry" reads as an address, and the page is the
  // half a learner can act on. Either may be absent, and a document with neither gets no
  // parenthetical at all rather than an empty one.
  const lineFor = (excerpt: SourceExcerpt) => {
    const where = [excerpt.locator, excerpt.label].filter(Boolean).join(" · ");
    return `[${excerpt.id}]${where ? ` (${where})` : ""} ${excerpt.text}`;
  };

  let budget = MAX_GROUNDING_CHARS - headers.reduce((total, header) => total + header.length, 0);
  let dropped = 0;

  /**
   * 🔴🔴🔴 THE BUDGET IS SPENT ROUND-ROBIN, NOT IN READING ORDER, AND THAT IS THE DIFFERENCE
   * BETWEEN "SOME OF EVERY DOCUMENT" AND "ALL OF THE FIRST THREE".
   *
   * This loop used to walk the sources in order and spend one 120,000-character budget as it went,
   * so with a large pile the first documents arrived whole and every later one contributed its
   * TITLE AND NOTHING ELSE — a header saying a lecture is attached, above no sentence from it. The
   * model is then told "412 further excerpts were not included", which it cannot act on, and it
   * answers about the pile from the part of the pile it happens to have.
   *
   * Owner, 2026-09-03: *"even if I drop in 50 documents it should be able to understand all of
   * them… what matters most is that it understands content."* Retrieval is the real answer to that
   * and already ships (see `canvas-chat.ts`), but it only answers once the material is INDEXED —
   * and the first question after a drop routinely arrives before that, which is exactly when the
   * pile is largest and this fallback is what runs.
   *
   * 🔴 SELECTED ROUND-ROBIN, RENDERED GROUPED. Taking excerpt 0 from every source, then excerpt 1
   * from every source, spends the budget evenly; grouping the survivors back under their headers
   * keeps each document readable and keeps the `[s4:e12]` ids exactly where they were. Reading
   * order INSIDE a document is preserved, which is the order that carries meaning.
   *
   * 🔴 AND IT DEGRADES WHERE A LECTURE CAN AFFORD IT. What is lost is the tail of every document
   * rather than the whole of most of them — and a deck's opening slides are what say what it is
   * about, so a truncated packet still knows that all fifty lectures exist and what each covers.
   */
  const kept: string[][] = sources.map(() => []);
  const deepest = sources.reduce((most, source) => Math.max(most, source.excerpts.length), 0);
  for (let rank = 0; rank < deepest; rank += 1) {
    for (const [at, source] of sources.entries()) {
      const excerpt = source.excerpts[rank];
      if (!excerpt) continue;
      const line = lineFor(excerpt);
      if (line.length + 2 > budget) {
        dropped += 1;
        continue;
      }
      kept[at]!.push(line);
      budget -= line.length + 2;
    }
  }

  const parts: string[] = [];
  for (const [at, header] of headers.entries()) {
    parts.push(header);
    parts.push(...kept[at]!);
  }

  // 🔴 Silence about a truncation is the defect the coverage record exists to prevent. If we
  // had to leave material out, the model is told, so it can decline rather than confabulate.
  if (dropped > 0) {
    parts.push(
      `(${dropped} further excerpt${dropped === 1 ? "" : "s"} were not included because the material is long. Do not claim to have covered them.)`,
    );
  }

  return parts.join("\n\n");
}

/** Resolve a citation to the actual source and text behind it, or null. */
export function quotedExcerpt(
  sources: readonly CanvasSource[],
  ref: SourceRef,
): { source: CanvasSource; excerpt: SourceExcerpt } | null {
  const source = sources.find((candidate) => candidate.id === ref.sourceId);
  if (!source) return null;
  const excerpt = source.excerpts.find((candidate) => candidate.id === ref.excerptId);
  return excerpt ? { source, excerpt } : null;
}

/**
 * The same material, packed for a DELIVERABLE rather than for a cited answer.
 *
 * 🔴🔴 IT DROPS THE EXCERPT IDS ON PURPOSE, AND THAT IS THE WHOLE DIFFERENCE FROM
 * `groundingBlock`. That function exists so an on-screen answer can be resolved back to the
 * sentence it came from, and every line it emits carries a bracketed `[s1:e4]` for the renderer to
 * turn into a pill. A Word file, a PDF, a slide deck and a flashcard are things the learner takes
 * AWAY: nothing downstream resolves an id, so a model imitating the markers it was shown writes
 * them into the prose as literal noise. That failure is already on record — shown bracketed numbers
 * with nothing behind them, the model wrote "[1][2][3]" into its sentences (owner, 2026-08-31:
 * *"it's also made up citations"*).
 *
 * 🔴 EXCERPTS ARE JOINED BACK INTO RUNNING TEXT, one per line rather than one per paragraph. A
 * lecture transcript arrives as caption lines — the one that prompted this averaged 29 characters
 * across 2,530 of them — and a blank line between every fragment burns budget and reads as 2,530
 * disconnected statements instead of a lecture.
 */
export function materialText(sources: readonly CanvasSource[]): string {
  if (sources.length === 0) return "";

  const parts: string[] = [];
  let budget = MAX_GROUNDING_CHARS;
  let dropped = 0;

  for (const source of sources) {
    const header = `### ${source.title}${
      source.coverageNote ? `\n${source.coverageNote}` : ""
    }`;
    parts.push(header);
    budget -= header.length;

    const lines: string[] = [];
    for (const excerpt of source.excerpts) {
      const head = [excerpt.locator, excerpt.label].filter(Boolean).join(" · ");
      const line = head ? `${head}: ${excerpt.text}` : excerpt.text;
      if (line.length > budget) {
        dropped += 1;
        continue;
      }
      lines.push(line);
      budget -= line.length + 1;
    }
    if (lines.length > 0) parts.push(lines.join("\n"));
  }

  // 🔴 The same honesty `groundingBlock` keeps: silence about a truncation is how a model comes to
  // claim it covered a chapter it was never shown.
  if (dropped > 0) {
    parts.push(
      `(${dropped} further passage${dropped === 1 ? " was" : "s were"} not included because the material is long. Do not claim to have covered them.)`,
    );
  }

  return parts.join("\n\n");
}
