// The macromolecule pass: names out, accessions back, and a remembered id never surviving.

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyResolvedMacromolecules,
  collectMacromoleculeNames,
  mightResolveMacromolecule,
  type MacromoleculeResolution,
} from "./macromolecule-resolve";

const LESSON = {
  blocks: [
    {
      content: "Myoglobin stores oxygen in muscle.",
      type: "paragraph",
      visual: { kind: "macromolecule", learningGoal: "See the fold", molecule: "myoglobin" },
    },
  ],
};

const RESOLVED: MacromoleculeResolution = {
  ok: true,
  structure: { accession: "1MBN", name: "myoglobin", provider: "rcsb", title: "The stereochemistry of the protein myoglobin" },
};

test("the cheap test comes first, so an answer with no macromolecule in it pays nothing", () => {
  assert.equal(mightResolveMacromolecule('{"say":"hello"}'), false);
  assert.equal(mightResolveMacromolecule(JSON.stringify(LESSON)), true);
});

test("names are collected in order and bounded", () => {
  assert.deepEqual(collectMacromoleculeNames(LESSON), ["myoglobin"]);
  const many = { blocks: Array.from({ length: 6 }, (_, index) => ({ visual: { kind: "macromolecule", molecule: `m${index}` } })) };
  assert.equal(collectMacromoleculeNames(many).length, 4);
});

test("a resolved name becomes an accession with the resolver's own stamp and title", () => {
  const out = applyResolvedMacromolecules(LESSON, [RESOLVED]) as typeof LESSON;
  const visual = out.blocks[0]!.visual as Record<string, unknown>;
  assert.equal(visual.kind, "macromolecule");
  assert.equal(visual.accession, "1MBN");
  assert.equal(visual.title, "The stereochemistry of the protein myoglobin");
  assert.deepEqual(visual.resolvedFrom, { id: "1MBN", name: "myoglobin", provider: "rcsb" });
  assert.equal("molecule" in visual, false);
});

test("🔴 a model cannot claim an accession, a title or a stamp it did not earn", () => {
  const smuggled = {
    visual: {
      accession: "9XYZ",
      kind: "macromolecule",
      learningGoal: "g",
      molecule: "myoglobin",
      resolvedFrom: { id: "9XYZ", name: "myoglobin", provider: "rcsb" },
      title: "A convincing title",
    },
  };
  const out = applyResolvedMacromolecules(smuggled, [RESOLVED]) as { visual: Record<string, unknown> };
  assert.equal(out.visual.accession, "1MBN");
  assert.equal(out.visual.title, "The stereochemistry of the protein myoglobin");
  assert.deepEqual(out.visual.resolvedFrom, { id: "1MBN", name: "myoglobin", provider: "rcsb" });
});

test("🔴 a bare accession with no name is dropped whole — there is no legitimate remembered-id case", () => {
  const remembered = { blocks: [{ content: "prose survives", visual: { accession: "1HHO", kind: "macromolecule", learningGoal: "g" } }] };
  const out = applyResolvedMacromolecules(remembered, []) as { blocks: Array<Record<string, unknown>> };
  assert.equal("visual" in out.blocks[0]!, false);
  assert.equal(out.blocks[0]!.content, "prose survives");
});

test("a name that did not resolve costs the picture and not the answer", () => {
  const out = applyResolvedMacromolecules(LESSON, [{ detail: "nothing", ok: false, reason: "not-found" }]) as {
    blocks: Array<Record<string, unknown>>;
  };
  assert.equal("visual" in out.blocks[0]!, false);
  assert.equal(out.blocks[0]!.content, "Myoglobin stores oxygen in muscle.");
});
