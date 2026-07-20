import assert from "node:assert/strict";

import {
  assemblyTurnToSegment,
  buildLiveAudioInsightMessages,
  formatLiveDuration,
  parseLiveAudioInsights,
  sanitizeLiveAudioKeyterms,
  transcriptText,
  upsertTranscriptSegment,
} from "./live-audio-contract";

const keyterms = sanitizeLiveAudioKeyterms([
  "TensorFlow",
  " TensorFlow ",
  "consideration",
  "A".repeat(80),
]);
assert.deepEqual(keyterms, ["TensorFlow", "consideration", "A".repeat(50)]);

const partial = assemblyTurnToSegment({
  end_of_turn: false,
  transcript: "The derivative is",
  turn_order: 4,
  type: "Turn",
  words: [{ start: 1_000, end: 1_250, text: "The" }],
});
assert.ok(partial);
assert.equal(partial.id, "turn-4");
assert.equal(partial.startSecond, 1);
assert.equal(partial.final, false);

const final = { ...partial, endSecond: 3.2, final: true, text: "The derivative is the local rate of change." };
const segments = upsertTranscriptSegment([partial], final);
assert.equal(segments.length, 1);
assert.equal(transcriptText(segments, true), final.text);

assert.deepEqual(
  parseLiveAudioInsights('```json\n{"notes":["Chain rule introduced"],"suggestions":["Can you show a worked example?"],"explore":["Automatic differentiation"]}\n```'),
  {
    explore: ["Automatic differentiation"],
    notes: ["Chain rule introduced"],
    suggestions: ["Can you show a worked example?"],
  },
);
assert.equal(parseLiveAudioInsights("not JSON"), null);

const prompt = buildLiveAudioInsightMessages("A discussion about constitutional interpretation.", [], "Law seminar");
assert.match(prompt[0]?.content ?? "", /any subject, discipline/);
assert.match(prompt[0]?.content ?? "", /never assume a biomedical context/i);
assert.equal(formatLiveDuration(65), "1:05");
assert.equal(formatLiveDuration(3_661), "1:01:01");

console.log("live-audio-contract.test.ts OK");
