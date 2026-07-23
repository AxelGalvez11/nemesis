// The three Obsidian-flavoured rules the WEB note editor renders and the phone
// did not: ==highlight==, #tag, and <u>underline</u>.
//
// Why this exists (owner 2026-07-22: "the ios app does feel like a notepad and
// it does not recognize some custom rules that are present in the webapp"):
// web's library editor decorates all three live
// (components/workspace/library/library-preview-decorations.ts), while the
// phone renders through react-native-markdown-display — markdown-it with
// `html:false` — which knows none of them. So a highlight came out as literal
// "==text==" and an underline as literal "<u>text</u>".
//
// Worse than a parity gap, it was self-inflicted: the phone's OWN editor
// toolbar (NoteBlockEditor.tsx) has Highlight and Underline buttons that write
// exactly this syntax. The app was producing markup it could not read back.
//
// These are markdown-it INLINE RULES, so they compose properly — they never
// fire inside code spans or fenced blocks, which a text-level find/replace
// (the preprocessWikilinks approach) cannot promise.
//
// Each emits a matched token pair, e.g. mark_open/mark_close.
// react-native-markdown-display derives an AST node type by stripping
// _open/_close (lib/util/getTokenTypeByToken.js), so those become node types
// "mark", "tag" and "u", which MessageBody supplies render rules for.

import type { MarkdownItInstance, StateInline } from "markdown-it";

/** A tag is "#" followed by letters (any script), digits, "_", "-" or "/" —
 *  matching web's own /(?:^|\s)(#[\p{L}\d_-]+)/u, plus "/" so Obsidian's
 *  nested "#chem/organic" stays one tag. Exported for tests. */
export const TAG_BODY = /^[\p{L}\d_\-/]+/u;

/** Whether a "#" at `pos` starts a tag rather than a heading or an id-fragment.
 *  It must open a word — start of line, or preceded by whitespace — which is
 *  what keeps "https://x.com/a#b" and "C#" from becoming tags. Pure, tested. */
export function isTagStart(src: string, pos: number): boolean {
  if (src[pos] !== "#") return false;
  if (pos > 0 && !/\s/.test(src[pos - 1])) return false;
  return TAG_BODY.test(src.slice(pos + 1));
}

/** ==highlight== — paired "==" on one line, no empty middle. */
function markRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== 0x3d /* = */ || src.charCodeAt(pos + 1) !== 0x3d) return false;
  const end = src.indexOf("==", pos + 2);
  if (end === -1) return false;
  const content = src.slice(pos + 2, end);
  // A newline inside would swallow a paragraph break; an empty body would make
  // "====" render as an invisible highlight.
  if (!content.trim() || content.includes("\n")) return false;
  if (!silent) {
    state.push("mark_open", "mark", 1);
    const token = state.push("text", "", 0);
    token.content = content;
    state.push("mark_close", "mark", -1);
  }
  state.pos = end + 2;
  return true;
}

/** #tag — rendered as a pill, the way web decorates it. */
function tagRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (!isTagStart(src, pos)) return false;
  const body = TAG_BODY.exec(src.slice(pos + 1));
  if (!body) return false;
  if (!silent) {
    state.push("tag_open", "tag", 1);
    const token = state.push("text", "", 0);
    token.content = `#${body[0]}`;
    state.push("tag_close", "tag", -1);
  }
  state.pos = pos + 1 + body[0].length;
  return true;
}

/** <u>underline</u> — the one raw tag the note toolbar writes. markdown-it runs
 *  with html:false here (and must keep doing so: enabling HTML on text that
 *  syncs from the cloud would let a note inject arbitrary markup), so this
 *  handles the single tag we actually author rather than opening that door. */
function underlineRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (!src.startsWith("<u>", pos)) return false;
  const end = src.indexOf("</u>", pos + 3);
  if (end === -1) return false;
  const content = src.slice(pos + 3, end);
  if (content.includes("\n")) return false;
  if (!silent) {
    state.push("u_open", "u", 1);
    const token = state.push("text", "", 0);
    token.content = content;
    state.push("u_close", "u", -1);
  }
  state.pos = end + 4;
  return true;
}

/** Install all three on a markdown-it instance. */
export function obsidianInline(md: MarkdownItInstance): void {
  md.inline.ruler.before("emphasis", "obsidian_mark", markRule);
  md.inline.ruler.before("emphasis", "obsidian_underline", underlineRule);
  // After emphasis: "#" is not an emphasis character, so ordering only has to
  // keep tags out of links, which linkify/link rules have already consumed.
  md.inline.ruler.push("obsidian_tag", tagRule);
}
