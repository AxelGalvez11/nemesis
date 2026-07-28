import assert from "node:assert/strict";
import test from "node:test";

import {
  createSilenceGate,
  describeSilenceSkipped,
  gateThreshold,
  MAX_NOISE_FLOOR,
  MIN_THRESHOLD,
  SILENCE_HOLD_MS,
  stepSilenceGate,
  WARMUP_MS,
  type SilenceGate,
} from "./silence-gate";

const TICK = 100;

/** Feed a constant level for `ms` and hand back the resulting gate. */
function run(gate: SilenceGate, level: number, ms: number): SilenceGate {
  let next = gate;
  for (let elapsed = 0; elapsed < ms; elapsed += TICK) next = stepSilenceGate(next, level, TICK);
  return next;
}

test("a gate starts capturing — silence has to be proven, not assumed", () => {
  assert.equal(createSilenceGate().capturing, true);
});

// The whole feature is destructive: audio the gate drops is gone. So the
// opening seconds are never paused, however quiet they are.
test("nothing is dropped during the warm-up", () => {
  const gate = run(createSilenceGate(), 0, WARMUP_MS - TICK);
  assert.equal(gate.capturing, true, "still capturing while the floor is still learning");
});

test("sustained quiet pauses, but only after the hold", () => {
  const warm = run(createSilenceGate(), 0.4, WARMUP_MS);
  assert.equal(warm.capturing, true);

  const brief = run(warm, 0, SILENCE_HOLD_MS - 2 * TICK);
  assert.equal(brief.capturing, true, "a pause for breath is not the end of the lecture");

  const sustained = run(brief, 0, 3 * TICK);
  assert.equal(sustained.capturing, false);
});

// Resuming late clips the front of a word; resuming early costs a tenth of a
// second of room tone. The trade is deliberate and this pins it.
test("sound resumes capture on the very first sample", () => {
  const paused = run(run(createSilenceGate(), 0.4, WARMUP_MS), 0, SILENCE_HOLD_MS + TICK);
  assert.equal(paused.capturing, false);
  const resumed = stepSilenceGate(paused, 0.5, TICK);
  assert.equal(resumed.capturing, true);
});

// A lecturer pausing between sentences must not chop the recording to pieces.
test("normal speech rhythm never pauses the recorder", () => {
  let gate = run(createSilenceGate(), 0.35, WARMUP_MS);
  for (let sentence = 0; sentence < 12; sentence += 1) {
    gate = run(gate, 0.35, 2_000);          // a sentence
    gate = run(gate, 0.004, 900);           // the breath after it
    assert.equal(gate.capturing, true, `sentence ${sentence} was cut`);
  }
});

test("the threshold never drops below the absolute floor", () => {
  assert.equal(gateThreshold(0), MIN_THRESHOLD);
  assert.ok(gateThreshold(MAX_NOISE_FLOOR) > MIN_THRESHOLD);
});

// Speech must not drag the floor up behind it — a floor that chased the signal
// would raise the bar until the speaker's own voice counted as silence.
test("a loud room cannot push the floor past its cap", () => {
  const gate = run(createSilenceGate(), 1, 120_000);
  assert.ok(gate.noiseFloor <= MAX_NOISE_FLOOR + 1e-9, `floor ran to ${gate.noiseFloor}`);
  assert.equal(gate.capturing, true, "two minutes of speech is not silence");
});

// A hissy lecture hall reads as a constant low level. The floor should learn it
// so that voice still clears the bar, rather than treating hiss as speech.
test("room tone is learned, so a noisy hall still gates", () => {
  let gate = createSilenceGate();
  gate = run(gate, 0.02, 20_000);
  assert.ok(gate.noiseFloor < 0.03, `floor did not settle: ${gate.noiseFloor}`);
  gate = run(gate, 0.02, SILENCE_HOLD_MS + TICK);
  assert.equal(gate.capturing, false, "steady hiss with no voice should not be recorded");
  assert.equal(stepSilenceGate(gate, 0.3, TICK).capturing, true, "a voice over the hiss resumes it");
});

test("garbage samples cannot break the gate", () => {
  const gate = createSilenceGate();
  for (const bad of [Number.NaN, Infinity, -1, 5]) {
    const next = stepSilenceGate(gate, bad as number, TICK);
    assert.ok(Number.isFinite(next.noiseFloor), `floor went non-finite on ${bad}`);
    assert.ok(next.noiseFloor >= 0 && next.noiseFloor <= MAX_NOISE_FLOOR);
  }
  assert.equal(stepSilenceGate(gate, 0.5, Number.NaN).totalMs, 0, "a bad tick advances nothing");
});

// Below a minute the number reads as the feature not working rather than as an
// honest report, so it is not shown at all.
test("the skipped line only appears when there is something worth saying", () => {
  assert.equal(describeSilenceSkipped(60_000, 45_000), null, "15s is noise");
  assert.equal(describeSilenceSkipped(3_600_000, 3_540_000), "1 minute of quiet skipped");
  assert.equal(describeSilenceSkipped(3_600_000, 2_700_000), "15 minutes of quiet skipped");
  assert.equal(describeSilenceSkipped(600_000, 600_000), null, "nothing skipped, nothing said");
});
