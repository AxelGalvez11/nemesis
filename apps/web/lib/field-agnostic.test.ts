import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildAutoTagMessages } from "./workspace/study-ai-extras";

// 🔴 NEMESIS IS FIELD-AGNOSTIC, AND NOTHING WAS KEEPING IT THAT WAY BY DEFAULT.
//
// This repo was a pharmacy product twice over ("PharmaBro", then "PharmaOrb"). The rename happened;
// the assumptions did not. As of 2026-08-24 a student on the Study page was still shown
// "Pharmacy School::Exam 7" in three separate dialogs, the flashcard tagger was still told to tag
// by "drug class, organ system, mechanism", the dev-preview library was still a pharmacy shelf, and
// alert emails were still signed "PharmaOrb". None of that was a bug in any one feature. It was the
// old audience surviving inside the new product, one string at a time, where nobody looked twice.
//
// The owner's own test (CLAUDE.md): would this work for a law student AND a mechanical engineering
// student? A placeholder reading "Pharmacy School" fails it in the worst possible place, because the
// student reads it as Nemesis telling them who it thinks they are.
//
// 🔴 WHAT THIS DELIBERATELY DOES NOT BAN. Drug lookups, openFDA and medical literature search are
// real features that real students use, and CLAUDE.md keeps them on purpose. The line is IDENTITY,
// not subject matter: Nemesis may know about medicine and may never assume it. So this scans the
// surfaces that speak to a learner or instruct a model, and leaves the domain data sources alone.

/** The shipping web surface: what a student reads, plus what we tell a model about them. */
const SCANNED = ["components", "lib/workspace", "lib/learn", "app"];

/**
 * Files that are not the product speaking. Each exemption is load-bearing:
 *  - tests may use the owner's real pharmacy courses as fixtures, because a realistic filing case
 *    beats a tidy one (see `course-filing.test.ts`, which turns on "PHCY 2114");
 *  - `break/` is an English dictionary for the word games, in which "pharmacy" is simply a word;
 *  - recorded parse fixtures are somebody's actual lecture, captured verbatim on purpose;
 *  - 🔴 `curricula/` is the SUBJECT REGISTRY, and it is the proof of generality rather than a breach
 *    of it: health-professions.ts is ONE OF TWELVE field files, beside engineering, business-law,
 *    world-languages and the rest. A Pharmacology course inside it is content Nemesis knows, not an
 *    audience Nemesis assumes, which is exactly the line CLAUDE.md draws. If that folder ever shrinks
 *    back to one field, the problem is the folder, not this test;
 *  - `reference-shelf.ts` is the visual corpus: thousands of third-party figure captions, quoted.
 */
const EXEMPT = (path: string): boolean =>
  path.includes(".test.")
  || path.includes("fixture")
  || path.includes("/break/")
  || path.includes("/curricula/")
  || path.includes("reference-shelf")
  || path.includes("__");

// 🔴 THE `/legal/` EXEMPTION IS GONE, AND ITS REMOVAL IS THE RECORD OF A DECISION. It was here from
// 2026-08-24 with a comment saying the legal pages were the owner's call rather than a lint, which
// was right: /legal/disclaimer was titled "Medical Disclaimer" and rewriting liability copy to
// satisfy a test would have been the wrong way round. The owner made the call on 2026-08-25 —
// *"remove medical disclaimer claims, this is a general research tool not a medical tool"* — so the
// pages are now in scope like everything else, and `legal-is-general.test.ts` holds their substance.

/** Exact lines that name the old brand for a reason, each of which has to be a reason. */
const ALLOWED = [
  // The theme key was "pharmaorb-theme" for the whole PharmaOrb era. Both places read it as a
  // FALLBACK so that renaming it does not silently reset every existing student's chosen theme.
  'const LEGACY_STORAGE_KEY = "pharmaorb-theme";',
  "localStorage.getItem('nemesis.web.theme')||localStorage.getItem('pharmaorb-theme')",
];

const BANNED = /pharmac(y|ist|ies|ology|otherapy|eutical)|pharm\.?d\b|naplex|pharmaorb|pharmabro/i;

/**
 * Comment lines are excluded, and this file is the reason why: an explanation of a rule usually has
 * to name the thing the rule bans. The comments in the parser modules are the same case, recording
 * which real lecture broke which extractor. Only lines that ship words or instructions are scanned.
 */
const isComment = (line: string): boolean => {
  const s = line.trim();
  return s.startsWith("//") || s.startsWith("*") || s.startsWith("/*") || s.startsWith("{/*");
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry) && !EXEMPT(path)) out.push(path);
  }
  return out;
}

test("🔴 no shipping surface assumes the learner is a pharmacy or health-science student", () => {
  const root = new URL("..", import.meta.url).pathname;
  const offences: string[] = [];
  for (const area of SCANNED) {
    for (const path of walk(join(root, area))) {
      readFileSync(path, "utf8").split("\n").forEach((line, i) => {
        if (!isComment(line) && BANNED.test(line) && !ALLOWED.some((ok) => line.includes(ok))) {
          offences.push(`${path.slice(root.length)}:${i + 1}  ${line.trim().slice(0, 120)}`);
        }
      });
    }
  }
  assert.deepEqual(
    offences,
    [],
    `A pharmacy assumption reached a surface a learner or a model reads:\n${offences.join("\n")}`,
  );
});

test("🔴 the flashcard tagger is not told what field it is working in", () => {
  // This asked for "drug class, organ system, mechanism, exam topic" with medical examples, so the
  // model knew the subject before it had read a card. A law deck came back tagged against a taxonomy
  // that does not exist in law. A category list never generalises; an instruction about structure
  // does, which is what replaced it.
  const prompt = buildAutoTagMessages([{ back: "b", front: "f", id: "c1" }])
    .map((m) => m.content)
    .join("\n")
    .toLowerCase();
  for (const word of ["drug", "organ system", "beta-blocker", "renal", "adverse-effect", "clinical"]) {
    assert.ok(!prompt.includes(word), `the tagger still names "${word}"`);
  }
  assert.match(prompt, /do not assume a subject/, "the tagger is no longer told to read before it tags");
});
