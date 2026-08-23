import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CONCEPT_IDENTITY_VERSION,
  conceptIdentityBasis,
  conceptIdentityKey,
  conceptSurfaceKey,
  conceptSurfaceKeys,
} from "./concept-identity";
import { causalNodeKey, knowledgeIdentityKey } from "./knowledge-identity";
import { glossaryKey } from "./vocabulary-lookup";

// 🔴🔴 THE FIRST TEST IN THIS FILE IS THE REASON THE FILE EXISTS.
//
// An earlier draft of `concept-identity.ts` keyed a concept on its normalised label alone, and a
// migration draft put `unique (surface_key)` on the alias table to match. That makes ONE normalised
// word name ONE concept for every discipline at once — so whichever field is ingested first captures
// "balance", "moment", "consideration", "stress" and "argument" permanently, and every other field's
// learner silently resolves to the wrong concept. Not a rare collision: the first week.
//
// It is also a schema-level failure of CLAUDE.md's own design test — "would this work for a law
// student and a mechanical engineering student?" — which is exactly the class of mistake that reads
// as correct in review because the code is short and the words are ordinary.

/** Homonyms that are genuinely different ideas in genuinely different fields. */
const HOMONYMS = [
  { domain: "accounting", label: "Balance", meaning: "what a ledger must do" },
  { domain: "chemistry", label: "Balance", meaning: "what an equation must do" },
  { domain: "physiology", label: "Balance", meaning: "the vestibular sense" },
  { domain: "law", label: "Consideration", meaning: "what makes a promise binding" },
  { domain: "mechanical engineering", label: "Moment", meaning: "force times distance" },
  { domain: "statistics", label: "Moment", meaning: "an expectation of a power" },
];

test("🔴🔴 the same word in different fields is different concepts", () => {
  const byKey = new Map<string, string>();
  for (const entry of HOMONYMS) {
    const key = conceptIdentityKey(entry);
    const seen = byKey.get(key);
    assert.equal(
      seen,
      undefined,
      `"${entry.label}" in ${entry.domain} (${entry.meaning}) collided with ${seen} — ` +
        "one field has captured a word the others also use",
    );
    byKey.set(key, `${entry.domain}: ${entry.meaning}`);
  }
  assert.equal(byKey.size, HOMONYMS.length);
});

test("🔴 the same concept in the same field is one concept, however it was written", () => {
  const a = conceptIdentityKey({ domain: "Chemistry", label: "Acid-base titration" });
  const b = conceptIdentityKey({ domain: "chemistry  ", label: "  acid-base titration " });
  assert.equal(a, b, "case and surrounding whitespace changed a concept's identity");
});

test("🔴 a subdomain cannot be smuggled into a label to forge a different concept", () => {
  // Without the empty segment holding its position, these two would produce the same basis.
  const withSub = conceptIdentityBasis({ domain: "biology", label: "transport", subdomain: "cell" });
  const inLabel = conceptIdentityBasis({ domain: "biology", label: "cell transport" });
  assert.notEqual(withSub, inLabel, "the subdomain slot collapsed into the label");
});

test("🔴🔴 the basis is storable and printable — no control characters, ever", () => {
  // The first draft joined the three parts with a NUL byte. It hashed fine and every behavioural
  // test passed, and Postgres refuses \u0000 in a `text` column — so the one string this module
  // exports for a human to read could not be logged or stored. Invisible in a diff, invisible in an
  // editor, and only findable by dumping bytes.
  const basis = conceptIdentityBasis({ domain: "chemistry", label: "titration", subdomain: "acid-base" });
  assert.ok(!/[\u0000-\u001f]/.test(basis), `the basis carries a control character: ${JSON.stringify(basis)}`);
  assert.equal(basis, JSON.stringify(["chemistry", "acid-base", "titration"]));
});

test("🔴🔴 no separator collision — a label may legitimately contain any punctuation", () => {
  // `normalizeForIdentity` strips punctuation only at the ENDS of a part, so spaces, pipes, colons
  // and dashes all survive inside a label. Every single-character separator collides on some real
  // input; these are the pairs that would collide under " ", "|" and ":" respectively.
  const collisions: Array<[Parameters<typeof conceptIdentityBasis>[0], Parameters<typeof conceptIdentityBasis>[0]]> = [
    [{ domain: "d", label: "a b" }, { domain: "d", label: "b", subdomain: "a" }],
    [{ domain: "d", label: "a|b" }, { domain: "d", label: "b", subdomain: "a" }],
    [{ domain: "d", label: "a:b" }, { domain: "d", label: "b", subdomain: "a" }],
  ];
  for (const [left, right] of collisions) {
    assert.notEqual(
      conceptIdentityBasis(left),
      conceptIdentityBasis(right),
      `"${left.label}" collided with subdomain "${right.subdomain}" + label "${right.label}"`,
    );
    assert.notEqual(conceptIdentityKey(left), conceptIdentityKey(right));
  }
});

test("🔴🔴 an alias key IS causalNodeKey, because that is the only reason it joins to anything", () => {
  // If these ever diverge, a concept silently stops matching the causal edges, association pairs and
  // prerequisite terms it is supposed to name — and a failed join is indistinguishable from a canvas
  // that genuinely does not hold the concept.
  for (const surface of ["ACE inhibitors", "Second moment of area", "res ipsa loquitur", "  Ohm's law  "]) {
    assert.equal(conceptSurfaceKey(surface), causalNodeKey(surface), `alias key drifted from causalNodeKey on "${surface}"`);
  }
});

test("🔴🔴 an alias key is NOT a glossary key, and the two must never be substituted", () => {
  // `glossaryKey` replaces punctuation INSIDE the string; `normalizeForIdentity` strips it only at
  // the ends. A lookup written across the two would work on unpunctuated terms and fail on the rest,
  // which is worse than one that plainly does not work.
  assert.equal(conceptSurfaceKey("acid-base"), "acid-base");
  assert.equal(glossaryKey("acid-base"), "acid base");
  assert.notEqual(conceptSurfaceKey("acid-base"), glossaryKey("acid-base"));
});

test("🔴 the algorithm version rides inside the key", () => {
  const key = conceptIdentityKey({ domain: "chemistry", label: "titration" });
  assert.match(key, new RegExp(`^concept:v${CONCEPT_IDENTITY_VERSION}:[0-9a-f]{16}$`));
});

test("🔴 concept keys and knowledge keys are different namespaces", () => {
  const concept = conceptIdentityKey({ domain: "chemistry", label: "ACE inhibitors" });
  const claim = knowledgeIdentityKey({
    pair: { id: "p1", left: "ACE inhibitors", right: "raise serum potassium" },
    statement: "ACE inhibitors raise serum potassium",
    type: "association",
  });
  assert.ok(concept.startsWith("concept:"), "a concept key must be visibly a concept key");
  assert.ok(!claim.startsWith("concept:"), "a claim key has entered the concept namespace");
  assert.notEqual(concept, claim);
});

test("🔴 empty and duplicate surfaces are dropped rather than stored", () => {
  const keys = conceptSurfaceKeys({ aliases: ["", "   ", "---", "Titration", "titration curve"], label: "Titration" });
  assert.deepEqual(keys, ["titration", "titration curve"]);
});

test("🔴 surface keys are deterministic, so a rebuilt row is byte-identical", () => {
  const once = conceptSurfaceKeys({ aliases: ["b", "a"], label: "c" });
  const twice = conceptSurfaceKeys({ aliases: ["a", "b"], label: "c" });
  assert.deepEqual(once, twice);
});

// ── source-shape guards ─────────────────────────────────────────────────────────────────────────

/** Comments stripped, because a guard that matches its own warning proves nothing. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const CONCEPT_SOURCE = code(readFileSync(new URL("./concept-identity.ts", import.meta.url), "utf8"));

test("🔴🔴 the concept registry mints no claim identities", () => {
  // The owner's hardest constraint. `knowledgeIdentityKey` owns claim identity; this module must
  // never compute one, or the registry becomes a second knowledge system by the back door.
  assert.ok(
    !CONCEPT_SOURCE.includes("knowledgeIdentityKey"),
    "concept-identity.ts is computing knowledge identities",
  );
  assert.ok(
    !CONCEPT_SOURCE.includes("identityBasis("),
    "concept-identity.ts is reusing the claim basis, which would weld the two key spaces together",
  );
});

test("🔴 the domain is in the basis — the scope cannot be quietly removed", () => {
  assert.match(CONCEPT_SOURCE, /normalizeForIdentity\(naming\.domain\)/, "the domain scope has left the basis");
  const basis = CONCEPT_SOURCE.slice(CONCEPT_SOURCE.indexOf("export function conceptIdentityBasis"));
  const body = basis.slice(0, basis.indexOf("\n}"));
  assert.ok(body.includes("domain"), "conceptIdentityBasis no longer reads the domain");
});

test("🔴 this module holds no learner state", () => {
  for (const forbidden of ["progress", "mastery", "score", "correct", "seen", "evidence"]) {
    assert.ok(
      !new RegExp(`\\b${forbidden}\\b`, "i").test(CONCEPT_SOURCE),
      `"${forbidden}" appears in concept-identity.ts — a concept row is a fact about an idea, never about a person`,
    );
  }
});
