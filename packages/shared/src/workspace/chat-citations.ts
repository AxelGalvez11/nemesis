// The numbered citation markers a grounded answer writes — "[1]", "[2]" — and how they become
// something a renderer can draw as a source chip instead of leaving four characters in the prose.
//
// A model that has been handed search results cites them by NUMBER, because a number is the only
// handle it has: it never sees the favicon, the site name or the pill. The renderer is the half
// that turns that number back into a place. This module is the join between them, and it is a pure
// string transform on purpose — the same idiom the markdown pre-processors use for ==highlight==
// and <u>underline</u>, and for the same reason: the markdown parser is left alone and nothing
// here needs React mounted to be tested.
//
// 🔴 ONE COPY, TWO SURFACES — THIS FILE IS THE MOVE THAT ENDED THE DRIFT (owner 2026-08-21).
// The phone and the web each had their own copy of this: apps/mobile/src/components/canvas/
// citation-markers.ts and apps/web/lib/workspace/chat-citations.ts, holding the SAME two regexes
// and the SAME two functions, ported by hand. Two verifiers independently found the same two bugs
// living in BOTH copies — a run pattern that ate paragraph breaks, and a marker pattern that
// mangled markdown reference links — which is the exact failure mode a hand-port guarantees: fix
// one copy, ship a phone and a web that disagree about what "[1]" means. Both apps now re-export
// from here through thin barrels that keep their old import paths intact.
//   TRIED AND REJECTED: leaving the two copies and adding a test to each. That is what was already
//   in place, and it is how the two copies drifted in the first place — a test only guards the
//   behaviour someone thought to write down in the file they happened to be editing.
//   TRIED AND REJECTED: deleting the phone's `citation-markers.ts` and pointing MessageBody.tsx at
//   `@nemesis/shared` directly. The phone's file argues at length that the marker parsing belongs
//   BESIDE `canvas-sources.ts`, the source resolution it exists to reach; that argument is about
//   where the phone's DOOR is, and it survives intact. Only the logic moved.
//
// 🔴 THE OTHER HALF OF THIS FIX IS THE PROMPT, AND IT HAS SINCE LANDED (owner 2026-08-21,
// correcting the 2026-08-20 note this replaces). Nothing in this module makes the model cite by
// number; only the prompt can. When this was first written the phone's `chat-thread.ts` asked for
// URLs in two places, so almost no answer carried a marker and this module did nothing. Both places
// now ask for the number and forbid the address:
//   • `CHAT_SYSTEM_PROMPT` — "cite them by their bracketed number, like [1]. Never write a raw URL
//     in the prose."
//   • `formatWebSearchContext`, the per-turn evidence block — "end that sentence with that result's
//     number in square brackets, like [1] … and never write the raw URL in the prose." That
//     sentence is the web's, character for character; `apps/web/lib/workspace/chat-web-search.ts`
//     holds the original.
// So markers are now the normal shape of a grounded answer on both surfaces, and this module is on
// the hot path rather than idle. What the note used to say is recorded above because it explains
// why this module was written; it is not left standing as a live warning, because anyone reading
// "the prompt asks for URLs" today would go and change a prompt that is already correct.
//
// 🔴 THE RENDERER STILL DEMOTES A BARE URL, AND THAT IS NOT LEFTOVER (owner 2026-08-20, still
// true). A prompt is a request, not a guarantee: a model will occasionally print an address
// mid-paragraph whatever it was told — from memory, from a snippet it is quoting, or simply by
// ignoring the instruction. `MessageBody.tsx` therefore turns a bare URL into a named chip on
// sight, independently of anything here. The screen has to cope with the answer it is given.

/** `[12]` but not `[1](…)`, which is already a markdown link. */
const CITE_MARKER_RE = /\[(\d{1,2})\](?!\()/g;

/**
 * Fenced blocks and inline code, captured so `split()` keeps them as odd-index chunks that pass
 * through untouched. An answer explaining array indexing writes `a[1]` inside backticks and that is
 * code, not a citation.
 */
const CODE_SEGMENT_RE = /(```[\s\S]*?```|`[^`\n]*`)/g;

/** The href a rewritten marker carries. Never a real address — the renderer resolves it. */
const CITE_HREF_PREFIX = "#nemesis-cite=";

/**
 * A `[n]` marker, plus any SAME-LINE space after it, sitting at the very end of the text before it.
 * Used to walk backwards over a run like `[1][2][3]` — see `closesReferenceLink`. No `g` flag, so
 * `exec` carries no `lastIndex` between the calls in that loop.
 */
const ADJACENT_MARKER_TAIL_RE = /\[\d{1,2}\][^\S\r\n]*$/;

/**
 * True when the `[n]` at `at` is the LABEL half of a markdown reference link — `[the trial][1]` —
 * rather than a citation marker.
 *
 * 🔴 REPRODUCED AGAINST THE PHONE'S REAL PARSER BEFORE BEING FIXED (owner 2026-08-21). Parsing
 *
 *     The trial was published in [the Lancet paper][1] last spring.
 *     …
 *     [1]: https://www.thelancet.com/article/S0140
 *
 * through `MarkdownIt({ typographer: false, linkify: true, html: false })` — the phone's exact
 * config — gives one link to thelancet.com. Running the same text through `citationsToMarkdown`
 * first and THEN parsing gave `[the Lancet paper]` as literal bracketed text followed by a bogus
 * chip, and dragged the definition line up into the body as visible prose. Both link hrefs were
 * gone. The link the model wrote was destroyed and a citation that was never made appeared in its
 * place, which is the worse half.
 *
 * 🔴 BUT `[1][2]` IS STILL A CITATION RUN, AND THAT IS WHY THIS WALKS BACKWARDS. `[1][2]` is
 * syntactically indistinguishable from a reference link whose text is "1" and whose label is "2" —
 * and it is ALSO the single most common way a model stacks two citations. The tie is broken by
 * what sits before the run: if walking back over adjacent `[n]` markers lands on another `]`, the
 * run is hanging off a bracketed phrase and the whole thing is a reference link; if it lands on
 * prose or the start of the answer, they are citations.
 *   TRIED AND REJECTED: a plain lookbehind, `(?<!\])`. It reads better and it is wrong — it kills
 *   the second marker of every `[1][2]`, which the grouping tests on both surfaces demand. It is
 *   also the one construct the phone's JS engine has historically been shakiest about.
 *   TRIED AND REJECTED: consuming the preceding character in the pattern, `(^|[^\]])\[(\d{1,2})\]`.
 *   Same breakage from the other direction: the consumed `]` of `[1]` makes `[2]` unmatchable, so
 *   `[1][2]` converts only its first marker.
 */
function closesReferenceLink(text: string, at: number): boolean {
  if (text[at - 1] !== "]") return false;
  let cursor = at;
  for (;;) {
    const previousMarker = ADJACENT_MARKER_TAIL_RE.exec(text.slice(0, cursor));
    if (previousMarker === null) return text[cursor - 1] === "]";
    cursor = previousMarker.index;
  }
}

/**
 * True when the `[n]` at `at` opens a markdown reference DEFINITION line — `[1]: https://…`.
 *
 * 🔴 THE OTHER HALF OF THE SAME REPRODUCTION (owner 2026-08-21). Rewriting the definition line into
 * `[1](#nemesis-cite=1): https://…` stops it being a definition at all, so the parser prints it as
 * a paragraph: the reader gets a chip, a colon and a naked URL where there should have been
 * nothing visible. Leading spaces are skipped because markdown allows a definition to be indented.
 */
function opensReferenceDefinition(text: string, at: number, length: number): boolean {
  if (text[at + length] !== ":") return false;
  let cursor = at - 1;
  while (cursor >= 0 && (text[cursor] === " " || text[cursor] === "\t")) cursor -= 1;
  return cursor < 0 || text[cursor] === "\n";
}

/**
 * Rewrite in-range citation markers into links the renderer can catch.
 *
 * `sourceCount` is the number of results the model was actually given. A marker outside
 * 1..sourceCount is left as plain text on purpose: models invent numbers, and a literal "[9]" in
 * the prose is a smaller wrong than a chip that names a publication which was never consulted.
 *
 * 🔴 THE TWO GUARDS ARE OFFSET-BASED, AND THE OFFSETS ARE INTO THE WHOLE ANSWER (owner 2026-08-21).
 * `closesReferenceLink` and `opensReferenceDefinition` both need to see the characters AROUND a
 * marker, and the text has already been cut into chunks at every code span. Handing them a chunk
 * would make the first character of chunk three look like the start of a line, so the running
 * `consumed` counter converts each chunk-local offset back into an index into `text`.
 */
export function citationsToMarkdown(text: string, sourceCount: number): string {
  if (sourceCount <= 0) return text;
  let consumed = 0;
  return text
    .split(CODE_SEGMENT_RE)
    .map((chunk, index) => {
      const chunkStart = consumed;
      consumed += chunk.length;
      if (index % 2 === 1) return chunk;
      return chunk.replace(CITE_MARKER_RE, (match: string, digits: string, offset: number) => {
        const at = chunkStart + offset;
        if (closesReferenceLink(text, at)) return match;
        if (opensReferenceDefinition(text, at, match.length)) return match;
        const n = Number.parseInt(digits, 10);
        return n >= 1 && n <= sourceCount ? `[${n}](${CITE_HREF_PREFIX}${n})` : match;
      });
    })
    .join("");
}

/**
 * What should happen to one `[n]` marker when text is being RENUMBERED rather than rendered.
 *
 * A number renumbers the marker to that number. `"keep"` leaves it exactly as written. `"drop"`
 * deletes it — see `remapCitationMarkers` for when each is the honest answer.
 */
export type CitationRemap = number | "drop" | "keep";

/**
 * The same marker as `CITE_MARKER_RE`, with any SAME-LINE whitespace immediately BEFORE it captured
 * alongside. That leading run only matters for `"drop"`: deleting the marker out of
 * `…landed in March [2].` without it leaves `…landed in March .`, a space before a full stop that
 * the model did not write. `[^\S\r\n]` rather than `\s` for the reason `groupCitationRuns` gives —
 * a newline is not "the same line", and eating one would weld two paragraphs together.
 */
const LEAD_AND_MARKER_RE = /([^\S\r\n]*)\[(\d{1,2})\](?!\()/g;

/** The largest marker `CITE_MARKER_RE` can ever match again — `\d{1,2}`. */
const MAX_MARKER = 99;

/**
 * Rewrite the NUMBERS in a text's citation markers, leaving everything else about the text alone.
 *
 * 🔴 WHY THIS EXISTS: A MARKER'S NUMBER IS ONLY MEANINGFUL BESIDE THE LIST IT WAS WRITTEN AGAINST
 * (owner 2026-08-21). Every other function here assumes the two travel together — an answer is
 * rendered in the same breath as the search results it was given, so `[2]` means "the second result
 * of this turn" and `citationsToMarkdown` can hand the renderer the raw number. A STORED document
 * breaks that pairing: `apps/mobile/src/api/canvases.ts` appends each turn's blocks and each turn's
 * sources to lists that already hold earlier turns, so turn two's `[1]` sits in a document whose
 * first source belongs to turn one. Reopened, it resolved to the wrong publication — a chip
 * confidently naming a page the sentence never cited. The fix is to renumber the markers AT SAVE
 * TIME, into indices that mean something in the stored document alone; this is the transform that
 * does it, and it lives here because the marker grammar — the two-digit shape, the `(?!\()` link
 * guard, the code-fence split and the two reference-link guards — must have exactly one definition.
 *   TRIED AND REJECTED: a fourth private copy of the regex inside `canvases.ts`. That is precisely
 *   the hand-port this module was created to end; the two reference-link guards below are not
 *   reachable from outside this file and re-deriving them is how the phone would get a renumberer
 *   that mangles `[the trial][1]` all over again.
 *
 * `resolve` is called once per marker with the number as written, and answers with the number to
 * write instead, `"keep"`, or `"drop"`:
 *   * a NUMBER renumbers it. Out-of-vocabulary numbers are refused rather than written: a marker
 *     past `MAX_MARKER` could not be read back by `CITE_MARKER_RE`, so it would sit in the prose as
 *     literal characters forever. It is dropped instead, which loses a mark rather than printing
 *     one nobody can resolve.
 *   * `"keep"` is for a marker this caller has no opinion about. A number the model invented, past
 *     the end of the list it was given, is the case that matters: it never pointed at anything, and
 *     rewriting or deleting the model's own text on a guess is a bigger intervention than leaving
 *     four characters where they were.
 *   * `"drop"` deletes the marker and the same-line space before it, for the marker whose source
 *     has NO home in the destination list at all. Leaving that one in place is the original bug in
 *     miniature: the number would land on whatever else occupies that slot.
 *
 * 🔴 THE TWO REFERENCE GUARDS RUN HERE TOO, AND SKIPPING THEM WOULD BE WORSE THAN AT RENDER TIME.
 * `[the trial][1]` and a `[1]: https://…` definition line are markdown link syntax, not citations —
 * `citationsToMarkdown`'s own reproduction notes what rewriting them does to the parse. Renumbering
 * them would break the SAME link, but in the stored document, where nothing later can undo it. Both
 * guards need offsets into the whole text rather than into a chunk, so the `consumed` counter is
 * carried exactly as it is above.
 */
export function remapCitationMarkers(text: string, resolve: (marker: number) => CitationRemap): string {
  let consumed = 0;
  return text
    .split(CODE_SEGMENT_RE)
    .map((chunk, index) => {
      const chunkStart = consumed;
      consumed += chunk.length;
      if (index % 2 === 1) return chunk;
      return chunk.replace(LEAD_AND_MARKER_RE, (match: string, lead: string, digits: string, offset: number) => {
        // `offset` points at the captured whitespace; the marker itself starts after it, and both
        // guards below are asking about the `[`.
        const at = chunkStart + offset + lead.length;
        if (closesReferenceLink(text, at)) return match;
        if (opensReferenceDefinition(text, at, digits.length + 2)) return match;
        const home = resolve(Number.parseInt(digits, 10));
        if (home === "keep") return match;
        if (home === "drop") return "";
        const writable = Number.isInteger(home) && home >= 1 && home <= MAX_MARKER;
        return writable ? `${lead}[${home}]` : "";
      });
    })
    .join("");
}

/**
 * A run of adjacent markers becomes ONE chip that says how many more there were.
 *
 * 🔴 MEASURED OFF THE REFERENCE ON THE WEB, 2026-08-20, AND THE PHONE INHERITS IT. ChatGPT renders
 * a sentence citing two sources as a single pill reading "Reuters+1" — 76px against 62px for a lone
 * one. Ours drew one pill per marker, so a well-cited sentence ended in a row of dots and a broad
 * answer ended in ten of them, which is the clutter the owner reported as three indistinguishable
 * "Cnbc" pills.
 *
 * 🔴 ADJACENT ONLY, AND ONLY SAME-LINE WHITESPACE COUNTS AS ADJACENT (owner 2026-08-21, correcting
 * 2026-08-20). `[1][2]` and `[1] [2]` are one citation event; `[1] and later [2]` is two, and
 * collapsing those would attach the second source to a sentence that never cited it. The separator
 * used to be `\s*`, and `\s` matches newlines — so an answer that ended a paragraph on a marker and
 * opened the next one on another:
 *
 *     Stripe acquired OpenRouter this week.[1]\n\n[2] The second point is its own paragraph.
 *
 * came out of here as ONE line: `…this week.[1](#nemesis-cite=1.1) The second point…`. Two
 * paragraphs were welded into one, the blank line was deleted and source 2's marker was destroyed —
 * a chip now claiming to stand for a page that the deleted sentence had cited, not this one. Run
 * that exact string through `groupCitationRuns(citationsToMarkdown(…, 3))` to see it; the
 * regression test on both surfaces is that string with a real paragraph break in it.
 *   TRIED AND REJECTED: `[ \t]*`. Correct for the two characters a model actually types, but it
 *   walks straight past a form feed or a no-break space, and "same line" is the rule we mean.
 *   `[^\S\r\n]` says exactly that: whitespace, but not a line ending.
 *
 * 🔴 THE EXTRA COUNT RIDES IN THE HREF AS `n.extra`, so the renderer needs no second channel, and
 * anything that only parses the leading integer still resolves the first source correctly rather
 * than breaking. `Number.parseInt` stops at the dot, which is exactly that fallback.
 *
 * 🔴 SAFE ONLY BECAUSE THE CHIP IS NAMED. Collapsing a run into a chip that could not say "+1"
 * would silently drop the other sources from the prose — the reader would see one mark where two
 * pages were cited and have no way to know. The web keeps its bare-dot chat treatment ungrouped for
 * precisely that reason; the phone only ever draws the named shape, so it always can say so.
 *
 * 🔴 AND "NAMED" IS A PROMISE THE CALLER HAS TO KEEP, WHICH IS WHAT `isResolvable` IS FOR (owner
 * 2026-08-21). The collapse is lossy in one direction the paragraph above did not cover: the href
 * carries the FIRST number and a COUNT, never the other numbers. That is fine while the chip
 * renders as a name plus "+1", and it is text deletion the moment it does not. A source can exist
 * at an index and have no address at all — an uploaded file is the documented, expected case; see
 * the `sources` comment in the phone's `CanvasDocument.tsx` — and a renderer with nothing openable
 * to name has to fall back to the bare numbers. It cannot: `[1][2]` collapsed to `1.1` has already
 * lost the "2". Reproduced under node against the phone's real markdown-it config before this
 * parameter existed: "Revenue showed a 40% drop [1][2]." rendered as "Revenue showed a 40% drop 1."
 * — the second citation gone from the prose entirely.
 *   So a run is collapsed ONLY when every marker in it resolves to something the caller can name.
 * The default says yes to everything, which is exactly today's behaviour for any caller that does
 * not care (the web passes nothing); the phone passes the SAME test its renderer uses, so a run it
 * cannot draw as one named chip stays as separate markers and each one falls back to its own `[n]`.
 *   REJECTED: collapsing the longest resolvable prefix of a mixed run — `[1][2][3]` with only 3
 * unresolvable would give one "+1" chip and a literal "[3]". It draws marginally fewer marks and it
 * puts a second, subtler rule in a function whose whole value is that "adjacent" means one thing.
 * All-or-nothing per run costs at most one extra pill on a rare answer.
 *   REJECTED: widening the href to carry every number — `#nemesis-cite=1.2.3`. It is the fix that
 * needs no caller cooperation, and it changes the string this function emits, which both surfaces'
 * grouping tests assert character for character. A renderer that refuses to collapse what it cannot
 * name is also the more honest shape: the "+1" is only ever printed when the "1" can be named.
 *
 * @param isResolvable Given a 1-based source index, true when the caller can render that source as
 * a named chip. Runs containing any index it rejects are left alone, marker by marker.
 */
export function groupCitationRuns(
  markdown: string,
  isResolvable: (index: number) => boolean = () => true,
): string {
  return markdown.replace(
    /\[(\d{1,2})\]\(#nemesis-cite=\d{1,2}\)(?:[^\S\r\n]*\[\d{1,2}\]\(#nemesis-cite=\d{1,2}\))+/g,
    (run: string, first: string) => {
      // Every href in the run is a freshly written `#nemesis-cite=<digits>` — `citationsToMarkdown`
      // is the only thing that emits them and it never writes the `.extra` half — so the digits
      // after the prefix are the marker numbers, in the order the model wrote them.
      const cited = run.match(/#nemesis-cite=\d{1,2}/g) ?? [];
      const indices = cited.map((href) => Number.parseInt(href.slice(CITE_HREF_PREFIX.length), 10));
      if (!indices.every(isResolvable)) return run;
      return `[${first}](${CITE_HREF_PREFIX}${first}.${indices.length - 1})`;
    },
  );
}

/** What a citation href points at: a 1-based index into the answer's sources, plus how many more
 *  sources this one chip stands for. `null` for any other href — an ordinary link. */
export interface CitationTarget {
  /** 1-based position in the `sources` array the answer was rendered with. */
  index: number;
  /** How many further sources were collapsed into this chip. 0 for a lone marker. */
  extra: number;
}

/** Parse `#nemesis-cite=3.2` back into `{ index: 3, extra: 2 }`. Anything else is not a citation. */
export function citationTarget(href: string): CitationTarget | null {
  if (!href.startsWith(CITE_HREF_PREFIX)) return null;
  const [head, tail] = href.slice(CITE_HREF_PREFIX.length).split(".");
  const index = Number.parseInt(head ?? "", 10);
  if (!Number.isFinite(index) || index < 1) return null;
  return { index, extra: Number.parseInt(tail ?? "0", 10) || 0 };
}

/**
 * True when a markdown link is one the MODEL TYPED AS AN ADDRESS rather than wrote words for.
 *
 * 🔴 THE TEST IS "IS THE VISIBLE TEXT THE ADDRESS ITSELF", AND IT IS THE WHOLE JUSTIFICATION FOR
 * REPLACING THAT TEXT (owner 2026-08-20). `MessageBody.tsx` protects an authored link's own words —
 * "according to [the 2019 trial](…)" must not become "according to Nature". An autolinked URL has
 * no words to protect: its text IS its href, so a chip reading "Deepseek" loses nothing and spares
 * the reader forty characters of address mid-sentence. The two cases are told apart here and
 * nowhere else.
 *
 * 🔴 MEASURED AGAINST THE REAL PARSER, NOT ASSUMED (owner 2026-08-20). The phone builds its
 * markdown-it with `linkify: true`, so the screenshot's
 * "(https://api-docs.deepseek.com/updates, https://releasebot.io/updates/deepseek)" arrives as two
 * link nodes whose visible text is byte-identical to their href — checked by parsing that exact
 * sentence through `stringToTokens`/`cleanupTokens`/`tokensToAST` and printing every link node. The
 * same run confirmed the other two cases stay distinguishable: `[1](#nemesis-cite=1.2)` keeps its
 * href intact through the parser, and `[the trial](https://nature.com/x)` keeps its words. That is
 * the evidence this three-way branch rests on.
 *
 * Only the phone calls this today — the web chat draws a bare dot and has no chip to put a site
 * name in — but it belongs with the rest of the citation vocabulary, not stranded on one surface.
 *
 * Compared loosely because the parser normalises as it goes: `linkify` gives `www.bbc.co.uk` the
 * href `http://www.bbc.co.uk` while the text stays as typed, and a trailing slash appears and
 * disappears at both ends. Scheme and trailing slashes are therefore stripped from both sides
 * before comparing; the rest must match exactly, so `[the docs](https://…)` is never mistaken for
 * an address the model typed.
 */
export function isBareUrlLink(href: string, text: string): boolean {
  const bare = (value: string) =>
    value
      .trim()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  const shown = bare(text);
  return shown.length > 0 && shown === bare(href);
}
