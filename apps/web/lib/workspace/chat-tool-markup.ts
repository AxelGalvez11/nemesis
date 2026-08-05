// Nothing the model emits that looks like a tool invocation may ever reach the
// student's screen.
//
// Why this exists (owner 2026-08-05, production acceptance pass): the agent loop
// sends its final round WITHOUT tools so the turn has to end in prose
// (chat-api.ts). Nothing told the model its tools were gone, so DeepSeek — still
// mid-investigation — emitted its internal tool-call syntax into the CONTENT
// channel instead. The student watched this stream in where the answer should
// have been:
//
//   < |  | DSML |  | tool_calls> < |  | DSML |  | invoke name="search_library"> …
//
// Two independent defences, because the first one is a prompt and prompts are
// advice: chat-api appends a "you have no tools left" instruction on that round,
// and every assistant string passes through here before it is displayed. This
// module is the one that cannot be talked out of it.
//
// Deliberately aggressive: these tokens have no legitimate place in an answer to
// a student, so a false positive (someone asks what `tool_calls` means and gets
// a truncated reply) is a far cheaper mistake than leaking the markup again.

/** Fires on the first sign of invocation syntax, in any of the shapes DeepSeek
 *  and Anthropic-style harnesses emit. `｜` (U+FF5C) is included because the
 *  DeepSeek special tokens use the fullwidth pipe, not ASCII `|`. */
const MARKER_RE =
  /<\s*[|｜]|<\/?\s*(?:antml:)?(?:invoke|parameter|tool_calls|function_calls|tool_call)\b|\bDSML\b|\btool_calls\b|\b(?:antml:)?invoke\s+name\s*=|\bparameter\s+name\s*=/i;

/** Past this much surviving prose we keep the answer and append a note rather
 *  than replacing it wholesale — the model usually says something true before it
 *  derails, and throwing that away helps nobody. */
const MIN_USEFUL_CHARS = 40;

/** How far back a still-unclosed `<` is treated as a marker being assembled.
 *  Beyond this it is ordinary prose that simply contains a less-than sign. */
const MAX_PENDING_MARKER_SPAN = 200;

/** Shown when the entire reply was markup and nothing usable survived. */
export const TOOL_MARKUP_FALLBACK =
  "I ran out of steps before I could finish that, so I stopped rather than guess. Nothing in your workspace was changed. Ask me again and I'll pick it back up — or point me at one part of it (just the calendar, or just the Library) so it fits in a single pass.";

/** Appended when real prose survived but the reply still derailed into markup. */
export const TOOL_MARKUP_TRUNCATION_NOTE =
  "_(I ran out of steps here before finishing. Nothing was changed.)_";

/** True when `text` contains anything that looks like tool-invocation syntax. */
export function containsToolMarkup(text: string): boolean {
  return MARKER_RE.test(text);
}

/**
 * Everything from the first invocation marker onward, removed.
 *
 * The leak always runs to the end of the message — the model is emitting one
 * long fake tool call — so cutting at the first marker is both sufficient and
 * safe. Text before the marker is genuine prose and is kept verbatim.
 */
export function stripToolMarkup(text: string): string {
  const at = text.search(MARKER_RE);
  return at < 0 ? text : text.slice(0, at);
}

/**
 * The assistant string as it may be displayed.
 *
 * Returns the text unchanged when it is clean. When markup leaked, returns the
 * surviving prose plus an honest note, or the fallback when nothing survived.
 * `contaminated` is for logging and tests — the caller shows `text` either way.
 */
export function sanitizeAssistantText(text: string | null): { text: string | null; contaminated: boolean } {
  if (!text || !containsToolMarkup(text)) return { contaminated: false, text };
  const kept = stripToolMarkup(text).trimEnd();
  if (kept.replace(/\s+/g, " ").trim().length < MIN_USEFUL_CHARS) {
    return { contaminated: true, text: TOOL_MARKUP_FALLBACK };
  }
  return { contaminated: true, text: `${kept}\n\n${TOOL_MARKUP_TRUNCATION_NOTE}` };
}

/**
 * How much of a still-streaming reply is safe to paint right now.
 *
 * Sanitising the finished string is not enough on its own: the student watches
 * the answer arrive token by token, so `<`, then `|`, then `DSML` would each be
 * painted before the completed string was ever examined. Anything after an
 * unclosed `<` is therefore withheld until it closes or the stream ends, at
 * which point sanitizeAssistantText has the whole string and decides for real.
 */
export function safeStreamPrefix(accumulated: string): string {
  const cleaned = stripToolMarkup(accumulated);
  const opened = cleaned.lastIndexOf("<");
  if (opened < 0) return cleaned;
  const tail = cleaned.slice(opened);
  if (tail.includes(">")) return cleaned;
  return tail.length <= MAX_PENDING_MARKER_SPAN ? cleaned.slice(0, opened) : cleaned;
}
