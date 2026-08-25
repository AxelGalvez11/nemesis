// A labelled diagram makes a fair question and a real card.

import assert from "node:assert/strict";
import { test } from "node:test";

import { occlusionMaskState, type SuggestedBox } from "@nemesis/shared";

import { MAX_OPTIONS, MIN_OPTIONS } from "./chat-check";
import {
  answerSeat,
  canOcclude,
  hiddenShape,
  occlusionCards,
  occlusionChoices,
  occlusionPayload,
  occlusionShapes,
  type LabelledFigure,
} from "./occlusion-from-labels";

/** A box, as vision reports one: fractions of the picture, top-left corner plus size. */
const box = (label: string, x: number, y: number): SuggestedBox => ({ h: 0.06, label, w: 0.12, x, y });

/** A nephron-shaped diagram: six named parts, one of them far from the rest. */
const FIGURE: LabelledFigure = {
  boxes: [
    box("glomerulus", 0.2, 0.2),
    box("Bowman's capsule", 0.24, 0.26),
    box("proximal tubule", 0.3, 0.34),
    box("loop of Henle", 0.5, 0.6),
    box("distal tubule", 0.36, 0.42),
    box("collecting duct", 0.85, 0.88),
  ],
  height: 800,
  src: "https://upload.wikimedia.org/nephron.png",
  width: 1000,
};

test("🔴🔴 a figure with fewer than two labelled parts cannot be occluded", () => {
  // One part occluded leaves nothing to reason from: the question degenerates into "what is this
  // picture called", which is an association and is served elsewhere.
  assert.equal(canOcclude({ ...FIGURE, boxes: [box("only", 0.5, 0.5)] }), false);
  assert.equal(canOcclude({ ...FIGURE, boxes: [] }), false);
  assert.equal(canOcclude(FIGURE), true);
});

test("🔴🔴🔴 whether it can be asked is decided AFTER scaling, not before", () => {
  // 🔴 `scaleBoxes` DROPS BOXES — off the image, too small to see, duplicates of one another. A
  // figure whose suggestions collapse into one surviving mask cannot ask a question, and counting
  // the raw list would have claimed it could, producing a question with no distractors.
  const collapsing: LabelledFigure = {
    ...FIGURE,
    // Two boxes far outside the picture and one real one: only the real one survives.
    boxes: [box("real", 0.4, 0.4), { h: 0.05, label: "gone", w: 0.05, x: 1.5, y: 1.5 }, { h: 0.0001, label: "speck", w: 0.0001, x: 0.1, y: 0.1 }],
  };
  assert.equal(collapsing.boxes.length, 3, "the fixture no longer exercises dropping");
  assert.equal(canOcclude(collapsing), false, "a figure that scales down to one mask claimed it could be asked");
});

test("🔴🔴 a figure with no measured size cannot be occluded", () => {
  // The coordinate space comes from the picture. Without it `OcclusionCardView`'s viewBox is
  // "0 0 0 0" and the card renders as an empty SVG — the empty-framed-box failure again.
  assert.equal(canOcclude({ ...FIGURE, width: 0 }), false);
  assert.equal(canOcclude({ ...FIGURE, height: 0 }), false);
  assert.equal(canOcclude({ ...FIGURE, src: "  " }), false);
});

test("🔴🔴 masks are stable across calls, because a card points at one by id", () => {
  const first = occlusionShapes(FIGURE).map((shape) => shape.id);
  const second = occlusionShapes(FIGURE).map((shape) => shape.id);
  assert.deepEqual(first, second, "the ids changed between two identical calls");
  assert.equal(new Set(first).size, first.length, "two masks share an id");
});

test("🔴 every mask lands inside the picture", () => {
  // `scaleBoxes` owns the clamping; this holds that we are actually going through it rather than
  // multiplying fractions ourselves somewhere.
  for (const shape of occlusionShapes({ ...FIGURE, boxes: [box("edge", 0.95, 0.97), box("other", 0.2, 0.2)] })) {
    assert.ok(shape.x >= 0 && shape.y >= 0, `${shape.label} starts outside the image`);
    assert.ok(shape.x + shape.w <= 1000, `${shape.label} runs past the right edge`);
    assert.ok(shape.y + shape.h <= 800, `${shape.label} runs past the bottom edge`);
  }
});

test("🔴🔴🔴 the distractors are the diagram's own labels, never invented", () => {
  const hidden = hiddenShape(FIGURE, 0)!;
  const options = occlusionChoices(FIGURE, hidden, 0);
  assert.ok(options, "an honest set could not be built from six labelled parts");
  const printed = new Set(FIGURE.boxes.map((entry) => entry.label));
  for (const option of options) {
    assert.ok(printed.has(option.text), `"${option.text}" is not printed on this diagram`);
  }
});

test("🔴🔴🔴 exactly one option is correct, and it is the covered part", () => {
  // Zero correct makes every pick a miss; two makes the learner wrong for choosing a right
  // answer. Both are silent when scored, which is why this is asserted rather than assumed.
  for (let index = 0; index < FIGURE.boxes.length; index += 1) {
    const hidden = hiddenShape(FIGURE, index)!;
    const options = occlusionChoices(FIGURE, hidden, index)!;
    const right = options.filter((option) => option.correct);
    assert.equal(right.length, 1, `"${hidden.label}" produced ${right.length} correct options`);
    assert.equal(right[0]!.text, hidden.label);
  }
});

test("🔴🔴🔴 the answer's seat has no runnable PATTERN, not merely more than one value", () => {
  // 🔴 THE OWNER SPOTTED THE FIRST VERSION ON SCREEN, 2026-08-25: *"it's supposed to be random
  // every time, not just, like, the letter b every single time."* It was `seat % optionCount` —
  // first, second, third, fourth — which passes a naive "does it vary?" check and is still a tell:
  // by the third question a learner who has noticed can answer without looking at the picture.
  const seats = FIGURE.boxes.map((_, index) =>
    occlusionChoices(FIGURE, hiddenShape(FIGURE, index)!, index)!.findIndex((option) => option.correct),
  );
  assert.ok(new Set(seats).size > 1, `the answer sat in seat ${seats[0]} every time`);
  // 🔴 CALIBRATION: restore the rotation and this line reddens. `0,1,2,3…` is exactly what a
  // modulo produces, and it is the thing being banned.
  const rotating = seats.every((seat, index) => seat === index % (seats.length || 1));
  assert.ok(!rotating, `the answer walks down the list in order: ${seats.join(",")}`);

  // …and it is still DETERMINISTIC, so a session replays and this test can pin it.
  const again = FIGURE.boxes.map((_, index) =>
    occlusionChoices(FIGURE, hiddenShape(FIGURE, index)!, index)!.findIndex((option) => option.correct),
  );
  assert.deepEqual(again, seats, "the same question produced a different layout on a second call");
});

test("🔴🔴 every seat gets used across a run of questions", () => {
  // A hash that happened to favour one position would be the old bug wearing a disguise.
  const seen = new Set<number>();
  for (let index = 0; index < 40; index += 1) {
    seen.add(answerSeat(`part ${index}`, index, 4));
  }
  assert.equal(seen.size, 4, `only seats ${[...seen].join(",")} were ever used`);
});

test("🔴 a single-option set puts the answer in the only seat there is", () => {
  assert.equal(answerSeat("anything", 7, 1), 0);
  assert.ok(answerSeat("anything", 7, 3) < 3, "the seat fell outside the options");
});

test("🔴🔴 the distractors are the NEAREST parts, because neighbours are what get confused", () => {
  // "collecting duct" sits at the far corner. Asking about the glomerulus should offer its
  // neighbours, not the distant one, while nearer options exist.
  const hidden = occlusionShapes(FIGURE).find((shape) => shape.label === "glomerulus")!;
  const offered = occlusionChoices(FIGURE, hidden, 0)!.map((option) => option.text);
  assert.ok(offered.includes("Bowman's capsule"), "the closest label was not offered");
  assert.ok(!offered.includes("collecting duct"), "the most distant label crowded out a nearer one");
});

test("🔴 every distractor carries a ground, and the correct option carries none", () => {
  // The type states the asymmetry so a consumer cannot read a distractor's meaning off the right
  // answer. The ground is earned: the picture printed these names as parts of one structure.
  const options = occlusionChoices(FIGURE, hiddenShape(FIGURE, 3)!, 3)!;
  for (const option of options) {
    if (option.correct) assert.equal(option.ground, undefined, "the right answer was given a ground");
    else assert.deepEqual(option.ground, { kind: "neighbouring_class" }, "a distractor has no provenance");
  }
});

test("🔴 the option count stays inside the chip row's bounds", () => {
  const wide: LabelledFigure = {
    ...FIGURE,
    boxes: Array.from({ length: 14 }, (_, i) => box(`part ${i}`, (i % 7) / 8, i < 7 ? 0.1 : 0.6)),
  };
  const options = occlusionChoices(wide, hiddenShape(wide, 0)!, 0)!;
  assert.ok(options.length <= MAX_OPTIONS, `${options.length} options is more than a chip row can hold`);
  assert.ok(options.length >= MIN_OPTIONS);
});

test("🔴🔴 two labelled parts is enough for a question, one is not", () => {
  const pair: LabelledFigure = { ...FIGURE, boxes: [box("anode", 0.2, 0.5), box("cathode", 0.7, 0.5)] };
  assert.equal(occlusionChoices(pair, hiddenShape(pair, 0)!, 0)?.length, 2, "a two-part diagram made no question");
  const lonely: LabelledFigure = { ...FIGURE, boxes: [box("anode", 0.2, 0.5)] };
  const only = hiddenShape(lonely, 0);
  assert.equal(only && occlusionChoices(lonely, only, 0), null, "a one-part diagram produced a question");
});

test("🔴🔴 an unlabelled mask is never the answer to anything", () => {
  // `scaleBoxes` keeps a box whose label came back empty. It can still be drawn as context, but
  // revealing it would show a blank, and offering it as an option would be an unanswerable
  // question.
  const withBlank: LabelledFigure = {
    ...FIGURE,
    boxes: [box("anode", 0.2, 0.5), box("cathode", 0.7, 0.5), { h: 0.05, label: "  ", w: 0.1, x: 0.45, y: 0.2 }],
  };
  for (let index = 0; index < 4; index += 1) {
    assert.ok(hiddenShape(withBlank, index)!.label.trim(), "a blank mask was chosen as the question");
  }
  const options = occlusionChoices(withBlank, hiddenShape(withBlank, 0)!, 0)!;
  assert.ok(options.every((option) => option.text.trim()), "a blank option was offered");
});

test("🔴🔴 a check on one diagram asks about DIFFERENT parts", () => {
  // Four questions that all hide the glomerulus is not a check, it is one question four times.
  const asked = [0, 1, 2, 3].map((index) => hiddenShape(FIGURE, index)!.label);
  assert.equal(new Set(asked).size, 4, `the same part was hidden more than once: ${asked.join(", ")}`);
});

test("🔴🔴🔴 a card covers EVERY part and marks the one being asked about", () => {
  // 🔴🔴 `hide-all` — OWNER, 2026-08-25: *"make it hide all and guess one. thats how it should
  // be."* Anki's own mode name, and right on the merits, which is why the earlier `hide-one` was
  // wrong: the distractors ARE the diagram's other labels, so leaving them legible printed all
  // four wrong answers on the picture. A learner could match the covered box to the one option not
  // visible and never recall anything.
  //
  // Calibration: set this back to "hide-one" and the assertion below reddens.
  const hidden = hiddenShape(FIGURE, 2)!;
  const payload = occlusionPayload(FIGURE, hidden)!;
  assert.equal(payload.mode, "hide-all");
  // The target is still distinguishable, so the learner knows WHICH part is being asked.
  assert.equal(occlusionMaskState(hidden.id, payload, false), "target-covered");
  const sibling = payload.shapes.find((shape) => shape.id !== hidden.id)!;
  assert.equal(occlusionMaskState(sibling.id, payload, false), "covered", "a sibling label is readable");
  assert.equal(payload.shapes.length, occlusionShapes(FIGURE).length, "a card lost the sibling masks it needs");
  assert.equal(payload.targetId, hidden.id);
  assert.equal(payload.width, 1000);
  assert.equal(payload.height, 800);
  assert.equal(payload.image, FIGURE.src);
});

test("🔴🔴 one card per labelled part, and the front never names the answer", () => {
  // The question IS the picture with a box on it. A front reading "glomerulus" would print the
  // answer directly above the box hiding it.
  const cards = occlusionCards(FIGURE);
  assert.equal(cards.length, FIGURE.boxes.length);
  const backs = cards.map((card) => card.back);
  assert.deepEqual(new Set(backs).size, backs.length, "two cards ask about the same part");
  for (const card of cards) {
    assert.ok(!card.front.toLowerCase().includes(card.back.toLowerCase()), `the front gives away "${card.back}"`);
    assert.equal(card.payload.targetId, card.payload.shapes.find((s) => s.label === card.back)?.id);
  }
});

test("🔴 an unoccludable figure yields no cards rather than broken ones", () => {
  assert.deepEqual(occlusionCards({ ...FIGURE, boxes: [] }), []);
  assert.deepEqual(occlusionCards({ ...FIGURE, width: 0 }), []);
});

console.log("occlusion-from-labels.test.ts OK");
