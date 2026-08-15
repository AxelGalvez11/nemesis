import assert from "node:assert/strict";

import { matchExpectedElements } from "./match-elements";
import type { HandwritingObservation } from "./types";

function observation(over: Partial<HandwritingObservation> = {}): HandwritingObservation {
  return {
    abstained: false,
    abstentionReason: null,
    items: [],
    model: "test-model",
    spatialRelations: [],
    transcription: "",
    transcriptionConfidence: 0.9,
    ...over,
  };
}

// --- present: a confident reading containing the expected words -------------

{
  const [match] = matchExpectedElements(
    observation({ transcription: "The mitochondria produces ATP for the cell." }),
    ["mitochondria"],
  );
  assert.equal(match!.presence, "present");
  assert.ok(match!.evidenceQuote, "🔴 a present match must always carry a quote — see types.ts");
}

// A paraphrase — different words, overlapping meaning — still counts as present. This is the
// whole reason PRESENT_THRESHOLD is not 1.0: a learner's own phrasing must not be punished for
// dropping one word of a multi-word cue.
{
  const [match] = matchExpectedElements(
    observation({ transcription: "sodium ions move into the cell" }),
    ["sodium enters the cell"],
  );
  assert.equal(match!.presence, "present", "a close paraphrase must still match");
}

// evidenceQuote prefers the specific item that matched over the whole transcription.
{
  const [match] = matchExpectedElements(
    observation({
      items: [
        { confidence: 0.9, kind: "text", text: "glomerulus" },
        { confidence: 0.9, kind: "text", text: "unrelated label" },
      ],
      transcription: "glomerulus\nunrelated label",
    }),
    ["glomerulus"],
  );
  assert.equal(match!.evidenceQuote, "glomerulus", "the quote should be the specific item, not the whole page");
}

// --- absent: only earned by a trustworthy reading with zero overlap ---------

{
  const [match] = matchExpectedElements(
    observation({ transcription: "The heart pumps blood through four chambers." }),
    ["mitochondria"],
  );
  assert.equal(match!.presence, "absent");
  assert.equal(match!.evidenceQuote, null);
}

// --- 🔴 CALIBRATION: "unclear" is the default; "absent" must not survive an untrustworthy read --
//
// Break this by deleting the `readingIsTrustworthy` condition in match-elements.ts (so "absent"
// only requires zero overlap) — every case below reddens, because each one has zero overlap and
// would then be misreported as "absent" instead of "unclear".

{
  // Abstained: we do not know what, if anything, was written.
  const [match] = matchExpectedElements(
    observation({ abstained: true, transcription: "" }),
    ["mitochondria"],
  );
  assert.equal(match!.presence, "unclear", "an abstained observation must never produce absent");
}
{
  // Low confidence: the reading itself cannot be trusted, so silence proves nothing.
  const [match] = matchExpectedElements(
    observation({ transcription: "completely unrelated text", transcriptionConfidence: 0.2 }),
    ["mitochondria"],
  );
  assert.equal(match!.presence, "unclear", "a low-confidence reading must never produce absent");
}
{
  // Nothing was transcribed at all — an empty page is not evidence of anything.
  const [match] = matchExpectedElements(observation({ transcription: "" }), ["mitochondria"]);
  assert.equal(match!.presence, "unclear");
}

// --- unclear: partial overlap that clears neither bar -----------------------

{
  // "sodium potassium pump" vs a transcription containing only "sodium" — one of three
  // significant words is below PRESENT_THRESHOLD (0.6), and matchedWords is non-empty so the
  // absent branch cannot fire either.
  const [match] = matchExpectedElements(
    observation({ transcription: "sodium moves across the membrane" }),
    ["sodium potassium pump"],
  );
  assert.equal(match!.presence, "unclear");
  assert.equal(match!.evidenceQuote, null);
}

// --- an expected element with nothing to compare is unclear, not a guess ----

{
  const [match] = matchExpectedElements(observation({ transcription: "anything at all" }), ["   "]);
  assert.equal(match!.presence, "unclear");
}

// --- every expected element gets its own independent row --------------------

{
  const matches = matchExpectedElements(
    observation({ transcription: "the nucleus contains the chromosomes" }),
    ["nucleus", "mitochondria", "ribosome"],
  );
  assert.equal(matches.length, 3);
  assert.equal(matches[0]!.presence, "present");
  assert.equal(matches[1]!.presence, "absent");
  assert.equal(matches[2]!.presence, "absent");
}

console.log("handwriting/match-elements.test.ts OK");
