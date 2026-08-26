// Deno unit tests (repo convention) for the Sources-drawer summary cleaner.
// Run: deno test --no-check apps/mobile/src/lib/source-summary.test.ts
//
// 🔴 THE FIRST TWO CASES ARE THE SCREENSHOT (owner 2026-08-21). They are the exact strings the
// drawer drew on device, heading markers and all, and they are the reason this module exists. If a
// later change makes either of them fail, the bug is back on the phone — do not relax them.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanSourceSummary } from "./source-summary.ts";

Deno.test("the ans.org row from the screenshot loses its heading markers", () => {
  assertEquals(
    cleanSourceSummary("# Fusion\n\n## LLNL and Pacific Fusion achieve 3,000-shot milestone"),
    "Fusion · LLNL and Pacific Fusion achieve 3,000-shot milestone",
  );
});

Deno.test("the innovationnewsnetwork.com row from the screenshot loses its heading markers", () => {
  assertEquals(
    cleanSourceSummary("# Fusion Energy News\n\n### UK's MAST Upgrade achieves record fusion triple product"),
    "Fusion Energy News · UK's MAST Upgrade achieves record fusion triple product",
  );
});

// The same two payloads with NO blank line between the headings — a heading ends its block on its
// own, so the fragments must still be separated rather than run into one sentence.
Deno.test("consecutive headings are separated even without a blank line between them", () => {
  assertEquals(
    cleanSourceSummary("# Fusion\n## LLNL and Pacific Fusion achieve 3,000-shot milestone"),
    "Fusion · LLNL and Pacific Fusion achieve 3,000-shot milestone",
  );
});

Deno.test("a heading's closing hash run goes too", () => {
  assertEquals(cleanSourceSummary("## Results ##"), "Results");
  assertEquals(cleanSourceSummary("   ### Indented heading"), "Indented heading");
});

// 🔴 THE TWO THE OWNER NAMED. A heading marker is a `#` run at the start of a line FOLLOWED BY
// WHITESPACE; `#1` fails that test, and `C#` is never at a line start with a space after the hash.
Deno.test("a legitimate #1 and a C# survive untouched", () => {
  assertEquals(cleanSourceSummary("#1 ranked hospital in the state"), "#1 ranked hospital in the state");
  assertEquals(cleanSourceSummary("C# and F# both target the CLR"), "C# and F# both target the CLR");
  assertEquals(cleanSourceSummary("Ranked #1 for C# tutorials"), "Ranked #1 for C# tutorials");
  // A hash run with no space is not a heading either, at any length.
  assertEquals(cleanSourceSummary("##2 in the table"), "##2 in the table");
});

Deno.test("list bullets and numbers are dropped, their text kept and separated", () => {
  assertEquals(cleanSourceSummary("- alpha\n- beta\n- gamma"), "alpha · beta · gamma");
  assertEquals(cleanSourceSummary("* alpha\n+ beta"), "alpha · beta");
  assertEquals(cleanSourceSummary("1. first\n2. second"), "first · second");
  assertEquals(cleanSourceSummary("1) first\n2) second"), "first · second");
});

Deno.test("a bullet marker needs its space, so a negative number and a footnote star survive", () => {
  assertEquals(cleanSourceSummary("-5 degrees overnight"), "-5 degrees overnight");
  assertEquals(cleanSourceSummary("+44 is the UK dialling code"), "+44 is the UK dialling code");
  assertEquals(cleanSourceSummary("e-mail and state-of-the-art stay hyphenated"), "e-mail and state-of-the-art stay hyphenated");
});

Deno.test("emphasis markers go, in matched pairs only", () => {
  assertEquals(cleanSourceSummary("**Bold** and *italic* and ***both***"), "Bold and italic and both");
  assertEquals(cleanSourceSummary("__Bold__ and _italic_"), "Bold and italic");
  assertEquals(cleanSourceSummary("~~struck~~ through"), "struck through");
  // Unmatched markers are left alone rather than half-eaten.
  assertEquals(cleanSourceSummary("2 * 3 = 6"), "2 * 3 = 6");
  assertEquals(cleanSourceSummary("a ** dangling pair"), "a ** dangling pair");
});

Deno.test("underscores inside a word are not emphasis", () => {
  assertEquals(cleanSourceSummary("call snake_case_name from the API"), "call snake_case_name from the API");
  assertEquals(cleanSourceSummary("the file is my_report_final.pdf"), "the file is my_report_final.pdf");
});

Deno.test("link syntax collapses to its words and images go entirely", () => {
  assertEquals(cleanSourceSummary("See [the paper](https://example.edu/a) for detail"), "See the paper for detail");
  assertEquals(cleanSourceSummary("![ANS logo](https://ans.org/logo.png)Fusion news"), "Fusion news");
  assertEquals(cleanSourceSummary("[ref style][1] link"), "ref style link");
  assertEquals(cleanSourceSummary("Read <https://example.edu/a> today"), "Read https://example.edu/a today");
  // A bare citation bracket is not a link and keeps its shape.
  assertEquals(cleanSourceSummary("as reported [1] last week"), "as reported [1] last week");
});

Deno.test("inline code keeps its content without the backticks", () => {
  assertEquals(cleanSourceSummary("run `npm install` first"), "run npm install first");
});

Deno.test("table pipes become fragments and the alignment row is dropped", () => {
  assertEquals(
    cleanSourceSummary("| Country | Reactors |\n| --- | --- |\n| France | 57 |"),
    "Country · Reactors · France · 57",
  );
});

Deno.test("a pipe in ordinary prose is not a table", () => {
  assertEquals(cleanSourceSummary("the conditional P(A|B) is read as A given B"), "the conditional P(A|B) is read as A given B");
});

Deno.test("blockquote markers go, thematic rules and setext underlines vanish", () => {
  assertEquals(cleanSourceSummary("> quoted claim\n> continues"), "quoted claim continues");
  assertEquals(cleanSourceSummary("Heading\n=======\nbody text"), "Heading · body text");
  assertEquals(cleanSourceSummary("before\n\n---\n\nafter"), "before · after");
});

// 🔴 A SOFT WRAP IS NOT A BLOCK BREAK. The drawer shows one line, so newlines have to collapse —
// but a wrapped sentence collapses with a SPACE, or the separator would appear mid-clause.
Deno.test("a soft-wrapped paragraph joins with a space, not a separator", () => {
  assertEquals(
    cleanSourceSummary("The tokamak reached\nrecord confinement time\nlast Tuesday."),
    "The tokamak reached record confinement time last Tuesday.",
  );
});

Deno.test("whitespace, tabs and non-breaking spaces collapse to single spaces", () => {
  assertEquals(cleanSourceSummary("  spaced out\t\ttext  \n\n\n  more  "), "spaced out text · more");
});

// The backend joins whole page chunks with " … " (supabase/functions/nemesis-search/brave.ts).
// That mark says "text was elided" and must survive — it is not markdown.
Deno.test("the backend's own chunk separator is left alone", () => {
  assertEquals(
    cleanSourceSummary("## First chunk … ## second chunk"),
    "First chunk … ## second chunk",
  );
});

Deno.test("backslash escapes are unescaped, LaTeX is not", () => {
  assertEquals(cleanSourceSummary("a literal \\* star and \\# hash"), "a literal * star and # hash");
  assertEquals(cleanSourceSummary("the term \\alpha decay"), "the term \\alpha decay");
});

Deno.test("nothing but syntax yields the empty string, and so do the empty inputs", () => {
  assertEquals(cleanSourceSummary("---\n\n| --- | --- |\n\n###"), "");
  assertEquals(cleanSourceSummary(""), "");
  assertEquals(cleanSourceSummary(null), "");
  assertEquals(cleanSourceSummary(undefined), "");
  assertEquals(cleanSourceSummary("   \n  \n"), "");
});

Deno.test("plain prose is returned unchanged", () => {
  assertEquals(
    cleanSourceSummary("Photosynthesis converts light into chemical energy."),
    "Photosynthesis converts light into chemical energy.",
  );
});
