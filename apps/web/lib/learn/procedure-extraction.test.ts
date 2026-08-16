// Numbering is document structure, not proof that the content is a procedure.
//
// `procedure-sequence.ts` still preserves ordered runs for source legibility. Knowledge extraction
// no longer upgrades every such run into something a learner must execute in order. The grounded
// semantic reader owns that judgment and `semantic-grounded.test.ts` proves an explicitly stated
// procedure still becomes ordered, stageable knowledge.

import assert from "node:assert/strict";
import { test } from "node:test";

import { structureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { buildSourceContext } from "@/lib/sources/source-context";

import { extractKnowledgeObjects } from "./knowledge-extraction";

function contextOf(blocks: Partial<DocBlock>[]) {
  const model: DocumentModel = {
    blocks: blocks.map((block, index) => ({
      headingPath: [],
      id: `b${index}`,
      kind: "paragraph",
      text: "",
      unit: 0,
      ...block,
    }) as DocBlock),
    format: "docx",
    title: "A document",
    units: [{ index: 0, kind: "page" }],
  };
  return buildSourceContext({
    sourceId: "lib-1",
    sourceKind: "docx",
    structure: JSON.parse(JSON.stringify(structureEnvelope({ model, text: "", title: model.title }))),
  });
}

test("a numbered instructional-looking list is preserved but not automatically declared a procedure", () => {
  const context = contextOf([
    { kind: "heading", text: "Filing a motion" },
    { depth: 0, headingPath: ["Filing a motion"], kind: "listItem", marker: "1.", text: "Serve the opposing party." },
    { depth: 0, headingPath: ["Filing a motion"], kind: "listItem", marker: "2.", text: "File proof of service." },
  ]);
  const result = extractKnowledgeObjects(context);
  assert.deepEqual(result.objects.filter((object) => object.type === "procedure"), []);
  assert.equal(result.outcome, "complete");
  assert.deepEqual(result.refusals.map((entry) => entry.reason), ["no-tables"]);
});

test("numbered questions and answer keys cannot become sequence objectives", () => {
  const context = contextOf([
    { kind: "heading", text: "Review questions" },
    { depth: 0, headingPath: ["Review questions"], kind: "listItem", marker: "1.", text: "What is hypertension?" },
    { depth: 0, headingPath: ["Review questions"], kind: "listItem", marker: "2.", text: "Compare ACE inhibitors and ARBs." },
    { depth: 0, headingPath: ["Review questions"], kind: "listItem", marker: "3.", text: "Answer: both affect RAAS." },
  ]);
  assert.equal(extractKnowledgeObjects(context).objects.some((object) => object.type === "procedure"), false);
});
