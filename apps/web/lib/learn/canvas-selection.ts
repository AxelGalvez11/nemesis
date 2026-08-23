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

/**
 * The two things the CODE asks for on the learner's behalf, neither of which is a menu button.
 *
 * 🔴🔴 THIS USED TO BE THE TOOLBAR, AND THE TOOLBAR WAS THE WRONG SHAPE. It read
 * `"define" | "explain" | "simpler" | "example" | "why"`, and `selectionActions()` below chose two
 * or three of them to show. Owner, 2026-08-21: *"remove the 'define, explain, simpler, example,
 * why?' and replace with the 'ask nemesis'."*
 *
 * The objection is the same one that deleted `learning-intent.ts` from the front door. Five buttons
 * are five guesses at what somebody might want, made by us, in advance, in English, for every
 * field at once — and a learner whose question is not one of the five has nowhere to put it. They
 * are also a claim we cannot keep: "Why?" is the only way to ask for a reason, so "why is this
 * different from the one on the previous slide" has to be typed into the composer, where the
 * highlight is gone and they must describe where they were looking.
 *
 * What is left here are the two asks the SOFTWARE originates, where the intent is already settled
 * before any words exist:
 *   · `define` — the learner clicked a marked vocabulary word. The click IS the question, and this
 *     is the one lookup whose answer is worth remembering for next time (`recordLookup`).
 *   · `simpler` — the turn router already read a sentence and returned `then: "rewrite"`. The
 *     decision was made by the model upstream; this names what the canvas then does.
 * Everything a learner might want to SAY about a selection now goes through `askSelection`, in
 * their own words, and the model decides whether that means answering or rewriting.
 */
export type SelectionAction = "define" | "simpler";

/** What kind of thing was selected. No longer picks buttons — there is one control now — but it
 *  still names what the learner is pointing at, which is what the ask box says above the input. */
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
