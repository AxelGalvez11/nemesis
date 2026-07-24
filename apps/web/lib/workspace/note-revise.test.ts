import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyNoteRevision,
  headingDepth,
  headingMatches,
  MAX_REVISED_CHARS,
  noteHeadings,
} from "./note-revise";

const NOTE = [
  "# ACE inhibitors",
  "",
  "## Mechanism",
  "Block conversion of angiotensin I to angiotensin II.",
  "",
  "### Detail",
  "Also reduces aldosterone.",
  "",
  "## Adverse effects",
  "Dry cough, hyperkalaemia, angioedema.",
].join("\n");

const ok = (result: ReturnType<typeof applyNoteRevision>) => {
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result as Extract<typeof result, { ok: true }>;
};

// ── Additive modes cannot lose anything ──────────────────────────────────────

test("append keeps every word of the original", () => {
  const result = ok(applyNoteRevision(NOTE, { content: "## Monitoring\nCheck potassium.", mode: "append" }));
  assert.ok(result.content.startsWith("# ACE inhibitors"));
  assert.match(result.content, /Check potassium/);
  assert.match(result.content, /Dry cough/);
});

test("prepend puts the new text first and keeps the rest", () => {
  const result = ok(applyNoteRevision(NOTE, { content: "> Revised after tutorial.", mode: "prepend" }));
  assert.ok(result.content.startsWith("> Revised after tutorial."));
  assert.match(result.content, /# ACE inhibitors/);
});

test("appending to an empty note just writes the note", () => {
  const result = ok(applyNoteRevision("", { content: "# New\nBody.", mode: "append" }));
  assert.equal(result.content, "# New\nBody.");
});

test("blank additions are refused rather than writing whitespace", () => {
  const result = applyNoteRevision(NOTE, { content: "   \n  ", mode: "append" });
  assert.equal(result.ok, false);
});

// ── replace_section is surgical ──────────────────────────────────────────────

test("replacing one section leaves the others untouched", () => {
  const result = ok(applyNoteRevision(NOTE, {
    content: "Blocks ACE, so less angiotensin II and less vasoconstriction.",
    mode: "replace_section",
    section: "Mechanism",
  }));
  assert.match(result.content, /less vasoconstriction/);
  assert.doesNotMatch(result.content, /angiotensin I to angiotensin II/);
  assert.match(result.content, /Dry cough, hyperkalaemia, angioedema\./, "the other section must survive");
  assert.match(result.content, /# ACE inhibitors/, "the title must survive");
});

test("replacing a section takes its subsections with it, but stops at the next peer", () => {
  const result = ok(applyNoteRevision(NOTE, { content: "New body.", mode: "replace_section", section: "Mechanism" }));
  assert.doesNotMatch(result.content, /Also reduces aldosterone/, "### Detail belongs to ## Mechanism");
  assert.match(result.content, /## Adverse effects/, "the next peer heading must survive");
});

test("the replaced heading itself is kept", () => {
  const result = ok(applyNoteRevision(NOTE, { content: "New body.", mode: "replace_section", section: "Mechanism" }));
  assert.match(result.content, /## Mechanism/);
});

test("a heading can be named with or without its hashes", () => {
  const bare = ok(applyNoteRevision(NOTE, { content: "X body here.", mode: "replace_section", section: "Mechanism" }));
  const hashed = ok(applyNoteRevision(NOTE, { content: "X body here.", mode: "replace_section", section: "## Mechanism" }));
  assert.equal(bare.content, hashed.content);
});

test("heading matching ignores case", () => {
  const result = applyNoteRevision(NOTE, { content: "Body text.", mode: "replace_section", section: "mechanism" });
  assert.equal(result.ok, true);
});

// THE landmine this module exists to prevent: a missing heading must never widen
// into replacing the whole note.
test("a heading that does not exist is refused, and the note is not touched", () => {
  const result = applyNoteRevision(NOTE, { content: "Body.", mode: "replace_section", section: "Pharmacokinetics" });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /No section headed/.test(result.error));
  assert.ok(!result.ok && /append/.test(result.error), "the error should tell the model what to do instead");
});

test("replace_section with no heading named is refused", () => {
  assert.equal(applyNoteRevision(NOTE, { content: "Body.", mode: "replace_section" }).ok, false);
});

test("replacing the last section does not eat past the end of the note", () => {
  const result = ok(applyNoteRevision(NOTE, { content: "Cough only.", mode: "replace_section", section: "Adverse effects" }));
  assert.match(result.content, /## Mechanism/);
  assert.match(result.content, /Cough only\./);
});

// ── replace_all is gated on having read the note ─────────────────────────────

test("a full rewrite without expected_length is refused", () => {
  const result = applyNoteRevision(NOTE, { content: "# Totally new", mode: "replace_all" });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /read the note first/i.test(result.error));
});

test("a full rewrite quoting the wrong length is refused", () => {
  const result = applyNoteRevision(NOTE, { content: "# Totally new", expectedLength: 12, mode: "replace_all" });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /Read it again/.test(result.error));
});

test("a full rewrite that proves it read the note is allowed", () => {
  const result = ok(applyNoteRevision(NOTE, {
    content: "# ACE inhibitors\nRewritten from scratch.",
    expectedLength: NOTE.length,
    mode: "replace_all",
  }));
  assert.equal(result.content, "# ACE inhibitors\nRewritten from scratch.");
});

test("a small drift in length is tolerated, a large one is not", () => {
  assert.equal(applyNoteRevision(NOTE, { content: "# New body", expectedLength: NOTE.length + 20, mode: "replace_all" }).ok, true);
  assert.equal(applyNoteRevision(NOTE, { content: "# New body", expectedLength: NOTE.length + 5_000, mode: "replace_all" }).ok, false);
});

// ── General guards ───────────────────────────────────────────────────────────

test("a no-op revision is reported rather than saved", () => {
  const result = applyNoteRevision(NOTE, { content: NOTE, expectedLength: NOTE.length, mode: "replace_all" });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /not change anything/.test(result.error));
});

test("a revision that would blow the size ceiling is refused, not truncated", () => {
  const huge = "x".repeat(MAX_REVISED_CHARS + 1);
  const result = applyNoteRevision(NOTE, { content: huge, mode: "append" });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /longer than/.test(result.error));
});

test("an unknown mode is refused and lists the real ones", () => {
  const result = applyNoteRevision(NOTE, { content: "Body.", mode: "obliterate" as never });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /append/.test(result.error));
});

test("every successful revision explains what it did", () => {
  const cases = [
    { content: "New text here.", mode: "append" as const },
    { content: "New text here.", mode: "prepend" as const },
    { content: "New text here.", mode: "replace_section" as const, section: "Mechanism" },
  ];
  for (const revision of cases) {
    assert.ok(ok(applyNoteRevision(NOTE, revision)).summary.length > 0, revision.mode);
  }
});

// ── Heading helpers ──────────────────────────────────────────────────────────

test("headingDepth reads ATX headings and ignores everything else", () => {
  assert.equal(headingDepth("# One"), 1);
  assert.equal(headingDepth("### Three"), 3);
  assert.equal(headingDepth("Not a heading"), 0);
  assert.equal(headingDepth("#NoSpace"), 0);
  assert.equal(headingDepth("####### Seven is too many"), 0);
});

test("headingMatches tolerates trailing hashes and surrounding space", () => {
  assert.ok(headingMatches("## Mechanism ##", "Mechanism"));
  assert.ok(headingMatches("##   Mechanism", "  mechanism  "));
  assert.ok(!headingMatches("## Mechanisms", "Mechanism"));
});

test("noteHeadings lists what a revision can target", () => {
  assert.deepEqual(noteHeadings(NOTE), ["ACE inhibitors", "Mechanism", "Detail", "Adverse effects"]);
});
