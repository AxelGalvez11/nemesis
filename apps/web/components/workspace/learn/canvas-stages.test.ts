import assert from "node:assert/strict";
import { test } from "node:test";

import type { CanvasSource } from "@/lib/learn/canvas-model";

import { completionClaim } from "./canvas-stages";

// The global invariant (owner, 2026-08-13): every claim the UI makes about the source must trace
// to source capability. `CanvasComplete` used to print "Mastered" unconditionally the moment
// canvas.state === "complete" — regardless of whether any source existed, or whether the one that
// did could actually be read. `completionClaim` is the pure function the component now gates on;
// tested directly here rather than by reading source text, because unlike canvas-policy-view.tsx
// (stranded behind a broken ownership gate when UI-001 shipped), this screen's mount path is
// live and unconditional — the logic itself is what has to be right.

function source(overrides: Partial<CanvasSource> = {}): CanvasSource {
  return { id: "s1", title: "A source", kind: "pdf", excerpts: [], ...overrides };
}

test("🔴 no source at all never reads as Mastered", () => {
  const claim = completionClaim({ sources: [] });
  assert.notEqual(claim.headline, "Mastered");
  // Never silent: a source gap is a reason to say which gap, not to say nothing.
  assert.ok(claim.note && claim.note.length > 0, "a zero-source completion must explain itself");
});

test("a source Nemesis could only partly read never reads as Mastered", () => {
  const claim = completionClaim({
    sources: [source({ coverageNote: "[Incomplete source: 1 of 24 pages could NOT be read.]" })],
  });
  assert.notEqual(claim.headline, "Mastered");
  assert.ok(claim.note?.includes("One source"));
  assert.match(claim.note ?? "", /gap in Nemesis's reading, not in what you know/);
});

test("several partly-read sources are counted, not just flagged", () => {
  const claim = completionClaim({
    sources: [
      source({ id: "s1", coverageNote: "[gap]" }),
      source({ id: "s2", coverageNote: "[gap]" }),
      source({ id: "s3" }), // this one is fine — must not suppress the count from the other two
    ],
  });
  assert.ok(claim.note?.includes("2 sources"));
});

test("a fully-read source is the only path to Mastered", () => {
  const claim = completionClaim({ sources: [source()] });
  assert.equal(claim.headline, "Mastered");
  assert.equal(claim.note, null);
});

test("one unread source among several fully-read ones still withholds Mastered", () => {
  const claim = completionClaim({
    sources: [source({ id: "s1" }), source({ id: "s2", coverageNote: "[gap]" }), source({ id: "s3" })],
  });
  assert.notEqual(claim.headline, "Mastered");
});
