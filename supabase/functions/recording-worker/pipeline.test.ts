import { assert, assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1";

import {
  backoffSeconds,
  buildNoteMessages,
  countSections,
  countWords,
  describeFailure,
  nextStage,
  splitNote,
  stageAttemptLimit,
  STAGES,
  TRANSCRIPT_CHARS,
} from "./pipeline.ts";

// ── Backoff and giving up ───────────────────────────────────────────────────

Deno.test("backoff grows but stays under a minute", () => {
  assertEquals(backoffSeconds(1), 2);
  assertEquals(backoffSeconds(2), 4);
  assert(backoffSeconds(5) > backoffSeconds(3));
  // The cap is what keeps a provider hiccup from turning into a student staring
  // at "Transcribing audio" long after the transcript was ready.
  assertEquals(backoffSeconds(50), 60);
  for (let attempt = 2; attempt < 80; attempt += 1) {
    assert(backoffSeconds(attempt) >= backoffSeconds(attempt - 1), `attempt ${attempt}`);
  }
});

Deno.test("a stage that never answers still ends, and the pipeline never hangs", () => {
  // Every stage has a finite limit — the property that matters is that none is
  // unbounded, because an unbounded stage is a job nobody can retry.
  for (const stage of STAGES) {
    const limit = stageAttemptLimit(stage);
    assert(Number.isFinite(limit) && limit > 0, stage);
  }
  // Transcribing is generous because most of its attempts are POLLS of a
  // provider that is legitimately still working, not retries of a failure.
  assert(stageAttemptLimit("transcribing") > stageAttemptLimit("composing"));
  // At the 60s cap, the transcribe budget has to outlast a long lecture on the
  // slow asynchronous provider.
  assert(stageAttemptLimit("transcribing") * 60 >= 30 * 60);
});

Deno.test("stages advance in order and stop at ready", () => {
  assertEquals(nextStage("queued"), "transcribing");
  assertEquals(nextStage("transcribing"), "composing");
  assertEquals(nextStage("composing"), "filing");
  assertEquals(nextStage("filing"), "indexing");
  assertEquals(nextStage("indexing"), "ready");
  assertEquals(nextStage("ready"), "ready");
});

// ── The compose pass ────────────────────────────────────────────────────────

Deno.test("a long transcript keeps its END", () => {
  // A three-hour session's conclusions are at the end; its housekeeping is at
  // the start. Clipping the wrong side loses the part worth revising from.
  const transcript = `${"x".repeat(TRANSCRIPT_CHARS)}THE CONCLUSION`;
  const [, user] = buildNoteMessages(transcript);
  assertMatch(user!.content, /THE CONCLUSION$/);
  assert(user!.content.length < transcript.length);
});

Deno.test("the prompt never assumes a subject", () => {
  const [system] = buildNoteMessages("anything");
  // Nemesis is field-agnostic: a prompt that assumes medicine writes worse notes
  // for a law student, and there is no signal here about which they are.
  assertMatch(system!.content, /never assume a biomedical one/i);
  assertNotMatch(system!.content, /\b(drug|patient|clinical|dose)\b/i);
});

Deno.test("the title line is peeled off and cleaned", () => {
  assertEquals(splitNote("Title: Renal clearance\n\n## Body").title, "Renal clearance");
  assertEquals(splitNote("Title: Renal clearance\n\n## Body").body, "## Body");
  // Models decorate. All of these are still the title line.
  assertEquals(splitNote("**Title:** Renal clearance\n\nBody").title, "Renal clearance");
  assertEquals(splitNote("## Title: Renal clearance\n\nBody").title, "Renal clearance");
  assertEquals(splitNote("Title：Renal clearance\n\nBody").title, "Renal clearance");
});

Deno.test("a note with no title line is returned untouched", () => {
  // Byte-identical, so a missing title costs the dated fallback and nothing
  // else — never the note's own first line.
  const raw = "## Renal clearance\n\nThe kidney filters…";
  assertEquals(splitNote(raw).body, raw);
  assertEquals(splitNote(raw).title, "");
});

Deno.test("a Title: further down is the note's own content", () => {
  const raw = "## Overview\n\nTitle: how a paper is titled\n";
  assertEquals(splitNote(raw).title, "");
  assertEquals(splitNote(raw).body, raw);
});

Deno.test("a long title is clipped on a word boundary", () => {
  const long = `Title: ${"clearance ".repeat(20)}\n\nBody`;
  const { title } = splitNote(long);
  assert(title.length <= 70, title);
  assertNotMatch(title, /\s$/);
});

// ── Countable detail ────────────────────────────────────────────────────────

Deno.test("words are counted the way someone reading the number would", () => {
  assertEquals(countWords(""), 0);
  assertEquals(countWords("   "), 0);
  assertEquals(countWords("the kidney filters blood"), 4);
  assertEquals(countWords("line one\nline two"), 4);
});

Deno.test("sections are the headings a reader would count", () => {
  assertEquals(countSections("## One\n\ntext\n\n## Two\n\ntext"), 2);
  assertEquals(countSections("# Top\n### Deep"), 2);
  assertEquals(countSections("no headings here"), 0);
  // Not a heading: needs the space and some text after the hashes.
  assertEquals(countSections("#hashtag\n#"), 0);
});

Deno.test("a heading inside a code fence is not a section", () => {
  // The prompt forbids code fences, and a transcript of a programming lecture is
  // exactly where the model ignores that. A section count that jumps because
  // someone dictated shell commands is a number nobody can reconcile.
  const notes = "## Real\n\n```bash\n# not a section\n# nor this\n```\n\n## Also real";
  assertEquals(countSections(notes), 2);
});

// ── Failure text ────────────────────────────────────────────────────────────

Deno.test("a failure message is short, flat, and carries no secrets", () => {
  assertEquals(describeFailure(new Error("boom"), "fallback"), "boom");
  assertEquals(describeFailure("", "fallback"), "fallback");
  assertEquals(describeFailure(undefined, "fallback"), "fallback");
  assert(describeFailure("x".repeat(1_000), "fallback").length <= 300);
  // An error body is arbitrary text from someone else's server, and this lands
  // in a database column a human reads later.
  assertMatch(describeFailure("bad key sk-abcdefghijklmnop", "f"), /\[redacted\]/);
  assertMatch(describeFailure(`token ${"a".repeat(50)}`, "f"), /\[redacted\]/);
  assertNotMatch(describeFailure("line one\nline two", "f"), /\n/);
});
