import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MAX_JUDGED, readRelevanceChoice, relevancePrompt } from "./figure-relevance";

// The six measurements that made this module necessary, taken against the live provider on
// 2026-09-04 with the shipped licence gate in front of it. Every one of these cleared `chooseAsset`:
// the licences really are fine, and three of the pictures are still wrong.
const MEASURED = [
  { concept: "DNA double helix", caption: "The DNA double helix, with base pairing between the two strands.", depicts: true },
  { concept: "mitosis stages", caption: "A diagram of mitosis stages: interphase, prophase, prometaphase, metaphase", depicts: true },
  { concept: "four stroke engine cycle", caption: "Animated scheme of a four stroke internal combustion engine, Otto principle", depicts: true },
  { concept: "the doctrine of precedent", caption: "page1-1280px-Kant_-_Doctrine_du_droit.djvu.jpg", depicts: false },
  { concept: "consideration in contract law", caption: '"The Consideration of a Contract. No. I" is an article from a href="/s', depicts: false },
  { concept: "shear force diagram", caption: "Simple skin stringer model with applied transverse shear force and dim", depicts: false },
];

test("🔴 the prompt puts every candidate in front of the model, numbered from one", () => {
  const prompt = relevancePrompt("mitosis stages", [{ caption: "a diagram of mitosis" }, { title: "Mitosis_Stages.svg" }]);
  assert.match(prompt, /1\. a diagram of mitosis/);
  // A candidate with no caption still has to be judgeable, or it is silently the one never chosen.
  assert.match(prompt, /2\. Mitosis_Stages\.svg/);
  assert.match(prompt, /A learner is being shown a picture of: mitosis stages/);
});

test("🔴🔴 the prompt offers a way out, and names the exact wrong answers we measured", () => {
  // 🔴 A JUDGE WITH NO "none" PICKS THE LEAST BAD OPTION, which on "the doctrine of precedent"
  // means picking Kant. The escape has to be stated, and the shapes of wrong answer we actually
  // saw — a shared word, a book cover, a portrait, something related but different — have to be
  // named, or "is this about the topic?" quietly replaces "is this a picture of it?".
  const prompt = relevancePrompt("the doctrine of precedent", MEASURED.map((row) => ({ caption: row.caption })));
  assert.match(prompt, /Answer 0 if none of them depicts it/);
  for (const escape of ["shares", "book cover", "portrait", "related but different"]) {
    assert.ok(prompt.includes(escape), `the prompt stopped naming "${escape}" as a reason to answer 0`);
  }
});

test("🔴 a caption cannot run away with the prompt", () => {
  const prompt = relevancePrompt("x", [{ caption: "y".repeat(4000) }]);
  assert.ok(prompt.length < 1000, `one caption produced a ${prompt.length}-character prompt`);
});

test("🔴 never more than MAX_JUDGED candidates, however many are offered", () => {
  const many = Array.from({ length: 20 }, (_unused, index) => ({ caption: `candidate ${index}` }));
  const prompt = relevancePrompt("x", many);
  assert.ok(prompt.includes(`${MAX_JUDGED}. candidate ${MAX_JUDGED - 1}`));
  assert.ok(!prompt.includes(`${MAX_JUDGED + 1}. candidate ${MAX_JUDGED}`), "the judge was shown more than it may be");
});

test("🔴 a chosen number resolves to a zero-based index", () => {
  assert.deepEqual(readRelevanceChoice("2", 3), { index: 1, verdict: "shows" });
  // A model that explains itself before answering is still read.
  assert.deepEqual(readRelevanceChoice("Picture 3 — it shows the helix", 3), { index: 2, verdict: "shows" });
});

test("🔴🔴 0 means NONE and removes the picture; anything unreadable means UNKNOWN and keeps it", () => {
  // 🔴 THE DISTINCTION THIS WHOLE VERDICT TYPE EXISTS FOR. Collapsing them into `number | null`
  // makes a judge outage indistinguishable from a considered "none", and an outage would then blank
  // every picture in the product — a far worse bug than the one the judge fixes.
  assert.deepEqual(readRelevanceChoice("0", 3), { verdict: "none" });
  for (const unreadable of [null, "", "I am not sure", "none of them", "7", "-1"]) {
    assert.deepEqual(
      readRelevanceChoice(unreadable, 3),
      { verdict: "unknown" },
      `"${unreadable}" was read as a decision rather than as no answer`,
    );
  }
  // Out of range is unknown too: an index nobody offered cannot address a candidate.
  assert.deepEqual(readRelevanceChoice("4", 3), { verdict: "unknown" });
  assert.deepEqual(readRelevanceChoice("1", 0), { verdict: "unknown" });
});

test("🔴🔴 an outage keeps the picture — the wiring, not just the type", () => {
  // Calibration: change either `{ verdict: "unknown" }` in figure-lookup.ts's REAL judge to
  // `{ verdict: "none" }` and this reddens. That edit would silently end pictures for every
  // signed-out reader and every provider hiccup.
  const lookup = readFileSync(new URL("./figure-lookup.ts", import.meta.url), "utf8");
  const judge = lookup.slice(lookup.indexOf("judge: async (concept, captions)"), lookup.indexOf("own: ownFigures"));
  assert.ok(judge.length > 0, "the real judge is gone — this guard is pointed at nothing");
  assert.ok(!judge.includes('verdict: "none"'), "the real judge can now answer none without reading a reply");
  assert.equal((judge.match(/verdict: "unknown"/g) ?? []).length, 2, "the no-session and the thrown-error paths must both keep the picture");
  // And the consumer: unknown keeps what the licence gate chose.
  assert.match(lookup, /if \(verdict\.verdict === "unknown"\) return asResolution\(offer\);/);
});

test("🔴 the measured failures are recorded in the module, not only in this file", () => {
  // The six rows above are the reason this exists. A module whose header loses them becomes a
  // filter nobody can justify, and the next reader deletes it as an unnecessary model call.
  const source = readFileSync(new URL("./figure-relevance.ts", import.meta.url), "utf8");
  for (const row of MEASURED) {
    assert.ok(source.includes(row.concept), `the header no longer records the "${row.concept}" measurement`);
  }
});
