import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CANVAS_PRESENCES,
  canvasPresentation,
  STANDIN_PRESENCES,
  type CanvasPresence,
} from "./canvas-presence";
import type { CanvasState } from "@/lib/learn/canvas-model";

// 🔴 THE PROPERTY, IN THE LEARNER'S TERMS, AND IT IS NOT A FACT ABOUT ANY EXPRESSION:
//
//     After pressing send with a file attached, does something appear — without the learner
//     having to leave the canvas and come back?
//
// It was NO on production, 3/3, on three different real files. The material parsed perfectly
// (128 excerpts from the PDF, 170 from the PowerPoint); nothing downstream was broken. Pressing
// send moved the canvas into `learn`, `learn` holds no blocks under §24, and the processing state
// was gated on the canvas NOT having begun — so send removed the only thing that was speaking and
// put nothing in its place.
//
// 🔴 WHY THIS IS ASSERTED AS A PROPERTY AND NOT AS "THE preContent GATE IS GONE". A guard pinned
// to the gate could not tell the fix from the defect: `correction-loop.test.ts` required the
// literal expression that CAUSED the bug it was named after, and certified it for months. What is
// asserted here is that the surface presents SOMETHING, whatever mechanism ends up providing it.

/** Every canvas state a stored canvas can actually be in. */
const STATES: readonly CanvasState[] = [
  "empty",
  "sources_attached",
  "orient",
  "learn",
  "targeted_relearn",
  "recall",
  "test",
  "retest",
  "diagnose",
  "complete",
];

interface Case {
  canvasState: CanvasState;
  blocks: number;
  policyPresenting: boolean;
  working: boolean;
}

/** Every combination the runtime can put the surface in. */
function sweep(): Case[] {
  const cases: Case[] = [];
  for (const canvasState of STATES)
    for (const blocks of [0, 3])
      for (const policyPresenting of [false, true])
        for (const working of [false, true])
          cases.push({ blocks, canvasState, policyPresenting, working });
  return cases;
}

const describe = (input: Case) =>
  `state=${input.canvasState} blocks=${input.blocks} policy=${input.policyPresenting} working=${input.working}`;

test("🔴 the surface always presents something — there is no state that paints an empty page", () => {
  for (const input of sweep()) {
    const { presence } = canvasPresentation(input);
    assert.ok(
      (CANVAS_PRESENCES as readonly string[]).includes(presence),
      `${describe(input)} produced ${presence}, which nothing renders`,
    );
  }
});

test("🔴 THE DEFECT: send with material attached must not land on a page with nothing on it", () => {
  // Exactly what `begin()` does — it sets `state: "learn"` and generates nothing (§24). Every
  // policy outcome that is not "ready with a decision" is swept, because all four were blank and
  // which one production hit does not change what the learner is owed.
  for (const policyPresenting of [false]) {
    for (const working of [false, true]) {
      const { presence } = canvasPresentation({
        blocks: 0,
        canvasState: "learn",
        policyPresenting,
        working,
      });

      assert.ok(
        (STANDIN_PRESENCES as readonly string[]).includes(presence),
        `pressing send with a file attached produced "${presence}" — a canvas in "learn" with no blocks and no task must paint a stand-in, not an empty page (working=${working})`,
      );
    }
  }

  // The honest distinction between the two stand-ins: a step really running is named; a canvas
  // with nothing running says so instead of showing a caption that would be theatre.
  assert.equal(
    canvasPresentation({ blocks: 0, canvasState: "learn", policyPresenting: false, working: true })
      .presence,
    "preparing",
  );
  assert.equal(
    canvasPresentation({ blocks: 0, canvasState: "learn", policyPresenting: false, working: false })
      .presence,
    "quiet",
  );
});

test("🔴 it is not special-cased to `learn` — every reading state that has begun is covered", () => {
  // `orient` and `targeted_relearn` reach the same dead end by the same route: reading states
  // whose blocks §24 no longer guarantees. A fix that named `learn` would leave both blank.
  for (const canvasState of ["orient", "targeted_relearn"] as const) {
    for (const working of [false, true]) {
      const { presence } = canvasPresentation({
        blocks: 0,
        canvasState,
        policyPresenting: false,
        working,
      });
      assert.ok(
        (STANDIN_PRESENCES as readonly string[]).includes(presence),
        `${canvasState} with no blocks produced "${presence}"`,
      );
    }
  }
});

test("content is never replaced by a stand-in", () => {
  // The other direction, which a fix that simply always painted a caption would break: whenever
  // there IS something to look at, that is what the learner gets.
  const withTask = canvasPresentation({
    blocks: 0,
    canvasState: "learn",
    policyPresenting: true,
    working: true,
  });
  assert.equal(withTask.presence, "task");

  const withReading = canvasPresentation({
    blocks: 5,
    canvasState: "learn",
    policyPresenting: false,
    working: true,
  });
  assert.equal(withReading.presence, "reading");
});

test("a canvas that has not begun keeps its empty body — the composer is the interface (§1, §4)", () => {
  // 🔴 THE ONE LEGITIMATE EMPTY BODY, ASSERTED SO THE FIX CANNOT REINTRODUCE THE ONBOARDING
  // SCREEN §1 DELETED. `CanvasEmpty` painted "What do you want to learn?" over a dashed upload box
  // and was removed on purpose; a stand-in that filled the pre-content body would be it returning.
  for (const canvasState of ["empty", "sources_attached"] as const) {
    assert.equal(
      canvasPresentation({ blocks: 0, canvasState, policyPresenting: false, working: false })
        .presence,
      "invitation",
    );
    // Attaching a file still reports itself, exactly as it did before.
    assert.equal(
      canvasPresentation({ blocks: 0, canvasState, policyPresenting: false, working: true })
        .presence,
      "preparing",
    );
  }
});

test("🔴 `hasReadingMaterial` is answered from the blocks, not defaulted", () => {
  // `composeSurface` documents this defect itself: the input is optional, absent means "assume
  // there is", and a task told it is sharing with a document that does not exist floats at the top
  // of an empty surface. The single production call site omitted it. Routing every caller through
  // `canvasPresentation` is what makes the omission unexpressible — asserted on the OUTPUT so it
  // holds however the derivation is written.
  const empty = canvasPresentation({
    blocks: 0,
    canvasState: "learn",
    policyPresenting: true,
    working: false,
  });
  assert.equal(empty.regions.sharing, false, "a task must not make room for a document that is not there");

  const full = canvasPresentation({
    blocks: 4,
    canvasState: "learn",
    policyPresenting: true,
    working: false,
  });
  assert.equal(full.regions.sharing, true, "a task beside real reading material must still share");
});

// ── The component obeys it ────────────────────────────────────────────────
//
// The property above is about a value; the defect was about a page. These two close the gap. They
// read the component's source, which is the same instrument `canvas-runtime-branch.test.ts` uses
// and for the same reason: the claim is structural and this app has no DOM harness.

const SOURCE = readFile(new URL("./learning-canvas.tsx", import.meta.url), "utf8");

test("🔴 every stand-in presence has a branch in the canvas that renders it", async () => {
  const source = await SOURCE;

  for (const presence of STANDIN_PRESENCES) {
    if (presence === "invitation") continue; // deliberately paints nothing; asserted above.
    assert.ok(
      source.includes(`"${presence}"`),
      `nothing in learning-canvas.tsx handles the "${presence}" presence — a canvas in that state paints an empty page, which is the defect this file exists to prevent`,
    );
  }
});

test("🔴 the canvas derives what it paints, rather than re-deciding it", async () => {
  const source = await SOURCE;

  // 🔴 ANCHORED TO THE PROPERTY, NOT TO A SPELLING. What must hold is that the component asks one
  // function and takes its answer — not that any particular line looks a particular way. A second
  // direct `composeSurface` call is exactly how `hasReadingMaterial` came to be omitted, and how
  // the regions and the empty-page decision would drift apart again.
  assert.ok(
    source.includes("canvasPresentation("),
    "the canvas no longer derives its presentation from canvasPresentation — the empty-page decision has moved back into the component, where nothing can assert it",
  );
  assert.ok(
    !source.includes("composeSurface("),
    "learning-canvas.tsx calls composeSurface directly again — that call site is the one that omitted `hasReadingMaterial`; it must go through canvasPresentation, which cannot omit it",
  );
});

test("the presence union and the sweep agree", () => {
  // Cheap, and it catches the realistic drift: a member added to the union with no case producing
  // it, or a case producing something the union does not name.
  const produced = new Set<CanvasPresence>(sweep().map((input) => canvasPresentation(input).presence));
  for (const presence of produced)
    assert.ok(
      CANVAS_PRESENCES.includes(presence),
      `${presence} is produced but is not in CANVAS_PRESENCES`,
    );
});
