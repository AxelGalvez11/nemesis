// Deno unit tests (repo convention) for the note screen's tab/history math.
// Run: deno test --no-check apps/mobile/src/lib/note-tabs.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  arriveAt,
  closeTab,
  EMPTY_NOTE_NAV,
  openTabIds,
  plainTextOf,
  previewOf,
  selectTab,
  type NoteNavState,
} from "./note-tabs.ts";

const nav = (stack: string[], index: number, pendingIndex: number | null = null): NoteNavState => ({
  index,
  pendingIndex,
  stack,
});

Deno.test("arriveAt pushes on fresh navigation and drops the forward tail", () => {
  let state = arriveAt(EMPTY_NOTE_NAV, "a");
  state = arriveAt(state, "b");
  state = arriveAt(state, "c");
  assertEquals(state, nav(["a", "b", "c"], 2));
  // Step back to b (cursor move), then open d fresh: c's tail is gone.
  state = arriveAt({ ...state, pendingIndex: 1 }, "b");
  assertEquals(state, nav(["a", "b", "c"], 1));
  state = arriveAt(state, "d");
  assertEquals(state, nav(["a", "b", "d"], 2));
});

Deno.test("arriveAt treats a matching pendingIndex as a cursor move, not a push", () => {
  const state = arriveAt(nav(["a", "b", "c"], 2, 0), "a");
  assertEquals(state, nav(["a", "b", "c"], 0));
});

Deno.test("arriveAt at the current note is a no-op (same object back)", () => {
  const state = nav(["a", "b"], 1);
  assertEquals(arriveAt(state, "b") === state, true);
});

Deno.test("openTabIds dedups, most recently visited first", () => {
  assertEquals(openTabIds(["a", "b", "a", "c"]), ["c", "a", "b"]);
  assertEquals(openTabIds([]), []);
});

Deno.test("selectTab aims the cursor at the latest visit of an open note", () => {
  const state = nav(["a", "b", "a", "c"], 3);
  assertEquals(selectTab(state, "a").pendingIndex, 2);
  // Unknown id and the current note leave the state alone.
  assertEquals(selectTab(state, "zz") === state, true);
  assertEquals(selectTab(state, "c") === state, true);
});

Deno.test("closeTab on a background tab keeps the current note under the cursor", () => {
  const { nav: next, nextId } = closeTab(nav(["a", "b", "a", "c"], 3), "a");
  assertEquals(next, nav(["b", "c"], 1));
  assertEquals(nextId, null);
});

Deno.test("closeTab on the current tab lands on the nearest earlier survivor", () => {
  const { nav: next, nextId } = closeTab(nav(["a", "b", "c"], 2), "c");
  assertEquals(next, nav(["a", "b"], 1));
  assertEquals(nextId, "b");
});

Deno.test("closeTab on the current tab falls forward when nothing survives behind it", () => {
  // Cursor sits on b's early visit; every earlier entry is also b.
  const { nav: next, nextId } = closeTab(nav(["b", "b", "c"], 1), "b");
  assertEquals(next, nav(["c"], 0));
  assertEquals(nextId, "c");
});

Deno.test("closeTab of the only open note empties the stack", () => {
  const { nav: next, nextId } = closeTab(nav(["a", "a"], 1), "a");
  assertEquals(next, EMPTY_NOTE_NAV);
  assertEquals(nextId, null);
});

Deno.test("closeTab with an id that was never opened changes nothing", () => {
  const state = nav(["a", "b"], 1);
  const { nav: next, nextId } = closeTab(state, "zz");
  assertEquals(next === state, true);
  assertEquals(nextId, null);
});

Deno.test("previewOf strips markdown noise into one prose run", () => {
  const content = [
    "# Beta blockers",
    "",
    "**Propranolol** is _non-selective_; see [[Metoprolol|the selective one]] and [dosing](https://x.y).",
    "- blocks `beta-1`",
    "> caution in asthma",
    "```",
    "code stays out",
    "```",
    "| a | b |",
  ].join("\n");
  const preview = previewOf(content);
  assertEquals(
    preview,
    "Propranolol is _non-selective_; see the selective one and dosing. blocks beta-1 caution in asthma a b",
  );
});

Deno.test("previewOf caps the snippet length", () => {
  assertEquals(previewOf("word ".repeat(200)).length <= 220, true);
});

Deno.test("previewOf looks past a syntax wall at the top of the note", () => {
  // A code block longer than the first slice would strip to nothing — the
  // deeper second pass should still find the prose below it.
  const content = "```\n" + "x".repeat(1200) + "\n```\n\nReal prose starts here.";
  assertEquals(previewOf(content), "Real prose starts here.");
});

Deno.test("previewOf drops YAML frontmatter instead of leaking '---' and keys", () => {
  const content = "---\ntitle: Cardio\ntags: [exam]\n---\n\nReal prose starts here.";
  assertEquals(previewOf(content), "Real prose starts here.");
});

Deno.test("previewOf drops horizontal-rule lines mid-note", () => {
  assertEquals(previewOf("Above the rule.\n\n---\n\nBelow the rule."), "Above the rule. Below the rule.");
});

// --- plainTextOf: what Find shows instead of the note's raw source

Deno.test("plainTextOf: strips heading marks but keeps the heading text and the line", () => {
  assertEquals(plainTextOf("## Beta blockers\nSlow the heart."), "Beta blockers\nSlow the heart.");
});

Deno.test("plainTextOf: strips emphasis, highlight, and code marks", () => {
  assertEquals(plainTextOf("**Bradycardia** is ==key== and `atropine` reverses ~~it~~."), "Bradycardia is key and atropine reverses it.");
});

Deno.test("plainTextOf: keeps paragraph breaks, unlike previewOf", () => {
  assertEquals(plainTextOf("One.\n\nTwo."), "One.\n\nTwo.");
  assertEquals(previewOf("One.\n\nTwo."), "One. Two.");
});

Deno.test("plainTextOf: bullets become real bullets, nesting preserved", () => {
  assertEquals(plainTextOf("- first\n  - nested\n* third"), "• first\n  • nested\n• third");
});

Deno.test("plainTextOf: links read as their text, images vanish", () => {
  assertEquals(plainTextOf("See [the chart](https://x.example/a.png) and ![a diagram](x.png)"), "See the chart and");
});

Deno.test("plainTextOf: wikilinks read as their alias when they have one", () => {
  assertEquals(plainTextOf("[[Beta blockers]] and [[Beta blockers|these]]"), "Beta blockers and these");
});

Deno.test("plainTextOf: a table loses its pipes and its separator row", () => {
  assertEquals(plainTextOf("| Drug | Class |\n| --- | --- |\n| Atenolol | B1 |"), "Drug   Class\nAtenolol   B1");
});

Deno.test("plainTextOf: code fences go, the code inside stays searchable", () => {
  assertEquals(plainTextOf("```ts\nconst dose = 5;\n```"), "const dose = 5;");
});

Deno.test("plainTextOf: leading frontmatter is dropped entirely", () => {
  assertEquals(plainTextOf("---\ntags: [pharm]\n---\nReal content."), "Real content.");
});

Deno.test("plainTextOf: blockquote markers go", () => {
  assertEquals(plainTextOf("> Quoted line\n> and another"), "Quoted line\nand another");
});
