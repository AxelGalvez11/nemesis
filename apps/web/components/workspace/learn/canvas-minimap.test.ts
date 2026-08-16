import assert from "node:assert/strict";
import { test } from "node:test";

import { WHOLE_CANVAS, type FocusScope } from "@/lib/learn/canvas-focus";
import { emptyCoverage, type CanvasCoverage } from "@/lib/learn/knowledge-coverage";
import type { EvidenceVerdict, LearnerEvidence } from "@/lib/learn/learner-evidence";

import {
  orderedTerritories,
  recommendedTerritoryLabel,
  sourceDisclosure,
  territoryMark,
  type Territory,
} from "./canvas-minimap";

let counter = 0;
/** One evidence row. `demonstrationObtained: false, verdict: null` is the `not_demonstrated`
 *  shape (`objective-task.ts`'s `unobtainedEvidence`); pass a verdict for a judged demonstration. */
function row(
  objectiveIdentityKey: string,
  input: { demonstrationObtained: boolean; verdict?: EvidenceVerdict | null; occurredAt?: string },
): LearnerEvidence {
  counter += 1;
  return {
    demonstrationObtained: input.demonstrationObtained,
    id: `row-${counter}`,
    objectiveIdentityKey,
    occurredAt: input.occurredAt ?? `2026-08-15T00:00:${String(counter).padStart(2, "0")}.000Z`,
    verdict: input.verdict ?? null,
  };
}

// ── territoryMark ────────────────────────────────────────────────────────

test("a territory nobody has ever engaged carries no mark", () => {
  assert.equal(territoryMark(["o1"], []), null);
  assert.equal(territoryMark(["o1", "o2"], []), null);
});

test("a single demonstrated objective reads established", () => {
  const evidence = [row("o1", { demonstrationObtained: true, verdict: "strong" })];
  assert.equal(territoryMark(["o1"], evidence), "established");
});

test("🔴 `not_demonstrated` reads developing, never established and never absent", () => {
  // demonstrationObtained: false, verdict: null — the shape objective-task.ts's
  // `unobtainedEvidence` writes when the judge ran and got nothing usable back.
  const evidence = [row("o1", { demonstrationObtained: false })];
  assert.equal(territoryMark(["o1"], evidence), "developing");
});

test("an incorrect or misconception verdict reads developing, not established", () => {
  for (const verdict of ["incorrect", "misconception", "partial"] as const) {
    const evidence = [row("o1", { demonstrationObtained: true, verdict })];
    assert.equal(territoryMark(["o1"], evidence), "developing", `${verdict} must not read as established`);
  }
});

test("multi-objective territory: established requires EVERY member correct", () => {
  const evidence = [
    row("o1", { demonstrationObtained: true, verdict: "strong" }),
    row("o2", { demonstrationObtained: true, verdict: "understood" }),
  ];
  assert.equal(territoryMark(["o1", "o2"], evidence), "established");
});

test("🔴 THE ROLLUP DOES NOT ROUND UP — one untested member holds the whole territory at developing", () => {
  // Two objectives share a territory (proven real by canvas-focus.test.ts: a pair's forward and
  // backward recall directions collapse into one). One has been demonstrated; the other has never
  // been asked about. Folding only the ENGAGED subset would report "established" here — coverage
  // nobody actually has, on a territory the learner would read as one solid dot.
  const evidence = [row("o1", { demonstrationObtained: true, verdict: "strong" })];
  assert.equal(
    territoryMark(["o1", "o2"], evidence),
    "developing",
    "a territory with an untested member must not read as established",
  );
});

test("🔴 THE ROLLUP DOES NOT ROUND DOWN TO ABSENT EITHER — one wrong member is still a mark, not silence", () => {
  const evidence = [
    row("o1", { demonstrationObtained: true, verdict: "strong" }),
    row("o2", { demonstrationObtained: true, verdict: "incorrect" }),
  ];
  assert.equal(territoryMark(["o1", "o2"], evidence), "developing");
});

test("only the LATEST believable evidence for a key decides its contribution", () => {
  // A wrong answer later corrected must not hold the territory at developing forever — that is
  // `projectLearnerState`'s own recency rule (learner-evidence.ts), exercised here rather than
  // re-implemented.
  const evidence = [
    row("o1", { demonstrationObtained: true, occurredAt: "2026-08-15T00:00:01.000Z", verdict: "incorrect" }),
    row("o1", { demonstrationObtained: true, occurredAt: "2026-08-15T00:00:02.000Z", verdict: "strong" }),
  ];
  assert.equal(territoryMark(["o1"], evidence), "established");
});

// ── recommendedTerritoryLabel ────────────────────────────────────────────

const TERRITORIES: readonly Territory[] = [
  { identityKeys: ["o1"], label: "Resting potential" },
  { identityKeys: ["o2", "o3"], label: "Ventricular phase 0" },
];

test("names the territory holding the decided objective, when focus is cleared", () => {
  assert.equal(recommendedTerritoryLabel(TERRITORIES, "o2", WHOLE_CANVAS), "Ventricular phase 0");
});

test("🔴 says nothing once the learner has manually focused — it must not speak over their choice", () => {
  const manual: FocusScope = { identityKeys: ["o1"], kind: "selection", label: "Resting potential" };
  assert.equal(recommendedTerritoryLabel(TERRITORIES, "o2", manual), null);
});

test("says nothing when there is no current decision", () => {
  assert.equal(recommendedTerritoryLabel(TERRITORIES, null, WHOLE_CANVAS), null);
});

test("says nothing for a decided key that matches no territory (stale or cross-canvas)", () => {
  assert.equal(recommendedTerritoryLabel(TERRITORIES, "does-not-exist", WHOLE_CANVAS), null);
});

// ── sourceDisclosure ─────────────────────────────────────────────────────

function coverage(unrepresented: number): CanvasCoverage {
  return { ...emptyCoverage(1), sourcesAccounted: 1, unrepresented };
}

test("🔴 a degraded or failed outcome is a reading gap, independent of the coverage numbers", () => {
  assert.equal(sourceDisclosure("degraded", coverage(0)).readingGap, true);
  assert.equal(sourceDisclosure("failed", coverage(0)).readingGap, true);
  assert.equal(sourceDisclosure("complete", coverage(0)).readingGap, false);
});

test("🔴 unrepresented material is disclosed even when the read itself was clean — RUNTIME-005", () => {
  // The INTEGRATION-001 shape recorded on the board: outcome complete, unrepresented > 0. A
  // disclosure driven only by `outcome` would miss exactly this, the ordinary case.
  const result = sourceDisclosure("complete", coverage(4));
  assert.equal(result.readingGap, false, "a complete read is not a reading gap");
  assert.equal(result.unrepresented, true, "unread coverage must still surface");
});

test("the two facts are independent — neither implies the other", () => {
  const both = sourceDisclosure("degraded", coverage(3));
  assert.equal(both.readingGap, true);
  assert.equal(both.unrepresented, true);
  const neither = sourceDisclosure("complete", coverage(0));
  assert.equal(neither.readingGap, false);
  assert.equal(neither.unrepresented, false);
});

// ── orderedTerritories ───────────────────────────────────────────────────

test("recommended first, then anything marked, then the rest — in stable input order within each group", () => {
  const territories: readonly Territory[] = [
    { identityKeys: ["a"], label: "Alpha" },
    { identityKeys: ["b"], label: "Bravo (recommended)" },
    { identityKeys: ["c"], label: "Charlie (marked)" },
    { identityKeys: ["d"], label: "Delta" },
  ];
  const evidence = [row("c", { demonstrationObtained: true, verdict: "strong" })];
  const ordered = orderedTerritories(territories, evidence, "Bravo (recommended)");
  assert.deepEqual(
    ordered.map((t) => t.label),
    ["Bravo (recommended)", "Charlie (marked)", "Alpha", "Delta"],
  );
});

test("a territory that is both recommended and marked appears once, ranked as recommended", () => {
  const territories: readonly Territory[] = [
    { identityKeys: ["a"], label: "Alpha" },
    { identityKeys: ["b"], label: "Bravo" },
  ];
  const evidence = [row("b", { demonstrationObtained: true, verdict: "strong" })];
  const ordered = orderedTerritories(territories, evidence, "Bravo");
  assert.equal(ordered.length, 2);
  assert.equal(ordered[0]!.label, "Bravo");
  assert.equal(ordered[0]!.mark, "established");
});

test("every row carries its mark alongside it, so the caller never re-derives it", () => {
  const territories: readonly Territory[] = [{ identityKeys: ["a"], label: "Alpha" }];
  const ordered = orderedTerritories(territories, [], null);
  assert.equal(ordered[0]!.mark, null);
});

test("marks and ordering recurse through explicit subobjectives", () => {
  const territories: readonly Territory[] = [{
    children: [
      { identityKeys: ["a"], label: "Alpha" },
      { identityKeys: ["b"], label: "Bravo" },
    ],
    identityKeys: ["a", "b"],
    label: "Parent",
  }];
  const evidence = [row("b", { demonstrationObtained: true, verdict: "strong" })];
  const ordered = orderedTerritories(territories, evidence, "Bravo");
  assert.equal(ordered[0]!.mark, "developing", "an untested child prevents parent overclaiming");
  assert.equal(ordered[0]!.children?.[0]?.label, "Bravo");
  assert.equal(ordered[0]!.children?.[0]?.mark, "established");
});
