// The rule `thinking-phases.ts` states, enforced instead of merely written down.
//
// Its own header says a phase is "added only when something can emit it", and that a caption
// walking a list on a timer "would look exactly like a system thinking and would be theatre".
// Both are true and neither was checked. A phase added in anticipation of work that does not
// exist yet is indistinguishable, from the outside, from one that reports something real —
// right up until a learner watches a caption describe a step nothing is running.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  COMPOSER_ACTIVITY_AFTER_MS,
  KNOWLEDGE_DEADLINE_MS,
  readingSubjectFor,
  THINKING_COPY,
  THINKING_VISIBLE_AFTER_MS,
  thinkingCopy,
  type ThinkingPhase,
} from "./thinking-phases";

const APP_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

/** Every source file that could emit a phase. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
      if (full.endsWith(path.join("learn", "thinking-phases.ts"))) continue;
      out.push(full);
    }
  };
  for (const top of ["lib", "components", "app"]) walk(path.join(APP_ROOT, top));
  return out;
}

// ── 🔴 NO PHASE WITHOUT AN EMITTER ─────────────────────────────────────────────

test("every thinking phase is emitted by something that really runs", () => {
  const sources = sourceFiles().map((file) => readFileSync(file, "utf8"));
  const phases = Object.keys(THINKING_COPY) as ThinkingPhase[];

  for (const phase of phases) {
    // An emitter passes the phase as a value — `onPhase("reading_source")`, `setPhase(...)`,
    // `thinkingCopy("reading_source", …)`. A file that merely mentions the name in prose does
    // not count, which is why the quotes are required.
    const emitted = sources.some((text) => text.includes(`"${phase}"`) || text.includes(`'${phase}'`));
    assert.ok(
      emitted,
      `🔴 "${phase}" has copy but nothing emits it. A phase nothing can reach is a caption ` +
        `describing work that is not happening — the definition of the progress theatre this ` +
        `module exists to prevent. Delete it, or ship the step that reports it.`,
    );
  }
});

test("every phase that is emitted has copy for it", () => {
  const phases = new Set(Object.keys(THINKING_COPY));
  for (const phase of phases) {
    assert.ok(THINKING_COPY[phase as ThinkingPhase]?.trim(), `${phase} must say something`);
  }
});

// ── The copy itself ────────────────────────────────────────────────────────────

test("no caption is a status code, a percentage, or a bare 'Loading'", () => {
  for (const [phase, copy] of Object.entries(THINKING_COPY)) {
    assert.ok(!/\d\s*%|\bloading\b|\bplease wait\b/i.test(copy), `${phase}: "${copy}" is software talking about itself`);
    assert.ok(!/…|\.\.\./.test(copy), `${phase}: "${copy}" — the surface adds its own rhythm`);
    assert.ok(copy.split(/\s+/).length <= 5, `${phase}: "${copy}" is a sentence, not a state`);
  }
});

test("captions never name infrastructure", () => {
  // The owner's rule: "The learner should not need to know why their professor's PowerPoint is
  // large." Nothing here may leak a bucket, a vendor, a table or a file format's internals.
  const banned = /supabase|bucket|s3|parse[sd]?_document|llamaparse|mistral|gemini|tiff|xml|json|api|token/i;
  for (const [phase, copy] of Object.entries(THINKING_COPY)) {
    assert.ok(!banned.test(copy), `${phase}: "${copy}" names infrastructure`);
  }
});

// ── Reading subject: known from the file, never from elapsed time ─────────────

test("a deck reads slides, a PDF reads pages, a sheet reads sheets", () => {
  assert.equal(thinkingCopy("reading_source", readingSubjectFor("lecture.pptx")), "Reading slides");
  assert.equal(thinkingCopy("reading_source", readingSubjectFor("paper.pdf")), "Reading pages");
  assert.equal(thinkingCopy("reading_source", readingSubjectFor("grades.xlsx")), "Reading sheets");
});

test("an unknown file says the general thing rather than guessing a shape", () => {
  assert.equal(thinkingCopy("reading_source", readingSubjectFor("notes.txt")), "Reading your material");
  assert.equal(thinkingCopy("reading_source", readingSubjectFor("noextension")), "Reading your material");
  assert.equal(readingSubjectFor("weird.qqq"), "document");
});

test("the subject refines only the phase where the material's shape is known", () => {
  // Knowing the file is a deck says nothing about judging an answer or finding a gap.
  assert.equal(thinkingCopy("reading_answer", "slides"), THINKING_COPY.reading_answer);
  assert.equal(thinkingCopy("finding_gap", "slides"), THINKING_COPY.finding_gap);
  assert.equal(thinkingCopy("mapping_knowledge", "pages"), THINKING_COPY.mapping_knowledge);
});

test("the ingestion lane uses the shared vocabulary rather than its own word", () => {
  const session = readFileSync(
    path.join(APP_ROOT, "components/workspace/learn/use-canvas-session.ts"),
    "utf8",
  );
  assert.ok(
    !/label:\s*"Reading"/.test(session),
    '🔴 a bare "Reading" is one unchanging word for the longest wait in the product, and a second ' +
      "vocabulary for the same surface",
  );
  assert.ok(
    /thinkingCopy\("reading_source"/.test(session),
    "the attach lane must say what it is reading, through the one function that decides",
  );
});

// ── Thresholds stay honest ─────────────────────────────────────────────────────

test("a caption waits long enough not to flash", () => {
  assert.ok(THINKING_VISIBLE_AFTER_MS >= 300, "below this a caption appears and vanishes as a glitch");
  assert.ok(COMPOSER_ACTIVITY_AFTER_MS < THINKING_VISIBLE_AFTER_MS, "the composer dot is closer to the keystroke");
  assert.ok(KNOWLEDGE_DEADLINE_MS < 90_000, "the owner's rule: 90s with no transition must not be representable");
});
