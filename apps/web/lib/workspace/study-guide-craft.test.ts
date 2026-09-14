import assert from "node:assert/strict";
import test from "node:test";

import { STUDY_GUIDE_RULES, STUDY_GUIDE_RULES_SHORT } from "./study-guide-craft";

/**
 * 🔴 THE FIELD-NEUTRALITY TEST FROM `CLAUDE.md`, MADE MECHANICAL, exactly as
 * `item-writing.test.ts` does it for exam items.
 *
 * The word list is NOT a keyword filter on learner content, which would be the
 * same mistake one level up. It is a check on OUR OWN PROMPT, which we control,
 * and it fails loudly if someone reaches for a familiar example again. A study
 * guide is the artifact most likely to attract one, because "for example, a case
 * and its distinguishing facts" reads so naturally while telling every mechanical
 * engineering student's guide to be written like a law revision sheet.
 */
const FIELD_SPECIFIC = [
  "patient",
  "clinical",
  "diagnos",
  "lab value",
  "lab result",
  "dose",
  "drug",
  "symptom",
  "pharmac",
  // Other fields, so this does not merely trade medicine for law.
  "plaintiff",
  "defendant",
  "statute",
  "beam",
  "circuit",
];

test("the study-guide rules name no discipline", () => {
  const lowered = STUDY_GUIDE_RULES.toLowerCase();
  for (const word of FIELD_SPECIFIC) {
    assert.ok(
      !lowered.includes(word),
      `STUDY_GUIDE_RULES mentions "${word}". A law student and a mechanical ` +
        `engineering student both revise from this prompt; an example from one ` +
        `field tells the model to write that field's guide for everyone.`,
    );
  }
});

test("the short form names no discipline either", () => {
  const lowered = STUDY_GUIDE_RULES_SHORT.toLowerCase();
  for (const word of FIELD_SPECIFIC) {
    assert.ok(!lowered.includes(word), `STUDY_GUIDE_RULES_SHORT mentions "${word}"`);
  }
});

/**
 * 🔴🔴 THE THESIS, AND IT IS THE ONE RULE THAT CHANGES THE ARTIFACT.
 *
 * Everything else here is good practice that a competent writer might reach for
 * anyway. This one is the reason the file exists: a summary and a study guide
 * look alike on the page, and only the retrieval shape separates them. A rewrite
 * that softened this into "include some questions" would read as tidier and
 * measure worse, because the model would append a quiz to a summary rather than
 * build the document out of the questions.
 */
test("🔴 a guide is answered rather than read, and the questions come FIRST", () => {
  assert.match(STUDY_GUIDE_RULES, /ANSWERED, NOT READ/, "the thesis was softened out of the rules");
  assert.match(
    STUDY_GUIDE_RULES,
    /Open every section with the questions/,
    "the questions are no longer required to lead the section, so a quiz appended to a summary now satisfies the rules",
  );
  assert.match(
    STUDY_GUIDE_RULES,
    /cover the answers/,
    "the guide no longer has to be usable with the answers hidden, which is what makes it a retrieval document",
  );
  // The short form is what most lanes actually see, so it carries the thesis or the two drift.
  assert.match(STUDY_GUIDE_RULES_SHORT, /answered, not read/i, "the short form lost the thesis");
});

test("the craft survived: every substantive rule is still stated", () => {
  // Removing any one of these would leave a document that still looks like a
  // study guide and teaches measurably less.
  const lowered = STUDY_GUIDE_RULES.toLowerCase();
  for (const rule of [
    "one idea per line",
    "confuse", // the contrast pairs, the part a summary always drops
    "reasoning line by line",
    "unworked", // the generation half of the worked example
    "exact specific",
    "does not hold", // conditions, exceptions, boundaries
    "name the mistakes",
    "did not cover", // the edge of what the learner has
  ]) {
    assert.ok(lowered.includes(rule), `the rule about "${rule}" was lost`);
  }
});

/**
 * 🔴 THE SECTION LIST MUST NEVER READ AS A FORM TO FILL IN.
 *
 * `SAVED_WRITING_TELLS` already tells the writer to "structure by what the
 * material actually contains, not by a template". A vocabulary of section shapes
 * sits one sentence away from contradicting that, and a prompt that argues with
 * itself loses: the half carrying concrete examples wins, and here that is the
 * list of headings. So the disclaimer travels in the SAME rule as the list, and
 * this test fails if the two are ever separated.
 */
test("🔴 the section vocabulary carries its own not-a-checklist rule", () => {
  const sectionRule = STUDY_GUIDE_RULES.split("\n").find((line) => line.includes("section shapes"));
  assert.ok(sectionRule, "the section vocabulary rule is gone");
  assert.match(sectionRule, /never a form to fill in/, "the list of sections no longer says it is not a checklist");
  assert.match(sectionRule, /leave out the rest/, "nothing tells the writer to omit the sections the material does not support");
});

/**
 * 🔴 NO EM DASH IN THE PROMPT STRINGS (see no-em-dashes.test.ts and PR #842).
 *
 * The writer's instructions are the only prose it has in front of it. A prompt
 * that models the punctuation the product bans teaches it, which is how
 * forty-nine em dashes reached one turn packet. Comments are exempt because they
 * never reach the model; these two constants are not.
 */
test("🔴 the prompt strings carry no em dash and no spaced en dash", () => {
  for (const [name, text] of [
    ["STUDY_GUIDE_RULES", STUDY_GUIDE_RULES],
    ["STUDY_GUIDE_RULES_SHORT", STUDY_GUIDE_RULES_SHORT],
  ] as const) {
    assert.doesNotMatch(text, /—/, `${name} contains an em dash`);
    assert.doesNotMatch(text, / – /, `${name} contains a spaced en dash, where a model told to drop the em dash goes next`);
  }
});

/**
 * 🔴 THE SHORT FORM IS THE PACKET-SAFE ONE, AND THAT IS LOAD-BEARING.
 *
 * `selectChatSkills` skips an oversized packet SILENTLY, so a ChatSkill built on
 * the full rules would vanish on any turn where a second skill matched, which
 * reads as "the model ignored the instruction". The full constant is for
 * standalone system prompts, which have no ceiling; the short one is what a
 * packet-constrained lane takes. This test states which is which so a future
 * edit that fattens the short form fails here rather than in production.
 */
test("🔴 the short form stays inside a chat-skill packet share", () => {
  const SKILL_CHAR_SHARE = 2_500;
  assert.ok(
    STUDY_GUIDE_RULES_SHORT.length < 600,
    `the short form is ${STUDY_GUIDE_RULES_SHORT.length} characters; it rides inside packets that already carry other rules`,
  );
  assert.ok(
    STUDY_GUIDE_RULES.length > SKILL_CHAR_SHARE,
    "the full rules now fit a packet share, so the comment warning a lane off them is stale and should be corrected rather than left to mislead",
  );
});
