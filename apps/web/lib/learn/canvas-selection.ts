// Selecting part of the canvas, below block granularity.
//
// A block is a rendering and state unit — it is NOT the smallest thing a learner can point at.
// Someone reading "sodium rushes in down its electrochemical gradient" is confused by three
// words of it, not by the paragraph, and asking them to interact with the whole paragraph makes
// them describe their confusion instead of pointing at it.
//
// So: the block id gives context, and the character range says precisely what they meant.
//
// 🔴 OFFSETS ARE NOT IDENTITY. A block can be rewritten — by the teaching loop, or by the very
// "Simpler" action a selection triggers — and offsets into the old text then index nothing.
// Every selection therefore also carries a text anchor (exact + a little either side), which
// survives edits elsewhere in the block and degrades honestly when it does not: a missing
// anchor means "we cannot find that any more", which is recoverable, where a stale offset means
// "here is some other text", which is not.
//
// Everything here is pure so it can be tested without a DOM.

/** How much context either side of the selection is kept for re-finding it later. Long enough
 *  to disambiguate a repeated phrase, short enough to survive nearby edits. */
const ANCHOR_CONTEXT = 32;

/** Roughly where a sentence ends. Deliberately structural — no vocabulary, no subject matter,
 *  so it reads the same for a statute, a proof and a weld procedure. */
const SENTENCE_END = /[.!?]["')\]]?\s/g;

export type SelectionAction = "define" | "explain" | "simpler" | "example" | "why";

/** What kind of thing was selected. Drives which actions are worth offering — §3 is explicit
 *  that six or seven buttons on every selection is the wrong answer. */
export type SelectionShape = "word" | "phrase" | "passage";

export interface TextAnchor {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface CanvasSelection {
  /** The region the selection sits in. A block id where the region is a block; otherwise a
   *  synthetic id for question or feedback text, which are just as selectable (§27) without
   *  being part of the document. */
  regionId: string;
  /** Set only when the region is a document block, i.e. when a rewrite has somewhere to land. */
  blockId?: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  /** The sentence the selection sits in — a definition is worthless without it, because a word
   *  means different things in different fields and often in different paragraphs. */
  surroundingText: string;
  anchor: TextAnchor;
  conceptIds?: string[];
  /** False for question and feedback text: "Simpler" has nowhere to write there. */
  rewritable: boolean;
}

export interface SelectionActionOption {
  action: SelectionAction;
  label: string;
}

/** Word / phrase / passage, by shape rather than by length alone. */
export function selectionShape(text: string): SelectionShape {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return "word";
  // A sentence-ending mark inside the selection means they grabbed at least a whole statement,
  // however short it is.
  if (words.length > 8 || /[.!?](\s|$)/.test(trimmed)) return "passage";
  return "phrase";
}

/** The restrained menu. Ordered with the most likely intent first, because the first button is
 *  the one that gets pressed. */
export function selectionActions(shape: SelectionShape, rewritable: boolean): SelectionActionOption[] {
  const options: SelectionActionOption[] =
    shape === "word"
      ? [
          { action: "define", label: "Define" },
          { action: "explain", label: "Explain" },
        ]
      : shape === "phrase"
        ? [
            { action: "explain", label: "Explain" },
            { action: "simpler", label: "Simpler" },
            { action: "example", label: "Example" },
          ]
        : [
            { action: "explain", label: "Explain" },
            { action: "simpler", label: "Simplify" },
            { action: "why", label: "Why?" },
          ];

  // Rewriting is the one action that needs somewhere to write. Offering it over feedback text
  // would fail at the moment of use, which is the worst time to discover a control is a lie.
  return rewritable ? options : options.filter((option) => option.action !== "simpler");
}

/** Context either side, for finding this selection again after the block around it changes. */
export function buildAnchor(text: string, start: number, end: number): TextAnchor {
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - ANCHOR_CONTEXT), start),
    suffix: text.slice(end, end + ANCHOR_CONTEXT),
  };
}

/** Re-find an anchored selection in text that may have changed underneath it.
 *
 *  Returns null rather than a guess. A selection we can no longer place is a fact worth
 *  reporting; a selection placed on the wrong words is a wrong answer about the wrong thing. */
export function locateAnchor(text: string, anchor: TextAnchor): { start: number; end: number } | null {
  if (!anchor.exact) return null;

  // Prefer the occurrence whose surroundings still match — that is what the context is for when
  // the same phrase appears twice in one block.
  //
  // 🔴 Only when there IS context. With both sides empty this search is character-for-character
  // the plain search, so it matched the first occurrence and returned it as though the context
  // had confirmed it — skipping the ambiguity guard below entirely. An anchor with no context
  // is exactly the case that cannot distinguish two identical phrases.
  const hasContext = anchor.prefix.length > 0 || anchor.suffix.length > 0;
  if (hasContext) {
    const withContext = text.indexOf(`${anchor.prefix}${anchor.exact}${anchor.suffix}`);
    if (withContext !== -1) {
      const start = withContext + anchor.prefix.length;
      return { start, end: start + anchor.exact.length };
    }
  }

  const plain = text.indexOf(anchor.exact);
  if (plain === -1) return null;
  // Ambiguous and unanchored: two identical phrases and nothing left to tell them apart. Saying
  // "I do not know which one" beats picking the first and being confidently wrong half the time.
  if (text.indexOf(anchor.exact, plain + 1) !== -1) return null;
  return { start: plain, end: plain + anchor.exact.length };
}

/** The sentence containing the selection, which is the context a definition actually needs. */
export function surroundingSentence(text: string, start: number, end: number): string {
  let from = 0;
  let to = text.length;

  SENTENCE_END.lastIndex = 0;
  for (let match = SENTENCE_END.exec(text); match; match = SENTENCE_END.exec(text)) {
    const boundary = match.index + match[0].length;
    if (boundary <= start) from = boundary;
    else if (match.index >= end) {
      to = boundary;
      break;
    }
  }

  const sentence = text.slice(from, to).trim();
  // A selection spanning several sentences is its own context; returning a fragment of it would
  // be less useful than the thing itself.
  return sentence.length >= (end - start) ? sentence : text.slice(start, end);
}
