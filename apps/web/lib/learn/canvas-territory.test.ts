import assert from "node:assert/strict";
import { test } from "node:test";

import { readTerritory, sameTopic, territoryReuse, type CanvasTerritory } from "./canvas-territory";
import type { KnowledgeObject } from "./knowledge-types";

// The territory was rebuilt on every open, and it never converged.
//
// 🔴 MEASURED IN PRODUCTION, ON ONE CANVAS AND ONE TOPIC:
//
//     baseline   first open   second open
//     knowledge          2          26           50
//     objectives         4          51           99
//
// All 48 model-provenance identity keys DISTINCT; zero duplicate statements. Each open produced
// roughly 24 genuinely DIFFERENT facts about the same subject, because a model asked the same
// question twice answers it differently. So the growth is unbounded, it is paid for on every open
// of the product's primary entrance, and it dilutes the map it is supposed to be building.
//
// 🔴 THESE TESTS EXIST TO PIN THE ONE DISTINCTION THAT MATTERS: the gate is "we already built one",
// never "we already have this fact". A deduplicate on identity would have let the growth continue
// at a slower rate, which looks like a fix for exactly as long as nobody counts.

const VERSION = 2;

function object(statement: string, identityKey: string): KnowledgeObject {
  return {
    id: identityKey,
    identityKey,
    statement,
    type: "association",
    unanchoredProvenance: ["model"],
  };
}

const built = (over: Partial<CanvasTerritory> = {}): CanvasTerritory => ({
  identityVersion: VERSION,
  objects: [object("Intake stroke draws air in", "k1"), object("Compression stroke raises temperature", "k2")],
  topic: "how a four-stroke diesel engine works",
  ...over,
});

// ── the ordinary two cases ──────────────────────────────────────────────────

test("🔴 a canvas with nothing built asks for a territory — this is the front door and it must stay open", () => {
  // The failure mode this whole file is written against is the OPPOSITE of the bug it fixes: a
  // "build once" gate placed carelessly refuses the first build too, and the learner gets the blank
  // canvas that #563 just repaired.
  assert.deepEqual(territoryReuse({ identityVersion: VERSION, stored: null, topic: "anything" }), {
    miss: "never-built",
    reuse: false,
  });
});

test("re-opening the same canvas reuses what is already there — no second model call", () => {
  const decision = territoryReuse({ identityVersion: VERSION, stored: built(), topic: built().topic });
  assert.equal(decision.reuse, true);
  assert.equal(decision.reuse && decision.objects.length, 2);
});

// ── rename: the case where rebuilding is CORRECT ────────────────────────────

test("🔴 a renamed canvas rebuilds — the alternative is teaching a topic they stopped asking about", () => {
  // This is the asymmetry that sets how clever `sameTopic` may be. An unnecessary rebuild costs one
  // model call. A MISSED rebuild leaves Nemesis quietly answering the old question for ever, and the
  // learner has no way to tell.
  assert.deepEqual(
    territoryReuse({ identityVersion: VERSION, stored: built(), topic: "the doctrine of consideration" }),
    { miss: "topic-renamed", reuse: false },
  );
});

test("🔴 a case-only edit is NOT a new topic — capitalisation must not cost a model call", () => {
  const decision = territoryReuse({
    identityVersion: VERSION,
    stored: built({ topic: "How A Four-Stroke Diesel Engine Works" }),
    topic: "how a four-stroke diesel engine works",
  });
  assert.equal(decision.reuse, true);
});

test("🔴 whitespace is not a new topic either", () => {
  const decision = territoryReuse({
    identityVersion: VERSION,
    stored: built({ topic: "  how a four-stroke   diesel engine works  " }),
    topic: "how a four-stroke diesel engine works",
  });
  assert.equal(decision.reuse, true);
});

// ── calibration: prove the normaliser STOPS where it was told to ────────────

test("🔴 NO STEMMING — a plural is a rebuild, and that is the intended direction of error", () => {
  // If this ever starts passing as a reuse, someone has made `sameTopic` cleverer and it now errs
  // toward NOT rebuilding — the expensive direction to be wrong in.
  assert.equal(sameTopic("diesel engine", "diesel engines"), false);
});

test("🔴 NO STOP-WORD REMOVAL — dropping 'the' is a rebuild", () => {
  assert.equal(sameTopic("the doctrine of consideration", "doctrine of consideration"), false);
});

test("🔴 NO SEMANTIC COMPARISON — two names for the same thing are still two topics", () => {
  assert.equal(sameTopic("compression ignition engine", "diesel engine"), false);
});

test("case and whitespace, and those are genuinely handled", () => {
  assert.equal(sameTopic("  Tort   Law ", "tort law"), true);
});

// ── the distinction the whole fix rests on ──────────────────────────────────

test("🔴 REUSE IS DECIDED BY 'ALREADY BUILT', NEVER BY 'ALREADY HAVE THIS FACT'", () => {
  // The measured growth was 48 DISTINCT facts, so a deduplicate on identity would have dropped
  // nothing and the pile would have kept growing. This asserts the gate does not look at content at
  // all: a stored territory whose objects have nothing in common with any other is still a reuse,
  // because the question asked is about the CANVAS, not about the facts.
  const nothingInCommon = built({ objects: [object("something else entirely", "zzz")] });
  const decision = territoryReuse({ identityVersion: VERSION, stored: nothingInCommon, topic: built().topic });
  assert.equal(decision.reuse, true, "the gate must not be a content comparison");
});

test("🔴 an identity-version bump rebuilds rather than replaying under keys that no longer converge", () => {
  assert.deepEqual(territoryReuse({ identityVersion: 3, stored: built({ identityVersion: 2 }), topic: built().topic }), {
    miss: "identity-version-changed",
    reuse: false,
  });
});

// ── what comes out of a jsonb column is never trusted ───────────────────────

test("🔴 AN EMPTY TERRITORY IS A MISS — a cache must never be able to trap a learner", () => {
  // If an empty one were ever readable, the replay would resolve no objectives and the marker would
  // keep insisting the canvas had been built. Blank on every open, for ever: the exact shape of the
  // front-door bug this sits next to.
  assert.equal(readTerritory({ identityVersion: 2, objects: [], topic: "x" }), null);
});

test("anything unrecognised in the column reads as 'build one', never as 'nothing to teach'", () => {
  for (const bad of [
    null,
    undefined,
    "a string",
    42,
    {},
    { identityVersion: 2, objects: [{}] },
    { objects: [{}], topic: "x" },
    { identityVersion: "2", objects: [{}], topic: "x" },
    { identityVersion: 2, objects: "not an array", topic: "x" },
    { identityVersion: 2, objects: [{}], topic: "   " },
  ]) {
    assert.equal(readTerritory(bad), null, `should not be usable: ${JSON.stringify(bad)}`);
  }
});

test("a well-formed column round-trips", () => {
  const stored = readTerritory(JSON.parse(JSON.stringify(built())));
  assert.ok(stored);
  assert.equal(stored.topic, built().topic);
  assert.equal(stored.identityVersion, VERSION);
  assert.equal(stored.objects.length, 2);
});

// ── the standing field-agnostic check ───────────────────────────────────────

test("🔴 the same rules serve a law student and a mechanical engineer", () => {
  // Nothing here inspects the subject. Both reuse on a reopen and both rebuild on a rename, and no
  // branch anywhere looks at what the topic is ABOUT.
  for (const topic of ["the rule against perpetuities", "shear stress in a cantilever beam"]) {
    assert.equal(territoryReuse({ identityVersion: VERSION, stored: built({ topic }), topic }).reuse, true);
    assert.equal(
      territoryReuse({ identityVersion: VERSION, stored: built({ topic }), topic: `${topic} in practice` }).reuse,
      false,
    );
  }
});
