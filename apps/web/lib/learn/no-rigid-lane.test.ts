// Teaching happens in the conversation, and the conversation can reach every drawing tool.
//
// 🔴🔴 THIS FILE EXISTS BECAUSE BOTH HALVES FAILED SILENTLY AND AT THE SAME TIME, AND NEITHER
// FAILURE COULD BE SEEN FROM THE CODE. On 2026-08-24 the owner asked for every tool to be verified
// in the real app. Three things came back:
//
//   "Plot y = x² − 4"          → the literal text "[figure 1]", no plot.
//   "Draw the circuit …"       → the correct 320 Ω, described in words, no circuit.
//   "Teach me female anatomy"  → a real lesson from 31 sources that wrote
//                                "[figure: relationship diagram of the female reproductive
//                                organs…]" — a PROSE DESCRIPTION of the picture it wanted —
//                                against an atlas that resolves "uterus" in microseconds.
//
// Nothing was broken. Every renderer worked; the stored 1.4 MB lesson simply held no visuals at
// all, because the two prompts the conversation actually uses offered eight kinds and zero kinds
// respectively. And the lesson never became blocks, so flashcards, notes and slides all refused
// with "There's nothing on the canvas to make cards from yet" on a canvas that had just taught.
//
// The owner's ruling was to remove the rigid lane entirely — "it turns from the natural flowing
// conversational interface that we like, and then it just suddenly goes into this super rigid
// teaching flow" — and to make sure every tool is reachable from the conversation. These are the
// guards for that decision. A renderer added without a line in `turn-router.ts` fails here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { emptyCanvas } from "./canvas-model";
import { canvasHasMaterial } from "./canvas-deliverables";

const ROUTER = readFileSync(new URL("./turn-router.ts", import.meta.url), "utf8");
const TEACHING = readFileSync(new URL("./canvas-prompts.ts", import.meta.url), "utf8");
const SESSION = readFileSync(
  new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url),
  "utf8",
);

test("🔴 the conversation is offered EVERY kind the teaching prompt knows", () => {
  // 🔴 THE TWO LANES ARE TIED TO EACH OTHER RATHER THAN TO A LIST I MAINTAIN HERE. A third copy of
  // the vocabulary would rot exactly the way the second one did; instead the teaching prompt — the
  // one that has always been complete — IS the expectation. Add a kind there and this fails until
  // the conversation is told about it too.
  const kinds = [...TEACHING.matchAll(/"kind":"([a-z_-]+)"/g)]
    .map((match) => match[1] ?? "")
    .filter((kind) => kind && kind !== "explain");
  assert.ok(kinds.length >= 15, `only ${kinds.length} kinds found in the teaching prompt`);
  for (const kind of new Set(kinds)) {
    assert.ok(
      ROUTER.includes(kind),
      `the conversation is never told about "${kind}" — it cannot draw one, however completely it is built`,
    );
  }
});

test("🔴 a named topic is taught in the conversation, never handed to a lane that seizes the screen", () => {
  // The prompt half: "study" must not be sold as the way to teach or quiz a subject.
  const study = ROUTER.slice(ROUTER.indexOf('"study" edits the study document'));
  assert.ok(
    /Do NOT choose it merely because a subject was named/.test(study),
    "the router no longer steers teaching requests away from the conversation",
  );
  assert.ok(
    !/Choosing "study" with a topic makes Nemesis go and/.test(ROUTER),
    "the sentence that pushed every bare topic into the rigid lane is back",
  );
});

test("🔴 …and the RULE is in the code, not only in the prompt", () => {
  // 🔴🔴 THE PROMPT IS A REQUEST; THIS IS THE RULE. A model that answers "study" anyway on an empty
  // canvas must get a conversation, not a takeover — otherwise the whole removal rests on the
  // model behaving, which is exactly how the old behaviour survived four days of being wrong.
  assert.ok(
    /decision\.then === "study" && !isPreContent\(/.test(SESSION),
    "the study branch no longer refuses an empty canvas — a topic can start a rigid lesson again",
  );
  const branch = SESSION.slice(
    SESSION.indexOf('decision.then === "study" && !isPreContent('),
    SESSION.indexOf("[command, requireUid]"),
  );
  assert.ok(
    !branch.includes("begin("),
    "the conversation can start the laid-out lesson again; only `learnFromAside` may do that",
  );
});

test("🔴 flashcards, notes and slides build from what was SAID, not only from blocks", () => {
  // The owner's ruling: these are "general things that a general chat AI should be able to do".
  // A canvas that has taught something in conversation has material, even with no blocks at all.
  const empty = emptyCanvas("c1", "2026-08-24T00:00:00.000Z");
  assert.equal(canvasHasMaterial(empty), false, "an empty canvas still refuses, and should");

  const talked = {
    ...empty,
    moments: [
      {
        id: "m1",
        occurredAt: "2026-08-24T00:00:00.000Z",
        kind: "assistant" as const,
        userText: "Teach me the uterus",
        assistantText: "The uterus has a fundus, a body and a cervix…",
      },
    ],
  };
  assert.equal(
    canvasHasMaterial(talked),
    true,
    "a canvas that taught in conversation still reports nothing to make cards from",
  );
});
