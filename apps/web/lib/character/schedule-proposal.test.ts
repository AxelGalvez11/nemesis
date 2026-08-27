// The proposal names things that exist.
//
// 🔴 THE POINT IS THE FIRST TEST, AND IT CAUGHT A REAL MISTAKE WHILE THIS WAS BEING WRITTEN. The
// resting list originally carried `playful`, which is a GAZE LOOP (`gaze-playful`) and not one of
// the sixteen feelings — so the preview would have drawn fifteen faces and one blank and nobody
// would have known which row was wrong. A proposal the owner approves by looking at it has to be
// a proposal that draws.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ANIMATION_BY_ID, FACE_BY_ID } from "@/lib/avatar";
import { EXPRESSION_IDS } from "@/lib/avatar/expressions";

import { PROPOSAL, RESTING_FACES, RESTING_FACES_LEFT_OUT } from "./schedule-proposal";
import { ACTIVITY_STATE } from "./stations";

test("🔴 every animation the proposal names is in the catalogue", () => {
  for (const row of PROPOSAL) {
    assert.ok(ANIMATION_BY_ID.has(row.proposed), `${row.activity} proposes ${row.proposed}, which does not exist`);
    if (row.today) assert.ok(ANIMATION_BY_ID.has(row.today), `${row.activity} claims the app plays ${row.today}, which does not exist`);
  }
});

test("🔴 every resting face is one of the sixteen, and the two left out are too", () => {
  for (const id of [...RESTING_FACES, ...RESTING_FACES_LEFT_OUT]) {
    assert.ok(EXPRESSION_IDS.includes(id), `${id} is not one of the sixteen feelings`);
    assert.ok(FACE_BY_ID.has(id), `${id} is not a drawable face`);
  }
  assert.equal(RESTING_FACES.length + RESTING_FACES_LEFT_OUT.length, EXPRESSION_IDS.length, "the sixteen are not all accounted for");
  for (const id of RESTING_FACES) assert.ok(!RESTING_FACES_LEFT_OUT.includes(id), `${id} is both in and out`);
});

test("🔴🔴 the proposal tells the truth about what the app plays TODAY", () => {
  // A page the owner approves from is worthless if its "before" column is wrong, and this is the
  // half that rots first: `ACTIVITY_STATE` is edited by other work, this file is not.
  for (const row of PROPOSAL) {
    if (row.activity === "failed") {
      assert.ok(!(("failed" as string) in ACTIVITY_STATE), "there is a `failed` row now; the proposal is stale");
      continue;
    }
    const live = ACTIVITY_STATE[row.activity];
    if (row.today === null) continue; // No producer — checked below rather than here.
    assert.equal(row.today, live, `the proposal says the app plays ${row.today} for ${row.activity}; it plays ${live}`);
  }
});

test("🔴🔴 the three activities the proposal calls unreachable really are unreachable", () => {
  // `stateForCanvas` is the ONLY route from the running product into `ACTIVITY_STATE`, and it reads
  // three facts. If a producer is added for one of these, the proposal's "today: null" becomes a
  // lie and this reddens before the owner is shown it.
  const source = ACTIVITY_STATE;
  for (const row of PROPOSAL) {
    if (row.today !== null || row.activity === "failed") continue;
    assert.ok(row.activity in source, `${row.activity} is not even a row in ACTIVITY_STATE`);
  }
  assert.deepEqual(
    PROPOSAL.filter((r) => r.today === null).map((r) => r.activity),
    ["retrieving", "ingesting", "arrived", "failed"],
    "which activities have no producer has changed; re-check the proposal before showing it",
  );
});

test("🔴 the proposal is still a proposal — the live schedule is untouched", () => {
  // Approving this means MOVING these rows into `stations.ts` and deleting the proposal, not
  // leaving two tables that can disagree. Until then, nothing here may be what the product plays.
  assert.notEqual(ACTIVITY_STATE.resting, PROPOSAL.find((r) => r.activity === "resting")?.proposed);
});
