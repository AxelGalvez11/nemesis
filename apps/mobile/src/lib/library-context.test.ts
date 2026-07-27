// Deno unit tests (repo convention) for phone-side Library grounding.
// Run: deno test --no-check apps/mobile/src/lib/library-context.test.ts
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatLibraryContext,
  HIT_CHAR_LIMIT,
  MAX_CONTEXT_HITS,
  selectHits,
  shouldSearchLibrary,
  type LibraryHit,
} from "./library-context.ts";

const hit = (over: Partial<LibraryHit> = {}): LibraryHit => ({
  chunk_index: 0,
  content: "Digoxin has a half-life of about 36 hours.",
  path: "Pharmacology/Digoxin.md",
  similarity: 0.8,
  title: "Digoxin",
  ...over,
});

// ── When to look ─────────────────────────────────────────────────────────────

Deno.test("a real question is looked up", () => {
  assertEquals(shouldSearchLibrary("what did my lecture say about digoxin clearance?"), true);
});

Deno.test("a one-word topic is still a question", () => {
  assertEquals(shouldSearchLibrary("digoxin"), true);
});

Deno.test("an acknowledgement is not", () => {
  for (const text of ["ok", "Thanks!", "got it", "  yep  ", "lol"]) {
    assertEquals(shouldSearchLibrary(text), false, `${text} asks nothing`);
  }
});

Deno.test("an empty or wordless turn is not", () => {
  assertEquals(shouldSearchLibrary("   "), false);
  assertEquals(shouldSearchLibrary("???"), false);
});

// "thanks" is an acknowledgement; "thanks, but what about renal dosing" is a
// question wearing one. Matching the WHOLE message rather than a prefix is what
// keeps the gate from swallowing the second kind.
Deno.test("a question that opens with thanks is still looked up", () => {
  assertEquals(shouldSearchLibrary("thanks, but what about renal dosing?"), true);
});

// ── Which passages ───────────────────────────────────────────────────────────

Deno.test("the strongest matches come first", () => {
  const picked = selectHits([
    hit({ path: "a.md", similarity: 0.4 }),
    hit({ path: "b.md", similarity: 0.9 }),
    hit({ path: "c.md", similarity: 0.6 }),
  ]);
  assertEquals(picked.map((h) => h.path), ["b.md", "c.md", "a.md"]);
});

// A forty-chunk lecture owns the top of any ranking about its own subject. Taking
// the best six outright would answer every question out of that one note, even
// when a different note answers better.
Deno.test("one long note cannot fill the whole block", () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    hit({ chunk_index: i, path: "Lectures/Long.md", similarity: 0.9 - i * 0.01 }));
  const other = hit({ path: "Notes/Short.md", similarity: 0.5 });
  const picked = selectHits([...many, other]);
  assertEquals(picked.filter((h) => h.path === "Lectures/Long.md").length, 2);
  assert(picked.some((h) => h.path === "Notes/Short.md"), "the other note must survive");
});

Deno.test("no more passages than one prompt should carry", () => {
  const wide = Array.from({ length: 20 }, (_, i) => hit({ path: `n${i}.md`, similarity: 0.9 }));
  assertEquals(selectHits(wide).length, MAX_CONTEXT_HITS);
});

Deno.test("nothing found is not an error", () => {
  assertEquals(selectHits([]), []);
  assertEquals(formatLibraryContext([]), "");
});

// ── The prompt block ─────────────────────────────────────────────────────────

Deno.test("the block names the notes and tells the model to prefer them", () => {
  const block = formatLibraryContext([hit()]);
  assertMatch(block, /Library notes/);
  assertMatch(block, /prefer it over/i);
  assertMatch(block, /Digoxin \(Pharmacology\/Digoxin\.md\)/);
  assertMatch(block, /half-life of about 36 hours/);
});

Deno.test("a note with no title falls back to its file name, extension stripped", () => {
  const block = formatLibraryContext([hit({ path: "Unit 3/Renal clearance.md", title: "  " })]);
  assertMatch(block, /Renal clearance \(Unit 3\/Renal clearance\.md\)/);
});

Deno.test("a long passage is clipped, not sent whole", () => {
  const block = formatLibraryContext([hit({ content: "x".repeat(HIT_CHAR_LIMIT + 500) })]);
  assert(block.includes("x".repeat(HIT_CHAR_LIMIT)));
  assert(!block.includes("x".repeat(HIT_CHAR_LIMIT + 1)));
});
