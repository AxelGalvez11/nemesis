import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { frozenTopic, materialSubject, readTerritory, territoryReuse, type CanvasTerritory } from "./canvas-territory";
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
  // If a BARE empty one were readable, the replay would resolve no objectives and the marker would
  // keep insisting the canvas had been built. Blank on every open, for ever: the exact shape of the
  // front-door bug this sits next to. An empty list with no explanation is that shape.
  assert.equal(readTerritory({ identityVersion: 2, objects: [], topic: "x" }), null);
});

// ── a build that found nothing is an answer, and it expires ─────────────────

test("🔴🔴 'we looked and there was nothing' is recordable, so it is not paid for on every open", () => {
  // 🔴 THE COST THIS FIXES, PRECISELY. The marker is written last and only on a build that resolved
  // something, so a document neither lane could read left NO trace — and every reopen ran the model
  // again to reach the same empty page. Two calls per open, once the causal lane joined the pair one.
  const stored = readTerritory({ emptyUnder: "causal/1+territory/1", identityVersion: 2, objects: [], topic: "sources:lib-1" });
  assert.ok(stored, "an empty territory that says WHY it is empty is a real answer, not a broken row");
  assert.equal(stored!.emptyUnder, "causal/1+territory/1");

  const decision = territoryReuse({ identityVersion: 2, rules: "causal/1+territory/1", stored });
  assert.equal(decision.reuse, "known-empty");
  assert.equal("objects" in decision, false, "there is nothing to replay, and it must not look like there is");
});

test("🔴 and it EXPIRES when the rules change, so a better extractor still reaches the document", () => {
  // 🔴 THE HALF A BOOLEAN WOULD HAVE GOT WRONG. "We tried" would have bought the same saving and
  // then locked those documents out permanently — every future improvement unable to reach exactly
  // the material that most needed it. The stored answer names the rules it was reached under, and
  // stops applying when they move.
  const stored = readTerritory({ emptyUnder: "causal/1+territory/1", identityVersion: 2, objects: [], topic: "sources:lib-1" });
  const decision = territoryReuse({ identityVersion: 2, rules: "causal/2+territory/1", stored });
  assert.equal(decision.reuse, false);
  assert.equal(decision.reuse === false ? decision.miss : null, "empty-under-older-rules");
});

test("🔴 a caller that tracks no rules never suppresses a rebuild", () => {
  // Absent `rules` can only cause a build, never skip one. The topic lane passes none, and a topic
  // can always be asked again — so the conservative direction is the correct one there too.
  const stored = readTerritory({ emptyUnder: "causal/1", identityVersion: 2, objects: [], topic: "t" });
  assert.equal(territoryReuse({ identityVersion: 2, stored }).reuse, false);
});

test("🔴 a row claiming to be both a territory and the absence of one is refused", () => {
  // Every consumer would have to pick which half to believe, and they would not all pick the same.
  assert.equal(
    readTerritory({ emptyUnder: "causal/1", identityVersion: 2, objects: [{ id: "k1" }], topic: "t" }),
    null,
  );
  // And a blank stamp is not a stamp.
  assert.equal(readTerritory({ emptyUnder: "   ", identityVersion: 2, objects: [], topic: "t" }), null);
});

test("🔴 an identity-version change still outranks a stored empty answer", () => {
  // Keys that no longer converge matter more than rules that moved: a version rebuild must not be
  // pre-empted by a stale empty marker, or those objects never come back under the new keys.
  const stored = readTerritory({ emptyUnder: "causal/1", identityVersion: 2, objects: [], topic: "t" });
  const decision = territoryReuse({ identityVersion: 3, rules: "causal/1", stored });
  assert.equal(decision.reuse === false ? decision.miss : null, "identity-version-changed");
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

// ── the label a grounded territory is filed under ───────────────────────────────────────────────

test("🔴 material names a subject the same way whatever order it was attached in", () => {
  // The marker needs a non-empty string or `readTerritory` rejects the row, and for a document
  // canvas the honest value is the material it was built from. Durable ids, never the title: every
  // canvas calls its first attachment "s1", and a title is a label a learner may change.
  assert.equal(materialSubject(["lib-b", "lib-a"]), materialSubject(["lib-a", "lib-b"]));
  assert.match(materialSubject(["lib-a"]), /^sources:/);
});

test("🔴 build-once for a document canvas is enforced by the CALLER, not by a gate in the builder", () => {
  // 🔴 THIS TEST REPLACES ONE THAT WAS GREEN ON A BRANCH NOTHING COULD REACH.
  //
  // There was a `groundedReuse` here that compared the stored subject against the current material
  // and reported `material-changed`, and a test asserting that "attaching a SECOND lecture
  // rebuilds". Both passed. Neither was reachable: `ensureKnowledgeForCanvas` replays any stored
  // territory BEFORE calling the grounded builder and only calls it when that replay produced
  // nothing, so a canvas with a stored territory never arrives there and the comparison never runs.
  //
  // A dead branch that reads like a freshness check is worse than no check, because it documents a
  // behaviour the product does not have. It is deleted, and the real rule is asserted where it
  // actually lives — see `canvas-knowledge.test.ts`, "the fallback does not run when the canvas
  // already has a territory to carry".
  const territory = readFileSync(new URL("./canvas-territory.ts", import.meta.url), "utf8");
  const knowledge = readFileSync(new URL("./canvas-knowledge.ts", import.meta.url), "utf8");

  assert.doesNotMatch(territory, /groundedReuse/, "no unreachable second reuse rule may come back");
  assert.doesNotMatch(territory, /material-changed/, "nor a miss reason nothing can report");
  assert.match(knowledge, /carried\.length === 0/, "the real gate is the caller's carried territory");
});
