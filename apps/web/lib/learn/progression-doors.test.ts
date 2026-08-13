import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

// Which functions can put a progression control on the Canvas, and which of them anything calls.
//
// 🔴 AN EXECUTABLE AUDIT, NOT A COMMENT, BECAUSE A COMMENT IS EXACTLY WHAT FAILED HERE. The header
// of `offersContinue` says the production guard "must not disagree" with `offersAdvance`'s, *"or
// the surface offers through one door what it refuses through the other"* — a correct invariant
// pointing at a landmark that **no longer runs**. §38 replaced both with a single owner
// (`continueOwner`), and neither of the old predicates was deleted or reported.
//
// 🔴 AND THE DEAD ONE IS NOT INERT. `offersAdvance` decides by `feedbackPassed` — the inference §39
// forbids in as many words: *"correctness does not determine advancement; cognitive mode does."*
// Its own test file still asserts that behaviour as CORRECT, in a green suite:
//
//     offersAdvance({ hasFeedback: true, feedbackPassed: false }) === true    wrong -> Continue
//     offersAdvance({ hasFeedback: true, feedbackPassed: true  }) === false   right -> silence
//
// So the suite documents "Continue means you got it wrong" as the rule, and the next person needing
// a Continue predicate finds a ready-made one that is wrong in exactly the way the contract names.
// Canvas UI reported an earlier draft of `learning-canvas.tsx` doing precisely that.
//
// 🔴 THIS FILE DELETES NOTHING. #585 established the standard: a retirement expressed as a silent
// removal takes things with it that were never part of what was retired, so what is dead gets
// RECORDED and reviving or deleting it is then a decision someone makes on purpose. This makes the
// current state fail loudly the moment it changes in either direction.

const LEARN_COMPONENTS = new URL("../../components/workspace/learn/", import.meta.url);
const LEARN_LIB = new URL("./", import.meta.url);

/** Files a learner's browser actually runs — not tests, and not the modules under audit. */
async function productionSources(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of [LEARN_COMPONENTS, LEARN_LIB]) {
    for (const name of await readdir(dir)) {
      if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
      if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
      out.push(`${dir.pathname}${name}`);
    }
  }
  return out;
}

/** Does anything a learner runs CALL this, as opposed to merely importing or naming it? */
async function calledInProduction(fn: string): Promise<string[]> {
  const callers: string[] = [];
  for (const path of await productionSources()) {
    const source = await readFile(path, "utf8");
    // 🔴 A CALL, NOT A MENTION. `learning-canvas.tsx` both imports `offersAdvance` and discusses it
    // in a comment, and neither is a consumer. Comments are stripped and the match requires an
    // open paren, so "the name appears somewhere" cannot stand in for "something runs it".
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    const declaresIt = new RegExp(`function\\s+${fn}\\s*\\(`).test(code);
    if (declaresIt) continue;
    if (new RegExp(`\\b${fn}\\s*\\(`).test(code)) callers.push(path.split("/").pop()!);
  }
  return callers;
}

test("🔴 exactly ONE progression predicate is live, and it is the §38 owner", async () => {
  // "There is exactly ONE button in Nemesis. It says Continue." One button needs one predicate;
  // three predicates is three places the answer can be decided, and two of them are unreachable.
  assert.notDeepEqual(
    await calledInProduction("continueOwner"),
    [],
    "the single §38 owner has no production consumer — the Continue button is dead",
  );
});

test("🔴 RECORDED AS DEAD — `offersAdvance`, which decides by correctness (§39 forbids it)", async () => {
  // Goes red if someone wires it back up. That is the point: reviving a predicate whose whole logic
  // is `feedbackPassed` puts "Continue means you got it wrong" back on the screen, and every one of
  // its own tests would stay green while it happened.
  assert.deepEqual(
    await calledInProduction("offersAdvance"),
    [],
    "offersAdvance has a production consumer again — it decides by correctness, which §39 forbids",
  );
});

test("🔴 RECORDED AS DEAD — `offersContinue`, superseded by `continueOwner` in #587", async () => {
  // 🔴 CANVAS UI FOUND THE FIRST ONE; THIS IS THE SECOND, AND IT WAS UNREPORTED. Its N3 guard is
  // not lost — `continueOwner` refuses on `awaitingDemonstration` before it looks at any region,
  // and has its own test for it. What is gone is a SECOND door answering the same question.
  assert.deepEqual(
    await calledInProduction("offersContinue"),
    [],
    "offersContinue has a production consumer again — two doors can disagree, which is the hazard its own header names",
  );
});

test("🔴 the live door still refuses while a demonstration is owed (N3)", async () => {
  // The property both dead predicates existed to hold, asserted against the one that runs. If the
  // audit above ever licenses deleting them, this is what must survive the deletion.
  const { continueOwner } = await import("./canvas-continue");
  const reading = [{ id: "policy", placement: "policy" as const, requiresReading: true }];
  assert.equal(continueOwner(reading, { awaitingDemonstration: true, busy: false }), null);
  assert.equal(continueOwner(reading, { awaitingDemonstration: false, busy: true }), null);
  assert.notEqual(continueOwner(reading, { awaitingDemonstration: false, busy: false }), null);
});
