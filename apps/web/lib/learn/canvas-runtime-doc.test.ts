import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { buildSourceContext } from "@/lib/sources/source-context";

import { extractKnowledgeObjects } from "./knowledge-extraction";
import { objectivesForKnowledge } from "./learning-objective";

// 🔴 A DESIGN DOCUMENT NOBODY CHECKS BECOMES FICTION, AND FICTION ABOUT WHAT IS BUILT IS WORSE
// THAN NO DOCUMENT. `docs/canvas-cognitive-runtime.md` describes a target architecture, and its §12
// is the ONE section that describes today — which is exactly the section that rots first, silently,
// because nothing breaks when it does. These assertions tie its headline claims to the code, so
// widening the runtime forces the status section to be updated in the same change.
//
// Deliberately small. This guards the claims a future agent would act on — "only associations
// exist", "only recall exists", "latency is thrown away" — not the prose around them.

const DOC = readFileSync(new URL("../../../../docs/canvas-cognitive-runtime.md", import.meta.url), "utf8");

function unitsOf(rows: string[][]) {
  const model: DocumentModel = {
    blocks: [
      { headingPath: [], id: "t1", kind: "table", table: { headerRows: 1, rows }, text: "", unit: 0 } as DocBlock,
    ],
    format: "docx",
    title: "A document",
    units: [{ index: 0, kind: "page" }],
  };
  return buildSourceContext({
    sourceId: "lib-1",
    sourceKind: "docx",
    structure: JSON.parse(JSON.stringify(structureEnvelope({ model, text: "Some words.", title: "A document" }))),
  });
}

test("🔴 the status section still says what the extractor actually mints", () => {
  const context = unitsOf([["Generic", "Brand"], ["losartan", "Cozaar"]]);
  const types = new Set(extractKnowledgeObjects(context).objects.map((object) => object.type));

  assert.deepEqual([...types], ["association"], "a second knowledge type now exists");
  assert.ok(
    DOC.includes("1 of 19 — `association`"),
    "§12 must be updated when the extractor mints a knowledge type beyond association",
  );
});

test("🔴 the status section still says which cognitive operations exist", () => {
  const context = unitsOf([["Generic", "Brand"], ["losartan", "Cozaar"]]);
  const capabilities = new Set(
    extractKnowledgeObjects(context).objects.flatMap((object) =>
      objectivesForKnowledge(object).map((objective) => objective.capability),
    ),
  );

  assert.deepEqual([...capabilities], ["recall"], "a second cognitive operation now exists");
  assert.ok(
    DOC.includes("1 of 16 — `recall`"),
    "§12 must be updated when an objective carries an operation beyond recall",
  );
});

test("🔴 the status section still says response latency is thrown away", () => {
  // The largest cheap gap in the learner model, and the one §13 says can be closed without waiting
  // for the compositional surface. The moment `tookMs` reaches evidence, this claim is false.
  const built = readFileSync(new URL("./objective-task.ts", import.meta.url), "utf8");
  const evidenceCarriesLatency = /tookMs/.test(
    built.slice(built.indexOf("export function evidenceFromEvaluation")),
  );

  assert.equal(evidenceCarriesLatency, false, "evidence now carries latency");
  assert.ok(
    DOC.includes("**Response latency captured but unused**"),
    "§12 must be updated when latency becomes evidence",
  );
});

test("🔴 the document leads with the warning that it is a target, not a description", () => {
  // The one sentence that stops a future agent reading §1-§11 as a changelog.
  const head = DOC.slice(0, 1200);
  assert.ok(head.includes("INTENDED cognitive architecture"));
  assert.ok(head.includes("It is a target, not a"));
  assert.ok(head.includes("§12 is the only section that describes today"));
});
