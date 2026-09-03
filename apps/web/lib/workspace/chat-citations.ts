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

// ── Citing the learner's OWN material ───────────────────────────────────────
//
// 🔴🔴 THE `[n]` MACHINERY ABOVE IS FOR WEB RESULTS AND ONLY WEB RESULTS, AND THAT WAS THE WHOLE
// GAP. Owner, 2026-09-01, comparing his canvas with ChatGPT's answer to the same prompt and the
// same two uploads: ChatGPT pinned about fifteen chips to specific claims; ours pinned none. Not
// because the model ignored the files, it plainly used them ("the rule your slides give…", "your
// very first poll asks for the 19-position") — there was simply no way to SAY so. A reader could
// not tell which sentences came from the lecture and which from the model's own memory.
//
// 🔴 A SEPARATE MARKER, NOT A SHARED NUMBER SPACE, AND THAT IS A DELIBERATE REFUSAL. Merging files
// into the `[n]` list would put file and web citations in one positional index, and `canvas-chat.ts`
// documents at length why an `[n]` must resolve against exactly what the model was SHOWN — the
// usable results that fitted the budget, not the raw haul. Sharing that index means every one of
// those invariants has to hold for a second, differently-built list. The model already sees excerpt
// ids in its material block (`[s1:e4] (label) text`), so it can cite with an identifier it is
// holding rather than a number we would have to keep in sync.

/**
 * `[s1:e4]`, or `[s1:e26, s1:e29]` — one excerpt id or a comma-separated list of them.
 *
 * 🔴🔴 THE LIST FORM WAS MISSING FOR ITS FIRST TWO HOURS IN PRODUCTION, AND IT SHOWED. Measured on
 * the owner's own canvas the evening this shipped: single markers became pills exactly as intended,
 * and every sentence citing two excerpts kept a literal `[s1:e26, s1:e29]` sitting in the prose.
 * He reported the answer as "harder to read" in the same message, which is what a page of raw ids
 * mixed into finished text reads as.
 *
 * 🔴 IT WAS NOT THE MODEL DISOBEYING. Nothing told it one id per bracket, and grouping citations
 * for one sentence is the ordinary thing to do — every reference style does it. The instruction
 * asked for "that excerpt's id in square brackets" and a sentence built from two excerpts has two.
 * The parser is what was wrong.
 *
 * Still disjoint from the other markers by construction: `[1]` is bare digits, `[smiles: …]` needs
 * a notation word, and this needs `sN:eN`.
 */
const FILE_REF_RE = /([ \t]*)\[(s\d{1,3}:e\d{1,4}(?:\s*,\s*s\d{1,3}:e\d{1,4})*)\](?!\()/g;

/** One attached document the answer may cite. Structural: `CanvasSource` fits as-is. */
export interface FileCitation {
  id: string;
  title: string;
  /**
   * The durable `library_sources.id`, when this document was filed.
   *
   * 🔴 CARRIED SO THE PILL CAN BE OPENED, which is the whole reason it exists. Null is a real and
   * common state — every ephemeral attachment has none — and a pill with no filed row still opens
   * a tab showing what was cited, exactly as `SourceTab` documents.
   */
  librarySourceId?: string | null;
}

/**
 * Rewrite excerpt-id markers into file-pill links, and DELETE the rest.
 *
 * 🔴 A MARKER THAT CANNOT BECOME A PILL IS REMOVED, NOT PRINTED — the same rule `citationsToMarkdown`
 * learned the hard way when the owner reported *"it's also made up citations"*. A bare `[s3:e9]`
 * left in the prose is not a smaller citation, it is a claim of evidence with nothing behind it,
 * and it is uglier besides.
 *
 * 🔴 THE SOURCE ID IS WHAT SURVIVES INTO THE HREF, NOT THE EXCERPT ID. The pill names a document,
 * because that is what a learner recognises and can open; which excerpt inside it carried the
 * sentence is provenance the surface has no room to show. `s1:e4` therefore resolves to `s1`.
 *
 * 🔴 CODE IS UNTOUCHED, for the reason `[1]` inside a fence is left alone: in a pasted config or a
 * snippet of someone's source, that bracket is not a citation.
 */
export function fileRefsToMarkdown(text: string, files: readonly FileCitation[]): string {
  const known = new Map(files.map((file) => [file.id, file]));

  return text
    .split(CODE_SEGMENT_RE)
    .map((chunk, index) =>
      index % 2 === 1
        ? chunk
        : chunk.replace(FILE_REF_RE, (_match, lead: string, refs: string) => {
            // 🔴 DISTINCT DOCUMENTS, NOT DISTINCT EXCERPTS. Three excerpts of one lecture are one
            // citation of one document; naming it three times, or once with "+2", would claim
            // three sources where there is one. `groupFileRuns` makes the same distinction for
            // adjacent markers and this makes it inside a single bracket.
            const ids = refs.split(",").map((ref) => ref.trim().split(":")[0] ?? "");
            const files = [...new Set(ids)].map((id) => known.get(id)).filter((file) => file !== undefined);

            if (files.length === 0) return "";

            const extra = files.length - 1;
            return `${lead}[${files[0]!.title}](#nemesis-file=${files[0]!.id}${extra > 0 ? `.${extra}` : ""})`;
          }),
    )
    .join("");
}

/**
 * A run of adjacent file markers becomes ONE pill.
 *
 * 🔴 THE SAME CLUTTER `groupCitationRuns` EXISTS TO PREVENT, and more likely here: a sentence built
 * from three excerpts of one lecture would otherwise end in three identical chips naming the same
 * document. Runs that resolve to the SAME source collapse to one with no "+n" at all, because
 * "Lecture+2" would be claiming three documents where there is one.
 */
export function groupFileRuns(markdown: string): string {
  return markdown.replace(
    /\[[^\]]+\]\(#nemesis-file=(s\d{1,3})\)(?:\s*\[[^\]]+\]\(#nemesis-file=s\d{1,3}\))+/g,
    (run, firstId: string) => {
      const ids = [...run.matchAll(/#nemesis-file=(s\d{1,3})/g)].map((m) => m[1]);
      const unique = [...new Set(ids)];
      const label = run.match(/^\[([^\]]+)\]/)?.[1] ?? firstId;
      const extra = unique.length - 1;
      return `[${label}](#nemesis-file=${firstId}${extra > 0 ? `.${extra}` : ""})`;
    },
  );
}
