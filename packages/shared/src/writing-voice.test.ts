// Run: npx tsx packages/shared/src/writing-voice.test.ts   (cwd = repo root)
//
// These assertions are deliberately about the CONTENT of the rules, not just
// that a string exists. A voice instruction is the kind of thing that gets
// "tidied" — shortened, reworded, half-deleted — by someone who does not know
// which clauses were doing work, and nothing else in the codebase would notice.
import assert from "node:assert/strict";
import { WRITING_VOICE, WRITING_VOICE_MAX_CHARS } from "./writing-voice.ts";

// The vocabulary ban is the single highest-signal rule; losing it silently would
// leave a voice instruction that reads fine and changes nothing.
for (const word of ["delve", "tapestry", "testament", "pivotal", "meticulous", "showcase", "leverage", "seamless"]) {
  assert.ok(WRITING_VOICE.includes(word), `the banned-word list must still name "${word}"`);
}

// Sentence-shape tells survive a vocabulary swap, so they are named separately.
assert.ok(WRITING_VOICE.includes("not just X, but Y"), "the negative-parallelism ban must survive");
assert.ok(/three/.test(WRITING_VOICE), "the rule-of-three habit must still be called out");
assert.ok(WRITING_VOICE.includes("'is' and 'are'"), "the is/are rule must survive");

// Honesty rules. This is a study tool: a confident invented citation is the
// worst thing it can produce, and 'experts say' is how that arrives.
assert.ok(/experts/.test(WRITING_VOICE), "vague attribution must stay banned");
assert.ok(WRITING_VOICE.includes("I don't know"), "the say-so-plainly rule must survive");

// Never emoji — a standing owner rule that predates this file.
assert.ok(/emoji/i.test(WRITING_VOICE), "the emoji ban must survive");

// It rides EVERY turn on BOTH surfaces, so length is a real cost, not a style
// preference. If a rule genuinely needs adding, something else comes out.
assert.ok(
  WRITING_VOICE.length <= WRITING_VOICE_MAX_CHARS,
  `voice rules are ${WRITING_VOICE.length} chars, over the ${WRITING_VOICE_MAX_CHARS} ceiling`,
);

// The rules must not themselves commit the tells they ban. An instruction block
// written in bullets teaches the model to answer in bullets.
assert.ok(!/^\s*[-*•]/m.test(WRITING_VOICE), "the rules must not be written as a bulleted list");
assert.ok(!WRITING_VOICE.includes("**"), "the rules must not use bold");

console.log(`writing-voice.test.ts OK (${WRITING_VOICE.length} chars)`);
