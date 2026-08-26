import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildAutoTagMessages } from "./workspace/study-ai-extras";

// 🔴 NEMESIS IS FIELD-AGNOSTIC, AND THIS FILE IS THE ONLY THING THAT KEEPS IT THAT WAY BY DEFAULT.
//
// The repo used to be a pharmacy product ("PharmaBro", then "PharmaOrb"). The rename was done, but
// the assumptions were not: placeholders read "Pharmacy School::Exam 7", the flashcard tagger was
// told to tag by "drug class, organ system, mechanism", the dev preview seeded a NAPLEX workspace,
// and alert emails were signed "PharmaOrb". None of that was a bug in any one feature. It was the
// old audience surviving inside the new product, one string at a time, where nobody was looking.
//
// The owner's own test (CLAUDE.md): would this work for a law student AND a mechanical engineering
// student? A placeholder that says "Pharmacy School" fails it, and it fails it in the worst place,
// because the student reads it as Nemesis telling them who it thinks they are.
//
// 🔴 WHAT THIS DOES NOT BAN. Drug lookups, openFDA and medical literature search are real features
// that real students use, and CLAUDE.md keeps them deliberately. The line is identity, not subject
// matter: Nemesis may *know about* medicine, and may never *assume* it. So this scans the surfaces
// that speak to the learner or instruct a model, and leaves the domain data sources alone.

/** The shipping web surface: what a student sees, plus what we tell a model about them. */
const SCANNED = [
  "components/workspace",
  "components/bloub",
  "components/mascot",
  "lib/workspace",
  "lib/learn",
  "app/(workspace)",
];

/** Not the product speaking. Tests may use the owner's real pharmacy courses as fixtures, because a
 *  realistic filing case is worth more than a tidy one, and `break/` is an English dictionary for
 *  the word games, in which "pharmacy" is simply a word. */
const EXEMPT = (path: string): boolean =>
  path.includes(".test.") || path.includes("fixture") || path.includes("/break/") || path.includes("__");

const BANNED = /pharmac(y|ist|ies|ology|eutical)|pharm\.?d\b|naplex|pharmaorb|pharmabro/i;

/** Comment lines are excluded: a comment explaining WHY a rule exists often has to name the thing
 *  the rule bans, and this file is the proof of that. Only lines that ship words or instructions
 *  are scanned. */
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
        if (!isComment(line) && BANNED.test(line)) {
          offences.push(`${path.slice(root.length)}:${i + 1}  ${line.trim().slice(0, 120)}`);
        }
      });
    }
  }
  assert.deepEqual(
    offences,
    [],
    "A pharmacy assumption reached a surface a learner or a model reads:\n" + offences.join("\n"),
  );
});

test("🔴 the flashcard tagger is not told what field it is working in", () => {
  // This asked for "drug class, organ system, mechanism, exam topic" with medical examples, so the
  // model knew the subject before it read a card. A law deck came back tagged against a taxonomy
  // that does not exist in law. A category list never generalises; an instruction about structure
  // does, which is what replaced it.
  const prompt = buildAutoTagMessages([{ back: "b", front: "f", id: "c1" }])
    .map((m) => m.content)
    .join("\n");
  for (const word of ["drug", "organ system", "beta-blocker", "renal", "adverse-effect", "clinical"]) {
    assert.ok(!prompt.toLowerCase().includes(word), `the tagger still names "${word}"`);
  }
  assert.match(prompt, /Do not assume a subject/i, "the tagger is no longer told to read before it tags");
});
