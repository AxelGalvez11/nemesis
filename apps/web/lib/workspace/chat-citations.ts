// Answers grounded on web search cite their numbered results as [1]..[5].
// This turns those markers into `#nemesis-cite=` links, which the chat
// markdown renderer paints as inline favicon pills (same pre-process idiom as
// ==highlight== and <u>underline</u> — never rehype-raw).
//
// Kept as a pure module, separate from the renderer, so the edge cases below
// are covered by chat-citations.test.ts without mounting React.

/** `[12]` but not `[1](…)`, which is already a markdown link. */
const CITE_MARKER_RE = /\[(\d{1,2})\](?!\()/g;

/** Fenced blocks and inline code, captured so split() keeps them as odd-index
 *  chunks we pass through untouched. */
const CODE_SEGMENT_RE = /(```[\s\S]*?```|`[^`\n]*`)/g;

/**
 * Rewrite in-range citation markers into pill links.
 *
 * `sourceCount` is the number of results the model was actually given. Markers
 * outside 1..sourceCount are left as plain text: the model occasionally invents
 * a number, and a bare "[9]" is less wrong than a pill pointing at nothing.
 */
export function citationsToMarkdown(text: string, sourceCount: number): string {
  if (sourceCount <= 0) return text;
  return text
    .split(CODE_SEGMENT_RE)
    .map((chunk, index) =>
      index % 2 === 1
        ? chunk
        : chunk.replace(CITE_MARKER_RE, (match, digits: string) => {
            const n = Number.parseInt(digits, 10);
            return n >= 1 && n <= sourceCount ? `[${n}](#nemesis-cite=${n})` : match;
          }),
    )
    .join("");
}
