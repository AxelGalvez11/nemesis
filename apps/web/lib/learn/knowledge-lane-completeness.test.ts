// Every knowledge type the extractors MINT must have a lane in `objectivesForKnowledge`.
//
// 🔴 THIS IS THE GUARD THAT WOULD HAVE CAUGHT THE CEILING YEARS EARLIER. `objectivesForKnowledge`
// returns `[]` for any type it does not handle — silently, with no error and no failing test. A
// lecture full of mechanisms could construct knowledge all day and none of it would reach a
// learner: no objective, so no task, so no evidence, so no state, so nothing for the policy to
// decide about. "Eleven knowledge kinds in the spec, one lane in the code" was that silence.
//
// 🔴 IT READS THE SOURCE, NOT A LIST. A hand-maintained roster of supported types is the same shape
// as the bug — it would be updated by whoever remembered, and the gap it is meant to report is
// exactly the gap someone forgot about. Scanning for what is actually constructed cannot be
// forgotten, because minting a new type IS the edit that fails the build.
//
// 🔴 WHAT THIS DOES NOT CHECK: whether the lane's objectives have a TASK behind them. §13 of the
// runtime spec requires that too, and an objective with no task is a row reporting "no evidence"
// for ever. Extending this guard to the prompt layer is the obvious next move; it is not done here,
// and saying so is better than implying the build proves more than it does.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const LEARN_DIR = "lib/learn";

/** Every knowledge type named in the union, read from the type file rather than retyped here. */
function declaredTypes(): string[] {
  const source = readFileSync(join(LEARN_DIR, "knowledge-types.ts"), "utf8");
  const union = source.slice(source.indexOf("export type KnowledgeType ="));
  // 🔴 COMMENTS STRIPPED BEFORE THE UNION IS BOUNDED, and the second test exists because of this.
  // Each member is documented, and the prose for `classification` reads "never one label; it is
  // knowing which feature discriminates" — so slicing at the first `;` ended the union after its
  // FIRST member. The guard still passed: one declared type is not zero, the subtraction was empty,
  // and it reported completeness while reading one line of a ten-line union.
  const body = union.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...body.slice(0, body.indexOf(";")).matchAll(/\|\s*"([a-z_]+)"/g)].map((match) => match[1]!);
}

function productionSources(): string[] {
  return readdirSync(LEARN_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => readFileSync(join(LEARN_DIR, name), "utf8"));
}

/** Types some extractor actually constructs a KnowledgeObject with. */
function mintedTypes(): string[] {
  const declared = new Set(declaredTypes());
  const minted = new Set<string>();
  for (const source of productionSources()) {
    for (const match of source.matchAll(/\btype:\s*"([a-z_]+)"/g)) {
      if (declared.has(match[1]!)) minted.add(match[1]!);
    }
  }
  return [...minted].sort();
}

/** Types `objectivesForKnowledge` branches on. */
function handledTypes(): string[] {
  const source = readFileSync(join(LEARN_DIR, "learning-objective.ts"), "utf8");
  const fn = source.slice(source.indexOf("export function objectivesForKnowledge"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  const handled = new Set<string>();
  // `type === "x"` opens a lane; `type !== "x"` guards the fall-through lane, which handles it.
  for (const match of body.matchAll(/object\.type\s*[!=]==\s*"([a-z_]+)"/g)) handled.add(match[1]!);
  return [...handled].sort();
}

test("every minted knowledge type has an objective lane", () => {
  const unreachable = mintedTypes().filter((type) => !handledTypes().includes(type));

  assert.deepEqual(
    unreachable,
    [],
    `These types are extracted but produce no objectives, so nothing built from them can ever ` +
      `reach a learner: ${unreachable.join(", ")}. Add a lane to objectivesForKnowledge, or stop ` +
      `minting the type.`,
  );
});

test("the guard can see the types that exist, so an empty scan cannot pass it silently", () => {
  // 🔴 A SCANNING GUARD'S FAILURE MODE IS FINDING NOTHING. If a rename broke either regex, both
  // sets would be empty, the subtraction would be empty, and the test above would pass while
  // checking nothing at all. These assertions are what make its silence impossible.
  assert.ok(declaredTypes().length >= 10, "the KnowledgeType union should have been found");
  assert.ok(mintedTypes().length >= 5, "extractors that mint knowledge should have been found");
  assert.ok(handledTypes().length >= 5, "objectivesForKnowledge lanes should have been found");
  // The five categories contract R4 records as closed.
  assert.deepEqual(mintedTypes(), ["association", "causal", "classification", "procedure", "spatial"]);
});
