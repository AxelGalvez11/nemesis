import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { buildSourceContext } from "@/lib/sources/source-context";

import { extractKnowledgeObjects } from "./knowledge-extraction";
import { objectivesForKnowledge } from "./learning-objective";
import { evidenceFromEvaluation, retrievalPromptFor } from "./objective-task";

// 🔴 A DESIGN DOCUMENT NOBODY CHECKS BECOMES FICTION, AND FICTION ABOUT WHAT IS BUILT IS WORSE
// THAN NO DOCUMENT. `docs/canvas-cognitive-runtime.md` describes a target architecture, and its §12
// is the ONE section that describes today — which is exactly the section that rots first, silently,
// because nothing breaks when it does.
//
// 🔴 SO THESE COMPARE CAPABILITIES, NEVER PROSE. Every expectation below is computed by RUNNING the
// code and is checked against a machine-readable block in the document. Rewording a sentence,
// restructuring a section or rewriting the whole narrative changes nothing here. Teaching the
// extractor a second knowledge type, giving an objective a second operation, or writing a new field
// into evidence fails until the declared matrix acknowledges it — which is the only drift worth a
// test. A guard that broke on an edited sentence would be trained away within a week.

const DOC = readFileSync(new URL("../../../../docs/canvas-cognitive-runtime.md", import.meta.url), "utf8");

/** The declared matrix, read from the fenced block after the `capability-matrix` marker. */
function declared(key: string): string[] {
  const marker = DOC.indexOf("<!-- capability-matrix -->");
  assert.notEqual(marker, -1, "§12 must carry a machine-readable capability matrix");
  const open = DOC.indexOf("```", marker);
  const close = DOC.indexOf("```", open + 3);
  assert.ok(open !== -1 && close !== -1, "the capability matrix must be a fenced block");

  const line = DOC.slice(open, close)
    .split("\n")
    .find((row) => row.trimStart().startsWith(`${key}:`));
  assert.ok(line, `the capability matrix must declare ${key}`);
  return line
    .slice(line.indexOf(":") + 1)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();
}

function glossaryContext() {
  const model: DocumentModel = {
    blocks: [
      {
        headingPath: [],
        id: "t1",
        kind: "table",
        table: { headerRows: 1, rows: [["Generic", "Brand"], ["losartan", "Cozaar"]] },
        text: "",
        unit: 0,
      } as DocBlock,
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

test("🔴 the declared knowledge types are the ones the extractor mints", () => {
  const minted = [...new Set(extractKnowledgeObjects(glossaryContext()).objects.map((o) => o.type))].sort();
  assert.deepEqual(
    minted,
    declared("knowledge_types"),
    "the extractor and §12 disagree about which knowledge types exist",
  );
});

test("🔴 the declared cognitive operations are the ones objectives carry", () => {
  const carried = [
    ...new Set(
      extractKnowledgeObjects(glossaryContext()).objects.flatMap((object) =>
        objectivesForKnowledge(object).map((objective) => objective.capability),
      ),
    ),
  ].sort();
  assert.deepEqual(
    carried,
    declared("cognitive_operations"),
    "objectives and §12 disagree about which cognitive operations exist",
  );
});

test("🔴 the declared evidence fields are the ones a demonstration actually writes", () => {
  // 🔴 BY BUILDING ONE, NOT BY READING THE SOURCE. Whatever a demonstration actually carries is
  // what the matrix must declare, so a field added or removed anywhere on this path shows up here
  // rather than being noticed months later.
  const [objective] = objectivesForKnowledge(extractKnowledgeObjects(glossaryContext()).objects[0]!);
  const built = evidenceFromEvaluation({
    canvasId: null,
    evaluation: {
      confidence: 0.9,
      demonstrated: ["the brand for losartan"],
      feedback: "",
      misconceptions: [],
      missing: [],
      verdict: "strong",
    },
    objectiveRowId: "row-1",
    occurredAt: "2026-08-12T00:00:00.000Z",
    prompt: retrievalPromptFor(objective!, "prompt-1"),
    response: { text: "Cozaar", tookMs: 14_200, via: "typed" },
  });

  assert.deepEqual(
    Object.keys(built).sort(),
    declared("evidence_fields"),
    "evidence writes fields §12 does not declare (or declares fields it does not write)",
  );

  // 🔴 THE MEASUREMENT SURVIVES VERBATIM. This assertion used to say the opposite — that latency
  // reached nothing — and it FAILED the moment Track B1 preserved it, which is what a drift guard is
  // for. Its successor guards the property that replaced it: the number that was measured is the
  // number that is stored, with no band, bucket or verdict applied on the way.
  assert.equal(built.responseLatencyMs, 14_200, "the measurement must survive unaltered");
  assert.ok(
    JSON.stringify(built).includes("14200"),
    "latency must reach the record — see evidence-observations.test.ts for the no-interpretation rule",
  );
});
