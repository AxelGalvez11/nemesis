import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Product mandate rule 5 (owner, 2026-08-15): "Learner-facing writing rules: concise, plain,
// technical, natural. NO EM DASHES. No AI-writing tics, no filler, no praise inflation ('Great
// question!'), no canned transitions ('Let's dive in'), no motivational chatter."
//
// 🔴 THE RULE MUST BE ENFORCED BY A TEST, NOT JUST FOLLOWED — the task's own instruction, and the
// reason this file exists rather than a paragraph in a code review checklist. Source-level, like
// every other guard in this directory: this app has no DOM test harness (canvas-runtime-branch.test.ts),
// so a structural property is checked by reading the file, not by rendering it.
//
// 🔴 SCOPE: components/workspace/learn/ ONLY — "your scope is the Canvas's transient behaviour and
// its writing" (task brief). Two consequences follow from that boundary rather than being an
// oversight:
//
//   1. Shell-wide copy (nav labels, account settings, the upgrade dialog) is out of scope by
//      design — a Canvas-writing guard reaching into every workspace surface would be a different,
//      larger task than the one asked for.
//
//   2. `CONTINUE_LABEL`, `THINKING_COPY`, `VERDICT_HEADLINE`, `ASK_PLACEHOLDER`,
//      `RESPONSE_PLACEHOLDER` and every other learner-facing literal that lives in `lib/learn/*.ts`
//      is NOT scanned here, and that is not an oversight either: `lib/learn/` was confined to a
//      concurrently active lane for this task and is explicitly off limits. `lib/learn/canvas-
//      prompts.test.ts` already guards the MODEL's own no-em-dash instruction (the string every
//      system prompt carries); nothing today guards the literal UI strings that sit beside it in
//      that directory. That gap is real and is reported rather than silently left unmentioned —
//      see the handoff notes — but closing it is Runtime/Brain's to do, not a boundary this file
//      can cross without touching a path the task confined elsewhere.
//
// 🔴 COMMENTS ARE STRIPPED FIRST, OR THIS GUARD FAILS ON ITS OWN EXPLANATION. Every other banned-
// phrase check in this directory (canvas-policy-view.test.ts's §K test, canvas-shell.test.ts's
// §46.5 test) learned this the same way: a file that documents why em dashes are banned necessarily
// contains the word "em dash" and, if quoted for calibration, an actual one. `stripCopy` below is
// this file's own copy of that fix rather than an import from a sibling test file, because a test
// importing test-only helpers from another test file is its own kind of coupling; the shape is
// deliberately identical so the two guards keep behaving the same way rather than agreeing by luck.

const ROOT = import.meta.dirname;

/** Every source file this guard is responsible for — `.ts` and `.tsx`, never the tests themselves.
 *
 *  🔴 `.ts` IS INCLUDED, NOT JUST `.tsx`. `canvas-progression.ts`, `canvas-presence.ts` and their
 *  neighbours are plain TypeScript modules that can still hold a copy string a `.tsx`-only sweep
 *  would miss — the em-dash violations this guard was written to catch were in `.tsx` files, but
 *  the NEXT one is not guaranteed to be. */
function copyFiles(): string[] {
  return readdirSync(ROOT)
    .filter((name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test."))
    .map((name) => join(ROOT, name));
}

/** Source with every comment removed — `//` lines and `/* … *‍/` blocks, which also covers a JSX
 *  `{/* … *‍/}` since that is a block comment sitting inside braces. Matches the convention this
 *  directory already uses (canvas-policy-view.test.ts, canvas-shell.test.ts) for the block-comment
 *  half exactly.
 *
 *  🔴 THE LINE-COMMENT HALF GOES ONE STEP FURTHER THAN THOSE TWO FILES, AND CALIBRATION IS WHY.
 *  Their pattern only strips a `//` that is the first non-whitespace on its line — which left a
 *  false positive standing on the first run of this guard: `canvas-composer.tsx` writes a
 *  multi-line ternary where one whole branch is a comment, `? // reason\n  // more reason\n  value`,
 *  so the FIRST line of that comment starts with `?` or `:`, not `//`. That is real source in this
 *  directory today, not a hypothetical, so the pattern here also allows one leading ternary token
 *  before the `//` — but only when NOTHING else shares the line, which is what stops it from ever
 *  eating a line that pairs a ternary branch with actual code plus a trailing comment. */
function stripCopy(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\S\n]*(?:[?:][^\S\n]*)?\/\/.*$/gm, "");
}

// ── The two escape hatches a guard like this can fail through, calibrated first ────────────────

test("the copy guard actually scans a non-trivial number of files", () => {
  // 🔴 A GUARD THAT SCANS ZERO FILES ALSO PASSES. `readdirSync` pointed at the wrong directory, a
  // filter that excludes everything, an empty ROOT — every one of them leaves every assertion below
  // vacuously true. This directory holds three dozen-plus source files today; a number this test
  // would fail against is a real regression in what is being checked, not a maintenance nuisance.
  const files = copyFiles();
  assert.ok(files.length >= 20, `expected a substantial file set, found ${files.length} — is ROOT still components/workspace/learn?`);
});

test("the comment stripper removes real content, and a known-good learner line survives it", () => {
  // 🔴 BOTH HALVES, NOT ONE. A stripper that deletes nothing makes every banned-phrase assertion
  // below trivially true against unstripped source (this directory's comments discuss the very
  // phrases being banned, at length, in order to explain why). A stripper that deletes EVERYTHING —
  // the opposite failure, and the one the first half alone cannot catch — makes them trivially true
  // for the opposite reason: an empty string contains no em dash either.
  const corpus = copyFiles()
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const stripped = stripCopy(corpus);
  assert.ok(stripped.length < corpus.length, "stripCopy removed nothing — this guard would be reading its own comments");
  assert.ok(stripped.length > corpus.length * 0.3, "stripCopy removed almost everything — it would pass by reading nothing");
  // A real, unremarkable line of rendered learner copy (canvas-quiet.tsx) that carries no comment
  // marker of its own and must not have been eaten along with them.
  assert.match(stripped, /Try again/, "a plain rendered string did not survive stripping — the stripper is too aggressive");
});

// ── The rule itself ──────────────────────────────────────────────────────────────────────────

/** Em dash, en dash, and the HTML entities either can arrive as — the realistic way this guard
 *  gets "fixed" by someone who hits it, rather than by someone who reads why it is here. This
 *  directory already writes `&rsquo;`/`&apos;`/`&rsquo;` for apostrophes in several places, so an
 *  entity is not a foreign idiom to reach for here. */
const DASH_PATTERN = /—|–|&mdash;|&ndash;|&#8212;|&#8211;|&#x2014;|&#x2013;/i;

/**
 * Phrasings the mandate names or that read the same way: praise inflation, canned transitions,
 * chatbot throat-clearing, motivational chatter. Not exhaustive — a fixed list never is — but
 * every entry is multi-word and specific enough that it does not fire on an ordinary sentence
 * using one of its words for something else (checked against this directory's own copy below;
 * see the calibration test).
 */
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

test("🔴 no learner-facing copy in this directory carries an em dash, en dash, or their HTML entities", () => {
  const offenders: string[] = [];
  for (const file of copyFiles()) {
    const stripped = stripCopy(readFileSync(file, "utf8"));
    for (const [index, line] of stripped.split("\n").entries()) {
      if (DASH_PATTERN.test(line)) {
        offenders.push(`${file.split("/").pop()}:${index + 1} ${line.trim().slice(0, 100)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `an em dash (or en dash) is back in learner-facing copy — owner's rule is no em dashes on the Canvas:\n  ${offenders.join("\n  ")}`,
  );
});

test("🔴 no learner-facing copy in this directory carries a canned AI-writing tic", () => {
  const offenders: string[] = [];
  for (const file of copyFiles()) {
    const stripped = stripCopy(readFileSync(file, "utf8"));
    for (const [index, line] of stripped.split("\n").entries()) {
      for (const tic of BANNED_TICS) {
        if (tic.test(line)) {
          offenders.push(`${file.split("/").pop()}:${index + 1} matched ${tic}: ${line.trim().slice(0, 100)}`);
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
