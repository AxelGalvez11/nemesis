import assert from "node:assert/strict";
import { test } from "node:test";

import {
  frozenTopic,
  groundedReuse,
  materialSubject,
  readTerritory,
  territoryReuse,
  type CanvasTerritory,
} from "./canvas-territory";
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
  assert.deepEqual(territoryReuse({ identityVersion: VERSION, stored: null }), {
    miss: "never-built",
    reuse: false,
  });
});

test("re-opening the same canvas reuses what is already there — no second model call", () => {
  const decision = territoryReuse({ identityVersion: VERSION, stored: built() });
  assert.equal(decision.reuse, true);
  assert.equal(decision.reuse && decision.objects.length, 2);
});

// ── rename: FILING MUST NOT CHANGE WHAT IS TAUGHT ───────────────────────────
//
// 🔴 THIS INVERTS AN EARLIER RULING, DELIBERATELY. The first version of this file rebuilt on a
// rename, on the reasoning that a learner who renames wants different material. That was decided
// before rename became a LIBRARY operation. The Library lets a learner tidy their shelf — and on a
// topic-first canvas the title IS the topic, so rebuilding would let reorganising sessions silently
// re-topic what Nemesis teaches next. No import of the policy runtime is needed for that; the
// channel is the name itself.

test("🔴 RENAMING A CANVAS DOES NOT CHANGE WHAT IT TEACHES — the Library case", () => {
  // A learner tidying "how a four-stroke diesel engine works" into "Diesel — week 3" is filing, not
  // re-requesting. The territory is untouched and no model is called.
  const decision = territoryReuse({ identityVersion: VERSION, stored: built() });
  assert.equal(decision.reuse, true, "a rename must never reach the constructor");
  assert.equal(frozenTopic({ stored: built(), title: "Diesel — week 3" }), built().topic);
});

test("🔴 the topic is frozen at the FIRST build, and the title is only a label afterwards", () => {
  assert.equal(
    frozenTopic({ stored: built({ topic: "the rule against perpetuities" }), title: "anything at all" }),
    "the rule against perpetuities",
  );
});

test("🔴 before anything is built, the TITLE is the topic — otherwise nothing could ever be built", () => {
  // The other half, and the one that keeps the front door open: with no stored territory the typed
  // title is what gets constructed. A freeze that also froze the first build would be the blank
  // canvas again.
  assert.equal(frozenTopic({ stored: null, title: "  shear stress in a cantilever beam  " }), "shear stress in a cantilever beam");
});

test("a canvas with neither a stored topic nor a title has nothing to work from", () => {
  assert.equal(frozenTopic({ stored: null, title: "   " }), "");
});

test("🔴 an identity-version rebuild uses the FROZEN topic, not the current title", () => {
  // The rebuild reproduces the subject this canvas has always been about, under the new keys.
  // Reading the title here would let a rename smuggle a new subject in through a version bump.
  const stored = built({ identityVersion: 1 });
  assert.equal(territoryReuse({ identityVersion: 2, stored }).reuse, false);
  assert.equal(frozenTopic({ stored, title: "a completely different subject" }), stored.topic);
});

// ── the distinction the whole fix rests on ──────────────────────────────────

test("🔴 REUSE IS DECIDED BY 'ALREADY BUILT', NEVER BY 'ALREADY HAVE THIS FACT'", () => {
  // The measured growth was 48 DISTINCT facts, so a deduplicate on identity would have dropped
  // nothing and the pile would have kept growing. This asserts the gate does not look at content at
  // all: a stored territory whose objects have nothing in common with any other is still a reuse,
  // because the question asked is about the CANVAS, not about the facts.
  const nothingInCommon = built({ objects: [object("something else entirely", "zzz")] });
  const decision = territoryReuse({ identityVersion: VERSION, stored: nothingInCommon });
  assert.equal(decision.reuse, true, "the gate must not be a content comparison");
});

test("🔴 an identity-version bump rebuilds rather than replaying under keys that no longer converge", () => {
  assert.deepEqual(territoryReuse({ identityVersion: 3, stored: built({ identityVersion: 2 }) }), {
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
    assert.equal(territoryReuse({ identityVersion: VERSION, stored: built({ topic }) }).reuse, true);
    assert.equal(territoryReuse({ identityVersion: VERSION, stored: null }).reuse, false);
    assert.equal(frozenTopic({ stored: built({ topic }), title: "renamed while tidying" }), topic);
  }
});

// ── grounded territories: the same build-once guarantee, over material ───────────────────────────

test("🔴 a document canvas builds its territory ONCE, for the same measured reason", () => {
  // A model reading a lecture samples it differently every time, exactly as it does a topic — over
  // a larger and more expensive input. Without this, every open re-reads the whole document.
  const stored: CanvasTerritory = {
    identityVersion: VERSION,
    objects: [object("beta cells — insulin", "k-1")],
    topic: materialSubject(["lib-a"]),
  };

  assert.deepEqual(groundedReuse({ identityVersion: VERSION, stored, subject: materialSubject(["lib-a"]) }), {
    objects: stored.objects,
    reuse: true,
  });
  assert.deepEqual(groundedReuse({ identityVersion: VERSION, stored: null, subject: materialSubject(["lib-a"]) }), {
    miss: "never-built",
    reuse: false,
  });
  assert.deepEqual(groundedReuse({ identityVersion: VERSION + 1, stored, subject: materialSubject(["lib-a"]) }), {
    miss: "identity-version-changed",
    reuse: false,
  });
});

test("🔴 attaching a SECOND lecture rebuilds, and this is where the two lanes diverge on purpose", () => {
  // 🔴 `territoryReuse` DELIBERATELY IGNORES THE TOPIC and this one deliberately does not, and the
  // difference is not an inconsistency. On a topic canvas the subject IS the title, and renaming is
  // a filing action whose intent cannot be read — so re-topicking on a rename would silently change
  // what a learner is taught because they tidied their shelf. Material carries no such ambiguity:
  // attaching a lecture is not filing, it is new material, and a canvas that kept teaching only the
  // first document would ignore what the learner just handed it.
  const stored: CanvasTerritory = {
    identityVersion: VERSION,
    objects: [object("beta cells — insulin", "k-1")],
    topic: materialSubject(["lib-a"]),
  };

  assert.deepEqual(groundedReuse({ identityVersion: VERSION, stored, subject: materialSubject(["lib-a", "lib-b"]) }), {
    miss: "material-changed",
    reuse: false,
  });

  // And the ORDER the learner attached them in is not a different subject.
  assert.equal(materialSubject(["lib-b", "lib-a"]), materialSubject(["lib-a", "lib-b"]));

  // The topic lane keeps its own rule, unchanged: a rename never rebuilds.
  assert.equal(territoryReuse({ identityVersion: VERSION, stored }).reuse, true);
});
