// A conversational answer that can DRAW, not only describe.
//
// 🔴 REPORTED 2026-08-20: *"i asked it to create the chemical structures using the new tools we gave
// it."* It answered in prose — "Alcohol: R-OH (hydroxyl group)" — because a reply is a string and
// nothing on that path could ever have produced a picture. `SemanticVisual` renders nine kinds
// including `structure`, and every one of them was reachable only from the TEACHING path, built out
// of knowledge objects. The capability existed; the conversation had no way to reach it.
//
// 🔴🔴 THE MODEL ASKS FOR A DRAWING THROUGH THE TEXT CHANNEL, WHICH IS WHY THIS IS A PARSER AND NOT
// A NEW API FIELD. A `visuals` array on the turn decision would mean the router deciding, per turn,
// how many pictures to emit and where they go relative to the prose — and it cannot know "where",
// because the prose is written in the same breath. A fenced block is positional by construction:
// the drawing lands exactly where the model put it, between the sentence that introduces it and the
// one that follows.
//
// 🔴 AND IT DEGRADES TO SOMETHING TRUE. A fence this parser refuses stays in the answer as a code
// block showing the notation, which is what `ChemicalStructure` itself falls back to when the
// depiction library refuses a string. The learner sees `CCO` rather than a broken frame.
//
// 🔴 EVERY STRING IS VALIDATED BEFORE IT REACHES A DEPICTION LIBRARY, by the same `chem-notation.ts`
// the teaching path uses. A model-written SMILES is exactly as untrusted here as one extracted from
// a document, and there is one place that decides.
//
// PURE. No React, no I/O.

import { validateStructure, type ChemNotation } from "./chem-notation";
import type { StructureVisual } from "./canvas-visual";

/**
 * One piece of a reply: prose to render as markdown, or a drawing to mount.
 *
 * 🔴 A UNION AND AN ORDERED LIST, BECAUSE POSITION IS THE WHOLE POINT. Returning `{ text, visuals }`
 * would lose where each drawing belonged and the renderer would have to put them all at the end —
 * which is what "describe it and then show four pictures" looks like, and is not what was asked
 * for.
 */
export type ReplySegment =
  | { kind: "prose"; text: string }
  | { kind: "visual"; visual: StructureVisual };

/**
 * Fences this understands. The language tag is the notation.
 *
 * 🔴 `reaction` MAPS TO `reaction-smiles` RATHER THAN BEING SPELLED OUT. A model writing
 * ```reaction-smiles is accepted too; asking it to remember a hyphenated internal name is a way to
 * lose drawings to a spelling.
 */
const FENCE_NOTATION: Record<string, ChemNotation> = {
  reaction: "reaction-smiles",
  "reaction-smiles": "reaction-smiles",
  smiles: "smiles",
};

/** ```smiles CCO``` — the tag, then everything up to the closing fence. */
const FENCE_RE = /```([a-zA-Z-]+)[ \t]*\r?\n([\s\S]*?)```/g;

/**
 * `[smiles: CCO]` — the same request on ONE line.
 *
 * 🔴🔴 THIS EXISTS BECAUSE THE FENCED FORM WAS NEVER USED, MEASURED TWICE IN A BROWSER. The model
 * was told it could draw and answered in prose both times. The reason is structural rather than a
 * matter of emphasis: `say` is a STRING INSIDE A JSON OBJECT, and the contract around it says
 * "answer with a single JSON object and nothing else". A fenced block needs literal newlines and a
 * run of backticks inside that string, and a model asked for strict JSON steers away from both.
 *
 * A single-line token costs it nothing. Both forms are accepted — a fence is what a model reaching
 * for markdown will produce anyway, and refusing it would lose a drawing to a format preference.
 *
 * 🔴 IT CANNOT COLLIDE WITH A CITATION MARKER. `[1]` is digits; this requires a notation word and a
 * colon, so `citationsToMarkdown`'s `\[(\d{1,2})\]` and this pattern are disjoint by construction.
 */
const INLINE_RE = /\[(smiles|reaction|reaction-smiles)\s*:\s*([^\]\n]+)\]/gi;

/**
 * Split a reply into prose and the drawings it asked for.
 *
 * A reply with no fences returns exactly one prose segment holding the original string, so the
 * ordinary case is untouched and the renderer has one path rather than two.
 */
export function replySegments(text: string): ReplySegment[] {
  const segments: ReplySegment[] = [];
  let cursor = 0;

  // 🔴 BOTH FORMS, IN THE ORDER THEY APPEAR IN THE TEXT. Matching one pattern and then the other
  // would emit the drawings out of order whenever a reply mixed them, and position is the whole
  // reason this is a split.
  const matches = [...text.matchAll(FENCE_RE), ...text.matchAll(INLINE_RE)].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );

  for (const match of matches) {
    const notation = FENCE_NOTATION[match[1]!.toLowerCase()];
    // 🔴 AN UNKNOWN LANGUAGE IS LEFT ALONE, NOT SWALLOWED. ```python in an answer is a code block
    // and must reach the markdown renderer as one; consuming it here would delete it from the page.
    if (!notation) continue;

    const validation = validateStructure(notation, match[2]);
    // 🔴 A REFUSED STRUCTURE ALSO STAYS IN THE PROSE. `chem-notation.ts` refuses on length, on
    // characters a depiction library must never be handed, and on emptiness. Dropping the fence
    // would remove the notation from the answer entirely and leave a sentence pointing at nothing.
    if (!validation.ok) continue;

    const before = text.slice(cursor, match.index);
    if (before.trim()) segments.push({ kind: "prose", text: before });
    segments.push({
      kind: "visual",
      visual: {
        kind: "structure",
        // 🔴 NO `resolvedFrom`, AND ITS ABSENCE IS THE HONEST FACT. That field means "a resolver was
        // asked for this name and returned this string". Here a model wrote it from memory. Both
        // may be correct and they are not equally trustworthy, and `canvas-visual.ts` says a
        // surface that could not tell them apart would present a remembered SMILES exactly like a
        // looked-up one.
        learningGoal: "",
        notation,
        value: validation.value,
      },
    });
    cursor = match.index + match[0].length;
  }

  const rest = text.slice(cursor);
  if (rest.trim() || segments.length === 0) segments.push({ kind: "prose", text: rest });
  return segments;
}

/** Does this reply ask for any drawing at all? Lets a caller skip the split entirely. */
export function hasReplyVisuals(text: string): boolean {
  return replySegments(text).some((segment) => segment.kind === "visual");
}
