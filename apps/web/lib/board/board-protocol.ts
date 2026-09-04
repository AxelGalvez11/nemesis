// What the model writes in-band, and how the card text is cleaned of it.
//
// Wondering's answer carries two machine blocks inside the prose the learner never sees:
// `[[SUGGEST … ]]` (follow-ups, branches, new threads) and `[[LAYOUT …]]` lines. We keep the same
// grammar so one streamed answer carries the suggestions at no second call — see
// docs/wondering-canvas-reference.md §8. Their `[[EMBED]]` (a generated picture) is deliberately
// not asked for.
//
// 🔴 STRIP WHILE STREAMING, NOT ONLY AT THE END. A half-arrived `[[SUGGEST` tail would flash in the
// card as text; `PARTIAL_*_TAIL` cuts it the moment the opening bracket arrives.

import type { BoardSuggestions } from "./board-model";
import { emptySuggestions } from "./board-model";

const LAYOUT_DIRECTIVE_LINE = /^[ \t]*\[\[LAYOUT\b[^\]\n]*\]\][ \t]*\r?\n?/gm;
const PARTIAL_LAYOUT_TAIL = /\n?[ \t]*\[\[LAYOUT\b[^\]\n]*$/;
/** Any protocol opener that has only half arrived: `[[`, `[[SU`, `[[SUGGEST\nfollowUps:` … */
const PARTIAL_OPENER_TAIL = /\s*\[\[[A-Z]*(?:\b[\s\S]*)?$/;
const SUGGEST_BLOCK = /\s*\[\[SUGGEST\b[\s\S]*?\n[ \t]*\]\]/g;
const PARTIAL_SUGGEST_TAIL = /\s*\[\[SUGGEST\b[\s\S]*$/;
const SUMMARY_BLOCK = /\s*\[\[SUMMARY\b[\s\S]*?\n[ \t]*\]\]/g;
const PARTIAL_SUMMARY_TAIL = /\s*\[\[SUMMARY\b[\s\S]*$/;

/** The prose the learner reads: the answer minus every protocol block (and any half-arrived one). */
export function visibleAnswer(raw: string, streaming: boolean): string {
  let text = raw.replace(LAYOUT_DIRECTIVE_LINE, "").replace(SUGGEST_BLOCK, "").replace(SUMMARY_BLOCK, "");
  if (streaming) {
    text = text
      .replace(PARTIAL_LAYOUT_TAIL, "")
      .replace(PARTIAL_SUGGEST_TAIL, "")
      .replace(PARTIAL_SUMMARY_TAIL, "")
      .replace(PARTIAL_OPENER_TAIL, "");
  }
  if (text !== raw) text = text.trimStart();
  return text;
}

function readList(block: string, key: string): string[] {
  // `followUps:` then one `- item` per line until the next key or the closing bracket.
  const match = new RegExp(`${key}\\s*:\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:followUps|branches|newThreads)\\s*:|\\n[ \\t]*\\]\\]|$)`, "i").exec(block);
  if (!match) return [];
  return (match[1] ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((line) => line && !/^\]\]/.test(line))
    .slice(0, 4);
}

/** The suggestions block, parsed. Absent or malformed → empty lists, never a throw. */
export function readSuggestions(raw: string): BoardSuggestions {
  const match = /\[\[SUGGEST\b([\s\S]*?)\n[ \t]*\]\]/.exec(raw);
  if (!match) return emptySuggestions();
  const block = match[1] ?? "";
  return {
    followUps: readList(block, "followUps"),
    branches: readList(block, "branches"),
    newThreads: readList(block, "newThreads"),
  };
}

/** The `[[SUMMARY title: … | summary: …]]` block: the card's title once the model has read the
 *  question, and a one-line summary for the collapsed card. */
export function readSummary(raw: string): { title?: string; summary?: string } {
  const match = /\[\[SUMMARY\b([\s\S]*?)\n[ \t]*\]\]/.exec(raw);
  if (!match) return {};
  const block = match[1] ?? "";
  const title = /title\s*:\s*(.+)/i.exec(block)?.[1]?.trim();
  const summary = /summary\s*:\s*(.+)/i.exec(block)?.[1]?.trim();
  return { ...(title ? { title: title.slice(0, 60) } : {}), ...(summary ? { summary: summary.slice(0, 200) } : {}) };
}

/** What the system prompt tells the model about the blocks. Kept beside the parser so the two
 *  cannot drift. */
export const PROTOCOL_INSTRUCTION =
  "After the answer, and only after it, append two machine blocks exactly in this form (they are stripped before display):\n" +
  "[[SUMMARY\n" +
  "title: <at most 8 words naming what this card is about>\n" +
  "summary: <one sentence, at most 25 words, of what the answer said>\n" +
  "]]\n" +
  "[[SUGGEST\n" +
  "followUps:\n- <a natural next question in this same thread>\n- <another>\n" +
  "branches:\n- <a question that deserves its own thread beside this one>\n- <another>\n" +
  "newThreads:\n- <a related topic worth starting fresh on this board>\n- <another>\n" +
  "]]\n" +
  "Write two to four items per list, each a complete question or topic the learner could click, in the learner's language. Never mention these blocks in the answer.";

/** How key terms are marked: a markdown link to `#concept` whose title is the one-line meaning.
 *  Rendered as a pill with a popover; see concept-keyword.tsx. */
export const CONCEPT_INSTRUCTION =
  "Mark two to five key terms in the answer, at their first appearance only, as markdown links of exactly this form: " +
  '[term](#concept "one plain sentence explaining the term"). Only terms a learner might want defined; never mark ordinary words, ' +
  "and never mark a term more than once.";

const MARKDOWN_IMAGE_PARTS = /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?[^)]*\)/;

export function firstImage(messages: ReadonlyArray<{ content: string; isError?: boolean }>): { alt: string; url: string } | null {
  for (const message of messages) {
    if (message.isError) continue;
    const match = MARKDOWN_IMAGE_PARTS.exec(message.content);
    if (match?.[2]) return { alt: match[1] ?? "", url: match[2] };
  }
  return null;
}

const CODE_FENCE = /```[\s\S]*?(```|$)/g;
const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const HEADING_MARKER = /^\s{0,3}#{1,6}\s+/gm;
const LIST_MARKER = /^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm;
const BLOCKQUOTE_MARKER = /^\s{0,3}>\s?/gm;
const INLINE_DECORATION = /[*_`~]/g;

/** The collapsed card's one-line summary when the model gave none: the last good answer flattened. */
export function deriveCardSummary(
  messages: ReadonlyArray<{ role: string; content: string; isError?: boolean; isStreaming?: boolean; wasTruncated?: boolean }>,
  max = 200,
): string {
  for (let at = messages.length - 1; at >= 0; at -= 1) {
    const message = messages[at];
    if (!message || message.role !== "assistant" || message.isError) continue;
    const flat = visibleAnswer(message.content, Boolean(message.isStreaming || message.wasTruncated))
      .replace(CODE_FENCE, " ")
      .replace(MARKDOWN_IMAGE, " ")
      .replace(MARKDOWN_LINK, "$1")
      .replace(HEADING_MARKER, "")
      .replace(LIST_MARKER, "")
      .replace(BLOCKQUOTE_MARKER, "")
      .replace(INLINE_DECORATION, "")
      .replace(/\s+/g, " ")
      .trim();
    if (flat) return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  }
  return "";
}
