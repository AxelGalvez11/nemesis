// The six passes have to be able to SEE the JSON, and for days they could not.
//
// 🔴🔴🔴 THIS IS THE TEST FOR THE MOST EXPENSIVE SILENT FAILURE THIS LANE HAS HAD. `prepareAnswer`
// hands each pass the model's text and every pass is `JSON.parse(text)`-or-give-up — correct while
// a turn WAS a JSON envelope. Then the turn contract changed to a fenced ```json block FOLLOWED BY
// PROSE (so the model could write `$$\frac{x^3}{3}$$` without JSON escaping mangling it), and from
// that moment `JSON.parse` threw on every conversational turn. Each pass took its
// "nothing to walk means nothing to do" branch and returned the text untouched.
//
// Nothing errored anywhere. The passes returned the input; the validator then correctly refused the
// unresolved figures ("a surface draws only from a computed grid, and this one has none"); and the
// `[figure n]` marker was correctly left in the prose so the learner could see something was meant
// to be there. Three layers each doing the safe thing added up to: no pictures, ever, in chat.
// Measured on production 2026-08-24 across a plot, a circuit and the anatomy atlas.
//
// So the guard is on the SHAPE, with a stubbed route: given what the model actually writes, does a
// formula come back as points? Anything that breaks the unwrapping fails here rather than shipping.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { prepareAnswer } from "./answer-prepare";
import { decisionOrReply } from "./turn-router";

/** A formula series is the cheapest pass to exercise and the one that proves the walk ran. */
const DECISION = {
  then: "reply",
  topic: "parabola",
  milestones: [],
  needsWeb: false,
  visuals: [
    {
      kind: "quantitative",
      learningGoal: "see the shape",
      xLabel: "x",
      yLabel: "y",
      series: [{ label: "y = x^2 - 4", expression: "x^2 - 4", from: -4, to: 4 }],
    },
  ],
};

/** What the model actually writes: the block, then the answer as ordinary prose. */
const AS_WRITTEN = `\`\`\`json\n${JSON.stringify(DECISION)}\n\`\`\`\n\nHere's the graph of $y = x^2 - 4$:\n\n[figure 1]`;

/** The plot route, stubbed — this is a test about the WALK, not about the arithmetic. */
function stubbedRoute() {
  const points = Array.from({ length: 41 }, (_, index) => {
    const x = -4 + index * 0.2;
    return { x, y: x * x - 4 };
  });
  return {
    plots: {
      fetch: async () =>
        new Response(JSON.stringify({ results: [{ ok: true, segments: [{ points }] }] }), {
          headers: { "content-type": "application/json" },
        }),
    },
  } as never;
}

test("🔴🔴🔴 a formula inside a FENCED block becomes points — the passes can see the JSON", async () => {
  const out = await prepareAnswer(AS_WRITTEN, stubbedRoute());
  assert.ok(out.includes('"points"'), "the plot pass never ran — every figure in chat is silently unresolved");
  const read = decisionOrReply(out);
  assert.equal(read?.visuals.length, 1, "the computed figure did not survive validation");
  assert.equal(read?.visuals[0]?.kind, "quantitative");
});

test("🔴 …and the prose around it is returned untouched", () => {
  // The text outside the block IS the answer the learner reads. It is not JSON and no pass here has
  // any business rewriting it — a pass that reformatted it would be editing Nemesis's words.
  return prepareAnswer(AS_WRITTEN, stubbedRoute()).then((out) => {
    assert.ok(out.includes("Here's the graph of $y = x^2 - 4$:"), "the answer's prose was altered");
    assert.ok(out.includes("[figure 1]"), "the figure marker was lost, so the drawing has nowhere to land");
    assert.ok(out.startsWith("```json"), "the block is no longer where the decision parser looks for it");
  });
});

test("🔴 bare JSON still works, because a lesson job answers with exactly that", async () => {
  const out = await prepareAnswer(JSON.stringify(DECISION), stubbedRoute());
  assert.ok(out.includes('"points"'), "unwrapping the fence broke the envelope that never had one");
});

test("🔴 prose with no block is returned unchanged rather than mangled", async () => {
  const prose = "No JSON here at all, just an answer.";
  assert.equal(await prepareAnswer(prose, stubbedRoute()), prose);
});

test("🔴🔴 the two files look for the SAME block", () => {
  // 🔴 THE WHOLE BUG IN ONE LINE: `turn-router.ts` reads the decision out of this block and
  // `answer-prepare.ts` has to hand the passes the identical bytes. Two patterns that drift apart
  // resolve a turn in one shape and parse it in another — which is a subtler version of the failure
  // above, and just as quiet. Same literal, asserted from the source of both.
  const pattern = /const DECISION_BLOCK = (\/.*\/);/;
  const router = pattern.exec(readFileSync(new URL("./turn-router.ts", import.meta.url), "utf8"));
  const prepare = pattern.exec(readFileSync(new URL("./answer-prepare.ts", import.meta.url), "utf8"));
  assert.ok(router?.[1], "turn-router.ts no longer declares DECISION_BLOCK");
  assert.ok(prepare?.[1], "answer-prepare.ts no longer declares DECISION_BLOCK");
  assert.equal(prepare?.[1], router?.[1], "the two files disagree about where the decision block is");
});
