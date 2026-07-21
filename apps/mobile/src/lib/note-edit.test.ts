// Deno unit tests (repo convention) for the note-edit pure helpers — the
// selection-aware markdown transforms behind the phone note editor's toolbar.
// Run: deno test --no-check apps/mobile/src/lib/note-edit.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cycleHeading, toggleLinePrefix, wrapInline } from "./note-edit.ts";

// --- wrapInline (bold / italic / wikilink) -----------------------------------

Deno.test("wrapInline: empty selection inserts the pair with the caret inside", () => {
  assertEquals(wrapInline({ text: "abc", start: 3, end: 3 }, "**"), { text: "abc****", start: 5, end: 5 });
  assertEquals(wrapInline({ text: "", start: 0, end: 0 }, "[[", "]]"), { text: "[[]]", start: 2, end: 2 });
});

Deno.test("wrapInline: wraps a selection and keeps it selected inside the markers", () => {
  assertEquals(wrapInline({ text: "hello world", start: 0, end: 5 }, "**"), {
    text: "**hello** world",
    start: 2,
    end: 7,
  });
  assertEquals(wrapInline({ text: "see Topic here", start: 4, end: 9 }, "[[", "]]"), {
    text: "see [[Topic]] here",
    start: 6,
    end: 11,
  });
});

Deno.test("wrapInline: re-tapping with the markers inside the selection unwraps", () => {
  assertEquals(wrapInline({ text: "**hi** x", start: 0, end: 6 }, "**"), { text: "hi x", start: 0, end: 2 });
  assertEquals(wrapInline({ text: "a [[Topic]] b", start: 2, end: 11 }, "[[", "]]"), {
    text: "a Topic b",
    start: 2,
    end: 7,
  });
});

Deno.test("wrapInline: re-tapping with the markers around the selection unwraps", () => {
  assertEquals(wrapInline({ text: "**hi** x", start: 2, end: 4 }, "**"), { text: "hi x", start: 0, end: 2 });
});

Deno.test("wrapInline: empty caret sitting inside an empty pair removes it", () => {
  assertEquals(wrapInline({ text: "ab****", start: 4, end: 4 }, "**"), { text: "ab", start: 2, end: 2 });
});

Deno.test("wrapInline: clamps out-of-range selections instead of throwing", () => {
  assertEquals(wrapInline({ text: "ab", start: -3, end: 99 }, "*"), { text: "*ab*", start: 1, end: 3 });
});

// --- toggleLinePrefix (bullet list) ------------------------------------------

Deno.test("toggleLinePrefix: adds the prefix to a bare line and shifts the caret", () => {
  assertEquals(toggleLinePrefix({ text: "alpha", start: 3, end: 3 }, "- "), { text: "- alpha", start: 5, end: 5 });
});

Deno.test("toggleLinePrefix: removes an existing prefix and shifts the caret back", () => {
  assertEquals(toggleLinePrefix({ text: "- alpha", start: 4, end: 4 }, "- "), { text: "alpha", start: 2, end: 2 });
});

Deno.test("toggleLinePrefix: caret inside the prefix clamps to the line start on removal", () => {
  assertEquals(toggleLinePrefix({ text: "- alpha", start: 1, end: 1 }, "- "), { text: "alpha", start: 0, end: 0 });
});

Deno.test("toggleLinePrefix: mixed multi-line selection lists every line", () => {
  assertEquals(toggleLinePrefix({ text: "a\n- b\nc", start: 0, end: 7 }, "- "), {
    text: "- a\n- b\n- c",
    start: 0,
    end: 11,
  });
});

Deno.test("toggleLinePrefix: fully-listed multi-line selection unlists every line", () => {
  assertEquals(toggleLinePrefix({ text: "- a\n- b", start: 0, end: 7 }, "- "), { text: "a\nb", start: 0, end: 3 });
});

Deno.test("toggleLinePrefix: only lines the selection touches change", () => {
  assertEquals(toggleLinePrefix({ text: "a\nb\nc", start: 2, end: 3 }, "- "), { text: "a\n- b\nc", start: 2, end: 5 });
});

// --- cycleHeading ------------------------------------------------------------

Deno.test("cycleHeading: plain line gains '# ' and steps up to '###' then clears", () => {
  assertEquals(cycleHeading({ text: "text", start: 4, end: 4 }), { text: "# text", start: 6, end: 6 });
  assertEquals(cycleHeading({ text: "# text", start: 6, end: 6 }), { text: "## text", start: 7, end: 7 });
  assertEquals(cycleHeading({ text: "## text", start: 7, end: 7 }), { text: "### text", start: 8, end: 8 });
  assertEquals(cycleHeading({ text: "### text", start: 8, end: 8 }), { text: "text", start: 4, end: 4 });
});

Deno.test("cycleHeading: deep headings (####+) clear rather than growing", () => {
  assertEquals(cycleHeading({ text: "#### text", start: 9, end: 9 }), { text: "text", start: 4, end: 4 });
});

Deno.test("cycleHeading: caret inside the hashes clamps to the line start on removal", () => {
  assertEquals(cycleHeading({ text: "### text", start: 1, end: 1 }), { text: "text", start: 0, end: 0 });
});

Deno.test("cycleHeading: multi-line selection applies the first line's next level to all", () => {
  assertEquals(cycleHeading({ text: "a\n# b", start: 0, end: 5 }), { text: "# a\n# b", start: 0, end: 7 });
});

Deno.test("cycleHeading: only the caret's line changes, not its neighbors", () => {
  assertEquals(cycleHeading({ text: "a\nb\nc", start: 2, end: 2 }), { text: "a\n# b\nc", start: 4, end: 4 });
});
