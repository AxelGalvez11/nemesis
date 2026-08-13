import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { readingRequirementOf } from "./canvas-continue";
import { tempoFor } from "./canvas-hosting";
import {
  advancesItself,
  declaredExposition,
  expositionFor,
  modeOfExposition,
  NO_EXPOSITION,
  TRANSIENT_EXPOSURE_MS,
  type ExpositionKind,
} from "./cognitive-mode";
import { KNOWLEDGE_TYPES } from "./knowledge-types";
import type { ObjectiveCapability } from "./learning-objective";

/**
 * 🔴 THE REAL EXPORTED LIST, NOT A COPY OF IT. A hand-written array here would go stale the day a
 * knowledge type is added, and the sweep below would keep passing while saying nothing about the
 * new one — a guard that silently narrows is worse than no guard.
 */
const ALL_TYPES = KNOWLEDGE_TYPES;
const ALL_CAPABILITIES: readonly ObjectiveCapability[] = ["recall", "discriminate", "explain"];
const ALL_KINDS: readonly ExpositionKind[] = ["correction", "contrast", "verdict"];

/**
 * A module's executable content: comments and string literals removed.
 *
 * 🔴 THE PARSING IS DELIBERATELY CRUDE AND THAT IS SAFE HERE, because both errors it can make fall
 * the same way. Anything it fails to strip stays in the text and can only make a guard MORE likely
 * to fire; it can never hide a forbidden identifier that is really there.
 */
function expressionsOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, "``");
}

// ── §39's table, on the rows that are reachable today ───────────────────────

test("🔴 §39 rows 1-2 — an association's answer is exposed, not read", () => {
  // "Simple fact / association" and "vocabulary / drug fact / flashcard-like recall" both say No.
  // What is shown is `Valsartan → Losartan`: one line, about a second, then the next retrieval.
  for (const kind of ["correction", "verdict"] as const) {
    assert.equal(
      modeOfExposition({ capability: "recall", kind, knowledgeType: "association" }),
      "transient",
      `an association ${kind} must not stop the learner to be read`,
    );
  }
});

test("🔴 §39 row 4 — a misconception is ALWAYS read, whatever the knowledge type", () => {
  // The one unconditional **Yes** in the owner's table: "explain why their model is wrong and
  // replace it". A misconception about an association is still a wrong model being replaced.
  // 🔴 THIS IS THE ROW THAT CANNOT BE DERIVED FROM THE KNOWLEDGE TYPE, which is why `contrast` is
  // checked before the type is consulted at all.
  for (const knowledgeType of ALL_TYPES) {
    for (const capability of ALL_CAPABILITIES) {
      assert.equal(
        modeOfExposition({ capability, kind: "contrast", knowledgeType }),
        "deliberate",
        `a contrast over ${knowledgeType}/${capability} must wait for the learner`,
      );
    }
  }
});

test("🔴 the same pair that makes a retrieval INSTANT makes its contrast DELIBERATE", () => {
  // 🔴 THE PROOF THAT THIS IS NOT `tempoFor` UNDER ANOTHER NAME, on data that is reachable today
  // rather than on a promise about the future. Both functions take (knowledgeType, capability);
  // for association + recall `tempoFor` says the thinking is instant, and §39 says the explanation
  // that separates two confusable drugs is read. Two questions, two answers, same inputs.
  //
  // If someone ever "simplifies" this by routing mode through tempo, this goes red.
  assert.equal(tempoFor({ knowledgeType: "association", operation: "recall" }), "instant");
  assert.equal(
    modeOfExposition({ capability: "recall", kind: "contrast", knowledgeType: "association" }),
    "deliberate",
  );
});

// ── the forbidden inputs ────────────────────────────────────────────────────

test("🔴 §39 — the mode CANNOT see a verdict, because the module never receives one", async () => {
  // "Correctness does not determine advancement; cognitive mode does." Canvas UI came within one
  // commit of shipping the inverse — a Continue wired to `feedbackPassed`, which appears exactly
  // when the learner was WRONG. What prevents it is not care at the call site: it is that no
  // function here takes a verdict, so the inference is unavailable rather than discouraged.
  //
  // 🔴 ASSERTED ON THE PROPERTY, NOT ON ONE SPELLING. A guard anchored to the literal
  // "feedbackPassed" would miss `evaluation.verdict`, `passed`, `isCorrect` or `outcome`. This
  // checks the whole vocabulary of correctness, and it strips comments first so the prose above —
  // which necessarily discusses verdicts — cannot trip it.
  // 🔴 STRING LITERALS ARE STRIPPED ALONG WITH COMMENTS, AND THAT IS THE WHOLE SUBTLETY. `"verdict"`
  // is a legitimate `ExpositionKind` — it names WHICH SCREEN is being shown, which is a fact about
  // the artifact — while a `verdict` VALUE is a fact about how the learner did, and only the second
  // is forbidden. A guard that cannot tell a screen's name from a judgement of the learner goes red
  // on correct code and gets "fixed" by being deleted. What is left after stripping is identifiers
  // and branches: the things that could actually read a verdict.
  const code = expressionsOnly(
    await readFile(new URL("./cognitive-mode.ts", import.meta.url), "utf8"),
  );
  // 🔴 WORD BOUNDARIES TOO, BECAUSE `correction` CONTAINS "correct".
  for (const forbidden of [
    /\bverdict\b/i,
    /\bpassed\b/i,
    /\bcorrect\b/i,
    /\bincorrect\b/i,
    /\bevaluation\b/i,
    /\bmisconception\b/i,
    /\bconfidence\b/i,
    /\bdemonstrat/i,
  ]) {
    assert.equal(
      forbidden.test(code),
      false,
      `cognitive mode must not be able to read ${forbidden} — §39 forbids correctness as an input`,
    );
  }
  // And positively: the only inputs any exported function takes are these three.
  for (const required of ["kind", "knowledgeType", "capability"]) {
    assert.ok(code.includes(`readonly ${required}:`), `the mode is decided from ${required}`);
  }
});

test("🔴 the mode does not read the LENGTH of what is being shown", async () => {
  // The third forbidden input. There is no text parameter, so there is nothing to measure.
  const code = expressionsOnly(
    await readFile(new URL("./cognitive-mode.ts", import.meta.url), "utf8"),
  );
  for (const forbidden of [".length", "statement", "prompt", "text"]) {
    assert.equal(code.includes(forbidden), false, `mode must not depend on "${forbidden}"`);
  }
});

// ── the duration lives where the auto-advance lives ─────────────────────────

test("🔴 a transient exposition ALWAYS carries a duration, and a deliberate one never can", () => {
  // The Canvas must not invent a window the policy never chose. The union is what guarantees it:
  // there is no combination of these inputs that produces a transient with no number.
  for (const kind of ALL_KINDS) {
    for (const knowledgeType of ALL_TYPES) {
      for (const capability of ALL_CAPABILITIES) {
        const exposition = expositionFor({ capability, kind, knowledgeType });
        if (exposition.mode === "transient") {
          assert.equal(typeof exposition.exposureMs, "number");
          assert.ok(exposition.exposureMs > 0, "an auto-advance with no window would never fire");
        } else {
          assert.equal("exposureMs" in exposition, false, "only an auto-advance has a duration");
        }
      }
    }
  }
});

test("the exposure window is the owner's ~1-2 seconds", () => {
  // Ruled in §39: "Then, after roughly 1–2 seconds, the next retrieval appears."
  assert.ok(TRANSIENT_EXPOSURE_MS >= 1000 && TRANSIENT_EXPOSURE_MS <= 2000);
});

test("🔴 a transient read back WITHOUT its duration is not a transient", () => {
  // The structural reader is where a malformed artifact would enter — an older serialised decision,
  // a hand-built object in a test, a future producer that forgot. Handing the renderer an
  // auto-advance and no number is the one thing the union exists to prevent, so it resolves to
  // "nothing was declared", which `readingRequirementOf` treats as a defect with a safe answer.
  assert.equal(declaredExposition({ exposition: { mode: "transient" } }), null);
  assert.equal(declaredExposition({ exposition: { exposureMs: 0, mode: "transient" } }), null);
  assert.deepEqual(declaredExposition({ exposition: { exposureMs: 1500, mode: "transient" } }), {
    exposureMs: 1500,
    mode: "transient",
  });
  assert.deepEqual(declaredExposition({ exposition: { mode: "deliberate" } }), { mode: "deliberate" });
  assert.deepEqual(declaredExposition({ exposition: NO_EXPOSITION }), NO_EXPOSITION);
  assert.equal(declaredExposition({}), null);
});

test("advancing by itself is exactly transient, in one place", () => {
  assert.equal(advancesItself({ exposureMs: TRANSIENT_EXPOSURE_MS, mode: "transient" }), true);
  assert.equal(advancesItself({ mode: "deliberate" }), false);
  assert.equal(advancesItself(NO_EXPOSITION), false);
});

// ── the seam with the consumer ──────────────────────────────────────────────

test("🔴 every mode this module can produce is one the Canvas can read", () => {
  // 🔴 A DATA-FLOW ASSERTION, NOT A SPELLING ONE. `declaredCognitiveMode` in canvas-continue.ts
  // matches on three literals and returns `null` for anything else — and `null` means "the policy
  // said nothing", which resolves to *requires reading*. So a mode this module emits that the
  // reader does not recognise is not a type error: it is a Continue silently appearing on a
  // two-word answer exposure. Renaming a member on either side must go red here.
  const seen = new Set<string>();
  for (const kind of ALL_KINDS) {
    for (const knowledgeType of ALL_TYPES) {
      for (const capability of ALL_CAPABILITIES) {
        seen.add(expositionFor({ capability, kind, knowledgeType }).mode);
      }
    }
  }
  seen.add(NO_EXPOSITION.mode);
  for (const mode of seen) {
    const read = readingRequirementOf(mode as never);
    assert.equal(read.unknown, false, `the Canvas does not recognise the mode "${mode}"`);
  }
  assert.deepEqual([...seen].sort(), ["deliberate", "none", "transient"]);
});

test("🔴 the Canvas waits when it was told nothing, and does not when it was told 'none'", () => {
  // The asymmetry the consumer was built on, pinned from this side too. "We were not told" must
  // stay distinguishable from "we were told there is nothing to read", or the stopgap's Continue
  // reappears on every retrieval.
  assert.deepEqual(readingRequirementOf(null), { requiresReading: true, unknown: true });
  assert.deepEqual(readingRequirementOf("none"), { requiresReading: false, unknown: false });
  assert.deepEqual(readingRequirementOf("transient"), { requiresReading: false, unknown: false });
  assert.deepEqual(readingRequirementOf("deliberate"), { requiresReading: true, unknown: false });
});

// ── the rows R4 cannot reach ────────────────────────────────────────────────

test("UNREACHABLE UNTIL R4 — the five other knowledge types default to deliberate", () => {
  // 🔴 THIS IS NOT ACCEPTANCE FOR §39's ROWS 3, 5, 6 AND 7, AND CALLING IT THAT WOULD BE THE
  // FAMILIAR MISTAKE. `objectivesForKnowledge` mints objectives for `association` only and hardcodes
  // `capability: "recall"`, so no decision in the running product can carry any other pair. Nothing
  // below has ever been executed against a real canvas.
  //
  // What it DOES pin is the default direction, which is a real decision: an unclassifiable emission
  // waits for the learner. Auto-advancing past material nobody classified is unrecoverable and
  // invisible; one unnecessary press is neither.
  for (const knowledgeType of ALL_TYPES.filter((type) => type !== "association")) {
    assert.equal(
      modeOfExposition({ capability: "recall", kind: "correction", knowledgeType }),
      "deliberate",
      `${knowledgeType} is not reachable yet, but if it arrives it must not auto-advance`,
    );
  }
  // Same for a capability other than recall over an association — also unreachable today.
  for (const capability of ["discriminate", "explain"] as const) {
    assert.equal(
      modeOfExposition({ capability, kind: "correction", knowledgeType: "association" }),
      "deliberate",
    );
  }
});
