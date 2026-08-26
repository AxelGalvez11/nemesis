// Turning a search result's `description` into one line a human can read under a source row.
//
// 🔴 WHY THIS EXISTS: THE SEARCH BACKEND RETURNS PAGE MARKDOWN, AND THE DRAWER WAS PRINTING IT
// RAW (owner 2026-08-21, from a screenshot taken on device). Under two source titles the Sources
// drawer read, literally:
//
//     ans.org / Fusion -- ANS / Nuclear Newswire
//        # Fusion
//        ## LLNL and Pacific Fusion achieve 3,000-sho...
//     innovationnewsnetwork.com / Fusion Energy
//        # Fusion Energy News
//        ### UK's MAST Upgrade achieves record fusi...
//
// Those `#` runs are ATX heading markers off the scraped page. Trace: `supabase/functions/
// nemesis-search/brave.ts` calls Brave's `llm/context` endpoint, which — as that file's own header
// says — returns "pre-extracted chunks of each page (text, tables, code, structured data)" rather
// than a one-line SERP snippet. `braveContextToWeb` joins those chunks with ` … ` into
// `description`, `ChatSource.description` carries it to the phone, and `SourcesSheet.tsx` handed it
// to a plain <Text>. Nothing between the page and the pixel ever removed the syntax.
//
// 🔴 THE WEB DOES NOT ALREADY SOLVE THIS AND MUST NOT BE COPIED (checked 2026-08-21). Two web
// surfaces were read before a line of this was written:
//   * `components/workspace/learn/canvas-source-cards.tsx` DODGES the problem — its card shows the
//     favicon, the publisher and the TITLE, and never renders `description` at all. There is no
//     cleaner there to port.
//   * `components/workspace/sessions/session-right-rail.tsx:42` HAS THE SAME BUG — it renders
//     `{source.description}` straight into a `line-clamp-3` span, off the same Brave payload.
//   * `lib/workspace/chat-web-search.ts` only filters and prompt-formats; it never touches the text.
// A repo-wide search for a markdown stripper found exactly one, `lib/notebooks/office-text.ts`'s
// `firstContentLine`, and it is a .docx/.pptx title heuristic over markdown THIS APP generated —
// not a cleaner for third-party page text. So there was nothing to port; this is the first one.
// The web's identical defect is deliberately NOT fixed here — it is another lane's file.
//
// 🔴 WHAT "CLEAN" MEANS HERE, AND WHERE THE LINE IS. The rule throughout is CommonMark's own:
// a marker only counts as a marker where the spec says it is one. That is what keeps a legitimate
// "#1 ranked" and a "C# tutorial" intact:
//   * an ATX heading needs its `#` run at the START of a line and followed by whitespace or the
//     line end, so `#1 ranked` is a paragraph (CommonMark's own worked example is "#5 bolt") and
//     `C#` — mid-line, and never followed by a space-after-hash — is never even looked at;
//   * a bullet needs `-`/`*`/`+` plus a space, so `-5 degrees` and `*` used as a footnote mark
//     survive;
//   * emphasis is only removed as a MATCHED PAIR wrapping non-space text, so a lone `*` or a
//     dangling `**` is left where it is rather than half-eaten;
//   * `_` emphasis additionally must not be word-flanked, so `snake_case_name` is untouched —
//     again CommonMark's rule, not an invention.
//
// TRIED AND REJECTED: a blunt `replace(/[#*_`>|-]/g, "")`. It is one line and it destroys "C#",
// "#1", "e-mail", "5*3", "P(A|B)" and every hyphenated compound in the corpus. The whole reason
// this is a module with a test is that the cheap version is wrong in a way nobody notices until a
// student reads a mangled word.
//
// TRIED AND REJECTED: dropping heading lines outright. It reads beautifully on the screenshot —
// "# Fusion" and "# Fusion Energy News" are section furniture — but nothing in the payload
// distinguishes a nav heading from the article's own H1, so on the next page the rule would delete
// the headline and keep the boilerplate. Deleting a reader's evidence on a guess is worse than
// showing one extra phrase.
//
// TRIED AND REJECTED: stripping HTML tags too. `llm/context` returns extracted text, the screenshot
// shows markdown and not tags, and a tag stripper is the regex that eats `a < b`. If tags ever turn
// up in this field, add them here with a fixture — do not widen the emphasis regexes to cover them.
//
// 🔴 BLOCK BOUNDARIES BECOME A VISIBLE SEPARATOR, NOT A SPACE. `# Fusion` and `## LLNL and Pacific
// Fusion achieve 3,000-shot milestone` are two blocks. Collapsing them with a space produces
// "Fusion LLNL and Pacific Fusion achieve…" — a run-on sentence that reads as one broken clause,
// which is a different defect rather than a fix. They are joined with ` · ` so the reader can see
// two fragments. A SOFT wrap inside one paragraph still joins with a space, because that is what a
// soft wrap means. The backend already uses ` … ` between whole page chunks and that survives
// untouched: the two marks say different things, "separate fragment" versus "text was elided".

/** What blocks are glued with. See the header — it is a claim about the text, so it is one place. */
const BLOCK_JOIN = " · ";

/** A line that is only a thematic break or a setext underline. Carries no words; dropped. */
const RULE_LINE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,}|={2,})[ \t]*$/;

/** `|---|:--:|` — a table's alignment row. All punctuation, no content. */
const TABLE_DELIMITER = /^ {0,3}\|?[ \t:|-]*-[ \t:|-]*\|[ \t:|-]*$/;

/** A table row: pipe-delimited, so its `|` are structure rather than the "or" in `P(A|B)`. */
const TABLE_ROW = /^ {0,3}\|.*\|[ \t]*$|^ {0,3}\|/;

/** ATX heading. The trailing `\s|$` is the whole reason `#1 ranked` is not a heading. */
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+|$)/;
/** `## Heading ##` — the optional closing run. */
const HEADING_CLOSE = /[ \t]+#+[ \t]*$/;

/** One or more `>` quote markers at the head of a line. */
const QUOTE = /^ {0,3}(?:>[ \t]?)+/;

/** `-`/`*`/`+` plus at least one space. The space is what spares `-5 degrees`. */
const BULLET = /^ {0,3}[-*+][ \t]+/;

/**
 * `1.` / `1)` plus at least one space.
 *
 * 🔴 TWO DIGITS, NOT COMMONMARK'S NINE, AND THE NARROWING IS DELIBERATE (owner 2026-08-21).
 * CommonMark permits an ordered marker of up to nine digits, and matching that faithfully made this
 * module DELETE EVIDENCE: "1996. The first tokamak reached breakeven." came out as "The first
 * tokamak reached breakeven." — the year silently gone from a summary whose whole job is to tell
 * the learner what the page says. A sentence opening with a year, a page number or a figure count
 * is ordinary prose in scraped article text and is far commoner there than a nine-digit list.
 * So the spec loses to the data: a list marker here is one or two digits, and anything longer is
 * treated as prose and kept.
 *   TRIED AND REJECTED: keeping `\d{1,9}` and excluding the 1000–2999 range as "looks like a year".
 *   It rescues 1996 and still eats "1500. Retail units shipped", which is the same bug with a
 *   smaller blast radius rather than a fix.
 *   THE COST, STATED: a genuine list numbered past 99 keeps its marker. A stray "100." in front of
 *   one summary is a blemish; a deleted number is a wrong fact, and this module prefers the
 *   blemish — the same trade `citation-markers.ts` makes when it leaves an out-of-range marker
 *   alone rather than resolving it to the wrong source.
 */
const ORDERED = /^ {0,3}\d{1,2}[.)][ \t]+/;

/**
 * What kind of block a line belongs to. The join decision needs it because "starts a new fragment"
 * is not a property of the line alone: the second line of a two-line blockquote continues the first
 * one, while the second bullet of a list is a fragment of its own.
 */
type LineKind = "plain" | "heading" | "quote" | "list" | "table";

interface LineRead {
  /** The line with its block marker removed. Empty means the line contributed nothing. */
  text: string;
  kind: LineKind;
  /** True when nothing may continue on the same line after it (headings, table rows). */
  closesBlock: boolean;
}

/** Strip one line's BLOCK marker and say how it joins to its neighbours. */
function readLine(raw: string): LineRead | null {
  const line = raw.replace(/[ \t]+$/, "");
  if (line.trim() === "") return null;
  if (RULE_LINE.test(line)) return null;
  if (TABLE_DELIMITER.test(line)) return null;

  if (TABLE_ROW.test(line)) {
    // Cells become their own fragments. Dropping the outer pipes first means a one-column row does
    // not arrive as an empty leading cell.
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell !== "");
    if (cells.length === 0) return null;
    return { text: cells.join(BLOCK_JOIN), kind: "table", closesBlock: true };
  }

  const heading = HEADING.exec(line);
  if (heading) {
    const text = line.slice(heading[0].length).replace(HEADING_CLOSE, "").trim();
    // A heading with no words is furniture; it still forces the break around it.
    return { text, kind: "heading", closesBlock: true };
  }

  const quoted = line.replace(QUOTE, "");
  if (quoted !== line) {
    const text = quoted.trim();
    return text === "" ? null : { text, kind: "quote", closesBlock: false };
  }

  const listMarker = BULLET.exec(line) ?? ORDERED.exec(line);
  if (listMarker) {
    const text = line.slice(listMarker[0].length).trim();
    return text === "" ? null : { text, kind: "list", closesBlock: false };
  }

  return { text: line.trim(), kind: "plain", closesBlock: false };
}

/**
 * Remove INLINE markdown from one block's text.
 *
 * Runs per block, never across the joined string: a CommonMark inline span cannot cross a block
 * boundary, so a stray `*` ending one heading must not be allowed to pair with one opening the next
 * paragraph and swallow everything between them.
 */
function stripInline(text: string): string {
  return (
    text
      // Images first — an image is a link with a `!`, so the link rule would otherwise leave the
      // `!` behind. A picture's alt text is not prose; the whole construct goes.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      // `[text](href)` → `text`. Bare `[1]` citation brackets have no `(…)` and are left alone.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // `[text][ref]` → `text`.
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
      // `<https://…>` → the address, which is at least readable.
      .replace(/<((?:https?|mailto):[^>\s]+)>/gi, "$1")
      // Inline code keeps its content; only the fence goes.
      .replace(/`+([^`]+?)`+/g, "$1")
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
      // Matched `***`/`**`/`*` pairs around non-space text. Longest first so `***x***` is one hit.
      .replace(/(\*\*\*|\*\*|\*)(?=\S)([\s\S]*?\S)\1/g, "$2")
      // Same for `_`, plus CommonMark's no-intraword rule — this is what saves `snake_case_name`.
      .replace(/(^|[^\w\\])(___|__|_)(?=\S)([\s\S]*?\S)\2(?![\w])/g, "$1$3")
      // Backslash escapes, restricted to the characters markdown actually lets you escape, so a
      // LaTeX `\alpha` keeps its backslash.
      .replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, "$1")
  );
}

/**
 * One readable line from a search result's markdown `description`.
 *
 * Pure and dependency-free (repo convention: Deno-testable, no React, no platform). Returns "" when
 * the input was nothing but syntax — the caller already renders nothing for an empty summary, which
 * is the right answer for a source whose snippet was a horizontal rule and a table border.
 */
export function cleanSourceSummary(description: string | null | undefined): string {
  if (!description) return "";

  const blocks: string[] = [];
  let current: string[] = [];
  let previous: LineKind | null = null;
  let startNext = true;

  const flush = () => {
    if (current.length === 0) return;
    const inlineClean = stripInline(current.join(" ")).trim();
    if (inlineClean !== "") blocks.push(inlineClean);
    current = [];
  };

  for (const raw of description.split(/\r\n|\r|\n/)) {
    const read = readLine(raw);
    if (read === null) {
      // A blank line, a rule, or a table divider — whatever follows starts fresh.
      flush();
      previous = null;
      startNext = true;
      continue;
    }
    // A heading, a table row and each list item are a fragment of their own. A blockquote is NOT:
    // its second line continues its first, so it opens a block only where the quote itself starts.
    // A plain line never opens one — that is what makes a soft wrap join with a space.
    const opens =
      read.kind === "heading" ||
      read.kind === "table" ||
      read.kind === "list" ||
      (read.kind === "quote" && previous !== "quote");
    if (opens || startNext) flush();
    if (read.text !== "") current.push(read.text);
    previous = read.kind;
    startNext = read.closesBlock;
  }
  flush();

  return (
    blocks
      .join(BLOCK_JOIN)
      // NBSP is a real character off a scraped page and reads as a stuck-together word gap.
      .replace(/[\s ]+/g, " ")
      // A block that cleaned down to nothing can leave two separators touching.
      .replace(/(?:·\s*){2,}/g, "· ")
      .replace(/^\s*·\s*/, "")
      .replace(/\s*·\s*$/, "")
      .trim()
  );
}
