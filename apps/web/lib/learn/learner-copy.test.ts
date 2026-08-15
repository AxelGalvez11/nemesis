// The half of the learner-facing copy rule `components/workspace/learn/canvas-learner-copy.test.ts`
// could not reach.
//
// Product mandate rule 5 (owner, 2026-08-15): "Learner-facing writing rules: concise, plain,
// technical, natural. NO EM DASHES. No AI-writing tics, no filler, no praise inflation ('Great
// question!'), no canned transitions ('Let's dive in'), no motivational chatter."
//
// 🔴 THAT GUARD'S OWN COMMIT SAYS WHY IT STOPS AT ITS OWN DIRECTORY: "It also cannot reach
// lib/learn/*.ts, which holds several learner-facing literals of its own (CONTINUE_LABEL,
// THINKING_COPY, VERDICT_HEADLINE, ASK_PLACEHOLDER) -- that directory was confined to a
// concurrently active lane for this task. ... Left as a gap for that lane to close, not papered
// over here." This file closes it.
//
// 🔴 A CURATED LIST, NOT A DIRECTORY WALK — AND THAT IS A DIFFERENT SHAPE FROM THE SIBLING GUARD ON
// PURPOSE. `components/workspace/learn/` is a UI directory: nearly every file in it renders, so
// scanning every `.ts`/`.tsx` file there is the right default. `lib/learn/` is not a UI directory —
// it is ~80 files of policy, extraction and persistence logic, and the overwhelming majority of its
// string literals are `because:` reasons on a `TeachingAction` (confirmed, by reading every render
// site in components/, NEVER put in front of a learner — they are the inspectable policy trace, not
// UI copy), LLM system-prompt text (already guarded separately by
// `canvas-prompts.test.ts`'s own no-em-dash check, which exists because the MODEL's output is bound
// by it, not the learner's screen), or internal error/reasoning prose. A blanket scan of this
// directory would force-rewrite hundreds of internal strings a learner never sees, which is not the
// rule and would make the guard impossible to keep green without corrupting the reasoning it exists
// to preserve. So this names every file that is known to hold copy the runtime actually renders, the
// same way the handoff that created this file named four constants by hand.
//
// 🔴 EVERY ENTRY HERE WAS VERIFIED RENDERED, NOT GUESSED FROM ITS NAME. `CONTINUE_LABEL` (used by
// components/workspace/learn/canvas-composer.tsx), `THINKING_COPY` (the busy caption), `VERDICT_HEADLINE`
// (components/workspace/learn/canvas-policy-view.tsx prints `VERDICT_HEADLINE[verdict]` directly),
// `RESPONSE_PLACEHOLDER`/`RECALL_PLACEHOLDER`/`ASK_PLACEHOLDER`/`START_WITH_MATERIAL_PLACEHOLDER`
// (the composer's own placeholder text), and the four prompt-wording functions in `objective-task.ts`
// (`objectivePromptText`, `predictionPromptText`, `discriminationPromptText`, `sequencePromptText` —
// the literal question text staged onto `RetrievalPrompt.prompt`, which is what the Canvas asks).
//
// 🔴 TWO REAL VIOLATIONS WERE LIVE WHEN THIS GUARD WAS WRITTEN, CAUGHT BY WRITING IT:
// `VERDICT_HEADLINE.strong` and `.incorrect` in canvas-judge.ts both carried an em dash, rendered
// directly by canvas-policy-view.tsx on every correct-and-complete or incorrect answer — one of the
// most frequently seen strings on the whole Canvas. `discriminationPromptText` in objective-task.ts
// carried two more, in the literal question text a `classification|discriminate` objective asks.
// Both are fixed in the same change that added this file. A third — `canvas-focus.ts`'s Minimap
// territory chips inheriting an em dash from `knowledge.statement` — is not a hardcoded string this
// kind of guard can see (the dash is DATA, not source text) and is covered separately by
// `canvas-focus.test.ts` instead.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname);

/**
 * Every file in lib/learn known to hold copy the runtime renders to a learner.
 *
 * 🔴 ADD TO THIS LIST WHEN A NEW LEARNER-FACING LITERAL LANDS IN lib/learn/. That is a real
 * maintenance cost compared to a directory walk, and it is the cost of not sweeping in `because:`
 * strings and LLM prompts along with it — see the file header.
 */
const COPY_FILES: readonly string[] = [
  "canvas-continue.ts", // CONTINUE_LABEL
  "thinking-phases.ts", // THINKING_COPY
  "canvas-judge.ts", // VERDICT_HEADLINE
  "canvas-tasks.ts", // RESPONSE_PLACEHOLDER, RECALL_PLACEHOLDER, ASK_PLACEHOLDER, START_WITH_MATERIAL_PLACEHOLDER
  "objective-task.ts", // the four *PromptText question-wording functions
];

/** Source with every comment removed. Identical shape to
 *  `components/workspace/learn/canvas-learner-copy.test.ts`'s `stripCopy` — kept as its own copy
 *  rather than a shared import, for the same reason that file gives: a test importing test-only
 *  helpers from a sibling test file is its own kind of coupling, and this guard must keep behaving
 *  correctly even if that one is ever deleted or moved. */
function stripCopy(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\S\n]*(?:[?:][^\S\n]*)?\/\/.*$/gm, "");
}

const DASH_PATTERN = /—|–|&mdash;|&ndash;|&#8212;|&#8211;|&#x2014;|&#x2013;/i;

const BANNED_TICS: readonly RegExp[] = [
  /great question/i,
  /let'?s dive in/i,
  /feel free to/i,
  /i understand (that|your)/i,
  /\bcertainly!/i,
  /\bas an ai\b/i,
  /i'?d be happy to/i,
  /happy to help/i,
  /\bof course!/i,
  /no worries/i,
  /in conclusion,/i,
  /i'?m sorry,? but/i,
  /large language model/i,
  /as a language model/i,
  /let me know if/i,
  /don'?t hesitate to/i,
];

test("the copy guard's file list still exists and is not accidentally empty", () => {
  // 🔴 THE SAME ESCAPE HATCH THE SIBLING GUARD CALIBRATES AGAINST, RESHAPED FOR A CURATED LIST. A
  // directory walk fails silently by matching nothing; a curated list fails silently by nobody
  // noticing a rename. This will not catch every future rename, but it catches the file disappearing
  // entirely — the same failure mode the sibling guard's file-count assertion protects against.
  assert.ok(COPY_FILES.length >= 5, `expected the curated file list to hold its known entries, found ${COPY_FILES.length}`);
  for (const name of COPY_FILES) {
    assert.doesNotThrow(() => readFileSync(join(ROOT, name), "utf8"), `${name} is listed but missing`);
  }
});

test("the comment stripper removes real content without eating known-good copy", () => {
  const corpus = COPY_FILES.map((name) => readFileSync(join(ROOT, name), "utf8")).join("\n");
  const stripped = stripCopy(corpus);
  assert.ok(stripped.length < corpus.length, "stripCopy removed nothing — this guard would be reading its own comments");
  // 🔴 15%, NOT THE SIBLING GUARD'S 30% — MEASURED ON THIS DIRECTORY, NOT COPIED FROM THE OTHER ONE.
  // lib/learn carries this codebase's house style of heavy WHY-comments and 🔴 markers explaining
  // load-bearing decisions; on the five files this guard actually reads, comments are ~76% of the
  // source (measured: 73,144 bytes in, 17,194 out, a 0.235 ratio). A floor copied from the UI
  // directory's denser code would fail on every honest edit to a comment. 15% still catches the
  // failure this check exists for — a stripper that deletes everything and lets every assertion
  // below pass by reading nothing — with headroom below the real number rather than pinned to it.
  assert.ok(stripped.length > corpus.length * 0.15, "stripCopy removed almost everything — it would pass by reading nothing");
  // A real, unremarkable line of rendered learner copy that carries no comment marker of its own.
  assert.match(stripped, /Continue/, "a plain rendered string did not survive stripping — the stripper is too aggressive");
});

test("🔴 no learner-facing copy in lib/learn carries an em dash, en dash, or their HTML entities", () => {
  const offenders: string[] = [];
  for (const name of COPY_FILES) {
    const stripped = stripCopy(readFileSync(join(ROOT, name), "utf8"));
    for (const [index, line] of stripped.split("\n").entries()) {
      if (DASH_PATTERN.test(line)) {
        offenders.push(`${name}:${index + 1} ${line.trim().slice(0, 100)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `an em dash (or en dash) is back in learner-facing copy — owner's rule is no em dashes on the Canvas:\n  ${offenders.join("\n  ")}`,
  );
});

test("🔴 no learner-facing copy in lib/learn carries a canned AI-writing tic", () => {
  const offenders: string[] = [];
  for (const name of COPY_FILES) {
    const stripped = stripCopy(readFileSync(join(ROOT, name), "utf8"));
    for (const [index, line] of stripped.split("\n").entries()) {
      for (const tic of BANNED_TICS) {
        if (tic.test(line)) {
          offenders.push(`${name}:${index + 1} matched ${tic}: ${line.trim().slice(0, 100)}`);
        }
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a canned AI-writing tic is back in learner-facing copy — Nemesis is concise, plain, technical and natural, never a chatbot:\n  ${offenders.join("\n  ")}`,
  );
});
