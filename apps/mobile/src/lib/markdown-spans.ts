// Splitting one line of markdown source into styled runs, so the line you are
// EDITING can look like writing instead of like code.
//
// Owner 2026-07-28: "the hiding of the markdown syntax so notes are beginner
// friendly". Reading mode was already clean; the complaint is the block holding
// the caret, which showed `**bold words**`, `*italic*`, `==highlight==` raw.
//
// WHAT CHANGED SINCE THIS WAS CALLED IMPOSSIBLE
//
// NoteBlockEditor's header argued that character-level hiding "is not reachable
// in React Native at all", on the grounds that a text field cannot display text
// different from its value and nested <Text> children "can style characters but
// never omit them". The first half is still true. The second half was the
// opening, and a probe on the simulator (iPhone 17 / iOS 26.5 / RN 0.85, new
// architecture, 2026-07-28) confirmed it: an EDITABLE TextInput does render
// styled <Text> children, so `**` can be dimmed to near-invisible even though it
// cannot be removed.
//
// That is the whole idea here. Markers stay in the buffer — so the caret,
// selection and every offset in lib/note-edit.ts keep working on the real source
// — but they are painted in the faint hint colour while the words they wrap take
// the emphasis they describe. Bold reads bold; the asterisks recede.
//
// THE INVARIANT, and the reason this file is pure and tested:
//
//     spans(source).map((s) => s.text).join("") === source
//
// If that ever breaks, the editor is displaying something other than what it
// will save, which is the one failure a notes app must never have. Every test
// below asserts it, on every input.

/** How a run should be painted. `marker` is the syntax itself. */
export type SpanKind =
  | "text"
  | "marker"
  | "strong"
  | "em"
  | "mark"
  | "code"
  | "strike"
  | "underline";

export interface Span {
  text: string;
  kind: SpanKind;
}

/** Inline pairs: opening marker, closing marker, and how the middle is painted.
 *  Order matters — `**` must be tried before `*`, or bold parses as two italics. */
const INLINE: ReadonlyArray<{ open: string; close: string; kind: SpanKind }> = [
  { close: "**", kind: "strong", open: "**" },
  { close: "~~", kind: "strike", open: "~~" },
  { close: "==", kind: "mark", open: "==" },
  { close: "</u>", kind: "underline", open: "<u>" },
  { close: "`", kind: "code", open: "`" },
  { close: "*", kind: "em", open: "*" },
];

/** Line-leading markers: heading hashes, bullet, quote. The trailing space is
 *  part of the marker — dimming "- " whole is what makes a list read as a list
 *  rather than as a hyphen someone typed. */
const LINE_PREFIXES: readonly string[] = ["###### ", "##### ", "#### ", "### ", "## ", "# ", "> ", "- ", "* ", "+ "];

/** `1. `, `2. `, … — a numbered item's marker, or "" if this line has none. */
function orderedPrefix(source: string): string {
  const match = /^(\d{1,9}\. )/.exec(source);
  return match ? (match[1] as string) : "";
}

/** Push text onto the tail when it shares a kind, so the output has no runs of
 *  adjacent same-kind spans to render (and to read, in a failing test). */
function push(spans: Span[], text: string, kind: SpanKind): void {
  if (!text) return;
  const tail = spans[spans.length - 1];
  if (tail && tail.kind === kind) {
    tail.text += text;
    return;
  }
  spans.push({ kind, text });
}

/**
 * One line of markdown as styled runs. Never throws, never drops or adds a
 * character — an unmatched `**` is simply ordinary text, which is exactly what
 * it looks like mid-typing.
 */
export function markdownSpans(source: string): Span[] {
  const spans: Span[] = [];
  if (!source) return spans;

  let index = 0;

  // A leading marker only counts at the very start of the line.
  const prefix = LINE_PREFIXES.find((candidate) => source.startsWith(candidate)) ?? orderedPrefix(source);
  if (prefix) {
    push(spans, prefix, "marker");
    index = prefix.length;
  }

  while (index < source.length) {
    const rest = source.slice(index);
    const pair = INLINE.find((candidate) => rest.startsWith(candidate.open));
    if (pair) {
      // The closing marker must exist AND have something between it and the
      // opener; `****` is four literal asterisks, not empty bold.
      const from = index + pair.open.length;
      const closeAt = source.indexOf(pair.close, from);
      if (closeAt > from) {
        push(spans, pair.open, "marker");
        push(spans, source.slice(from, closeAt), pair.kind);
        push(spans, pair.close, "marker");
        index = closeAt + pair.close.length;
        continue;
      }
    }
    push(spans, source[index] as string, "text");
    index += 1;
  }

  return spans;
}
