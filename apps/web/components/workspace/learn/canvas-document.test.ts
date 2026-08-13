import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// J1/J2/J3 (docs/canvas-v1-acceptance.md, owner architectural correction 2026-08-13): the learner
// should not manage AI-generated blocks. "I already know this" (a mastery claim with no evidence
// behind it, hiding material on that claim) and the manual per-block fold (a document-reader
// remnant -- resolution is Brain's job, driven by evidence) are both removed from the primary
// Canvas; the provenance toolbar is replaced by a quiet inline citation marker (J3). This reads
// the component's source rather than rendering it, matching the convention
// canvas-runtime-branch.test.ts and canvas-policy-view.test.ts set -- this app has no DOM harness.

const SOURCE = readFile(new URL("./canvas-document.tsx", import.meta.url), "utf8");

test("🔴 no self-report 'I already know this' control exists", async () => {
  const source = await SOURCE;
  // Matches the live JSX attribute a rendered control would carry, not prose that merely
  // discusses the removal (this file's own comments name the old label while explaining why
  // it's gone, so a bare phrase match would false-positive on its own documentation).
  assert.doesNotMatch(source, /label="I already know this"/);
  assert.doesNotMatch(source, /icon="check"/, "the mastery-claim checkmark control is gone");
  assert.doesNotMatch(source, /onMarkKnown/, "nothing in this file should still reference it");
});

test("🔴 the bulk 'hidden as already known' control is gone with it", async () => {
  const source = await SOURCE;
  // This control existed only to reverse the self-report hide -- removing one without the other
  // would leave a button that can never fire (nothing can set block.known from here any more).
  assert.doesNotMatch(source, /hidden as already known/);
  assert.doesNotMatch(source, /!block\.known/, "the self-report filter itself is gone, not just hidden");
});

test("🔴 no manual per-block fold control exists", async () => {
  const source = await SOURCE;
  assert.doesNotMatch(source, /Hide this detail/);
  assert.doesNotMatch(source, /icon="fold"/, "the manual fold trigger is gone");
});

test("the collapsed-block render path survives -- it can still be model-driven", async () => {
  const source = await SOURCE;
  // block.collapsed itself, and the click-to-reopen affordance on an already-collapsed block,
  // are NOT part of J2: canvas-ops.ts's collapse_block operation can still set this, and Brain's
  // future adaptive compression is expected to reuse the same field. Only the learner's manual
  // trigger (the fold button above) is what J2 removes.
  assert.match(source, /block\.collapsed \?/, "the collapsed render branch must still exist");
  assert.match(source, /onToggleCollapsed/, "reopening a collapsed block must still work");
});

test("🔴 provenance is a citation marker now, not a floating toolbar button (J3)", async () => {
  const source = await SOURCE;
  // The old hover-only icon buttons and their shared BlockControl wrapper are gone entirely --
  // not just the two J1/J2 controls, the provenance ones too, since J3 replaces the toolbar
  // shape itself, not just two of its three remaining buttons.
  assert.doesNotMatch(source, /function BlockControl/, "the toolbar-button component is fully removed");
  assert.doesNotMatch(source, /icon="link"/);
  assert.doesNotMatch(source, /icon="question"/);
  assert.doesNotMatch(source, /onAskSource/, "the per-block ask-the-model button is gone");
  // What replaced it: an always-present marker (no opacity-0/group-hover gating on it, unlike
  // the old toolbar) wired to the same onToggleSource the old link button used, gated on the
  // same cited/uncited distinction (sourceRefs present) the old two-icon split encoded.
  assert.match(source, /const cited = \(block\.sourceRefs\?\.length \?\? 0\) > 0/);
  assert.match(source, /\{cited &&/, "the marker must still be conditional on having something to cite");
  assert.match(source, /onClick=\{onToggleSource\}/);
  assert.match(source, /align-super/, "must read as an inline citation mark, not a floating control");
});

test("an uncited block gets no marker, and no dedicated ask button either", async () => {
  const source = await SOURCE;
  // Silence where there is nothing to cite -- the same rule canvas-selection-menu.tsx already
  // applies to the term-lookup popover's sourceLabel. The capability to ask isn't gone: it's the
  // existing select-and-type-"where" path in learning-canvas.tsx's submit(), which needed no
  // change here to keep working.
  //
  // Matches the removed button's exact `label=` attribute, not the bare phrase -- SourcePanel's
  // own (untouched, legitimate) doc comment below still asks "where did this come from?" in
  // prose, describing what it answers, which is a different thing from the button that used to
  // ask it.
  assert.doesNotMatch(source, /label="Where did this come from\?"/, "the dedicated ask-button is gone");
});
