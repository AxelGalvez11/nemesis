// Run: npx tsx --test packages/shared/src/ai-writing-tells.test.ts   (cwd = repo root)
//
// These test the CONTENT of the rules, not that a string exists. A prompt block
// is the kind of thing that gets "tidied" — shortened, reworded, half-deleted —
// by someone who does not know which clauses were doing work, and nothing else
// in the codebase would notice. The size assertions matter for a different
// reason: an oversized packet is dropped SILENTLY at runtime, so a test is the
// only thing standing between a long rule and a rule that never fires.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONSISTENT_NAMING_RULE,
  SAVED_WRITING_TELLS,
  SAVED_WRITING_TELLS_MAX_CHARS,
} from "./ai-writing-tells.ts";
import { WRITING_VOICE } from "./writing-voice.ts";

test("the block stays inside the budget that keeps it from being dropped", () => {
  // selectChatSkills SKIPS an oversized packet with `continue`, not a throw. A
  // packet over its share vanishes on any turn where a second skill matched,
  // which reads as "the model ignored the instruction" rather than as a bug.
  assert.ok(
    SAVED_WRITING_TELLS.length <= SAVED_WRITING_TELLS_MAX_CHARS,
    `${SAVED_WRITING_TELLS.length} > ${SAVED_WRITING_TELLS_MAX_CHARS}`,
  );
});

test("it covers the document-level tells the always-on voice cannot", () => {
  // Each of these can only occur in something longer than a chat reply, which is
  // exactly why they live here and not in WRITING_VOICE.
  const required: [string, RegExp][] = [
    ["one name per concept", /ONE way and keep that name/],
    ["hedge-then-guess", /details are limited|leave it out/i],
    ["filler sections", /Challenges.*Future Directions|filler sections/i],
    ["placeholders", /placeholder/i],
    ["conversational asides in a file", /Certainly|conversational asides/i],
  ];
  for (const [label, pattern] of required) {
    assert.match(SAVED_WRITING_TELLS, pattern, `missing rule: ${label}`);
  }
});

test("the naming rule says WHY, because a bare instruction gets reworded away", () => {
  // "Use one name" alone reads as a style preference. The consequence is what
  // makes it a correctness rule: a synonym in a note becomes a wrong flashcard.
  assert.match(SAVED_WRITING_TELLS, /two things|flashcard made from it will be wrong/i);
  assert.match(CONSISTENT_NAMING_RULE, /ONE name per concept/);
  assert.match(CONSISTENT_NAMING_RULE, /recall of your vocabulary/i);
});

test("the two blocks do not repeat each other", () => {
  // They ride different turns and are paid for differently: the voice is on
  // every message forever, this only on save turns. Anything stated in both is
  // being bought twice.
  const voiceSentences = WRITING_VOICE.split(". ").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 40);
  for (const sentence of voiceSentences) {
    assert.ok(
      !SAVED_WRITING_TELLS.toLowerCase().includes(sentence),
      `duplicated from WRITING_VOICE: "${sentence.slice(0, 60)}..."`,
    );
  }
});

test("the rules are instructions, not a bulleted lecture", () => {
  // A bulleted instruction block is itself one of the tells from the source
  // guide, and a model shown bullets answers in bullets — the same reasoning
  // that keeps WRITING_VOICE as prose.
  assert.ok(!/^\s*[-*•]/m.test(SAVED_WRITING_TELLS), "starts a line with a bullet marker");
  assert.ok(!SAVED_WRITING_TELLS.includes("**"), "contains markdown bold");
});
