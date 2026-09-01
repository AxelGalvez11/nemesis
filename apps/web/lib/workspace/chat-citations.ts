// Answers grounded on web search cite their numbered results as [1]..[5].
// This turns those markers into `#nemesis-cite=` links, which the chat
// markdown renderer paints as inline favicon pills (same pre-process idiom as
// ==highlight== and <u>underline</u> — never rehype-raw).
//
// Kept as a pure module, separate from the renderer, so the edge cases below
// are covered by chat-citations.test.ts without mounting React.

/** `[12]` but not `[1](…)`, which is already a markdown link.
 *  🔴 THE LEADING SPACE IS CAPTURED so a DELETED marker takes it with it. Without that, removing
 *  the marker in "item [1] of" leaves "item  of" — a double space that survives into the rendered
 *  paragraph. A marker that becomes a pill puts its space back. */
const CITE_MARKER_RE = /([ \t]*)\[(\d{1,2})\](?!\()/g;

/** Fenced blocks and inline code, captured so split() keeps them as odd-index
 *  chunks we pass through untouched. */
const CODE_SEGMENT_RE = /(```[\s\S]*?```|`[^`\n]*`)/g;

/**
 * Rewrite in-range citation markers into pill links, and DELETE the rest.
 *
 * `sourceCount` is the number of results the model was actually given.
 *
 * 🔴🔴 A MARKER THAT CANNOT BECOME A PILL IS REMOVED, NOT PRINTED. This used to return the text
 * untouched when there were no sources, and leave out-of-range markers as plain text, reasoning
 * that *"a bare [9] is less wrong than a pill pointing at nothing"*. Both halves were wrong in the
 * same way, and the owner reported the result twice on 2026-08-31: *"it's also made up citations"*
 * and *"citations should only show up as the pill form."*
 *
 * A bare `[9]` is not a smaller version of a citation, it is a claim of evidence with nothing
 * behind it — in a product a student trusts to be right, that is the worse failure, not the
 * safer one. And it is the ONLY way a bracket number ever reaches the screen, so removing it
 * makes "citations appear as pills" true by construction rather than by the model's good behaviour.
 *
 * 🔴 THE MODEL INVENTS THEM WITH NO SOURCES AT ALL, which is why the `sourceCount <= 0` early
 * return had to go: it was the path the owner's screenshot took. His answer carried
 * `[1][2][3] … [5] … [2][6]` with not one source attached to the turn.
 *
 * 🔴 CODE IS STILL UNTOUCHED. `[1]` inside a fence is an array index, a footnote in someone's
 * pasted source, or a shell glob — never a citation.
 */
export function citationsToMarkdown(text: string, sourceCount: number): string {
  return text
    .split(CODE_SEGMENT_RE)
    .map((chunk, index) =>
      index % 2 === 1
        ? chunk
        : chunk.replace(CITE_MARKER_RE, (_match, lead: string, digits: string) => {
            const n = Number.parseInt(digits, 10);
            return n >= 1 && n <= sourceCount ? `${lead}[${n}](#nemesis-cite=${n})` : "";
          }),
    )
    .join("");
}

/**
 * A run of adjacent markers becomes ONE pill that says how many more there were.
 *
 * 🔴 MEASURED OFF THE REFERENCE, 2026-08-20. ChatGPT renders a sentence citing two sources as a
 * single pill reading **"Reuters+1"** — 76px against 62px for a lone one. Ours drew one pill per
 * marker, so a well-cited sentence ended in a row of dots and a broad answer ended in ten of them,
 * which is the clutter the owner reported.
 *
 * 🔴 ADJACENT ONLY, AND WHITESPACE BETWEEN THEM COUNTS AS ADJACENT. `[1][2]` and `[1] [2]` are one
 * citation event; `[1] and later [2]` is two, and collapsing those would attach the second source
 * to a sentence that did not cite it.
 *
 * 🔴 THE EXTRA COUNT RIDES IN THE HREF AS `n.extra`, so the renderer needs no second channel and an
 * old renderer that only parses the leading integer still resolves the first source correctly
 * rather than breaking. `Number.parseInt` stops at the dot, which is exactly that fallback.
 */
export function groupCitationRuns(markdown: string): string {
  return markdown.replace(
    /\[(\d{1,2})\]\(#nemesis-cite=\d{1,2}\)(?:\s*\[\d{1,2}\]\(#nemesis-cite=\d{1,2}\))+/g,
    (run, first: string) => {
      const total = run.match(/#nemesis-cite=/g)?.length ?? 1;
      return `[${first}](#nemesis-cite=${first}.${total - 1})`;
    },
  );
}
