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
  // the old toolbar) wired to onToggleSource, gated on the same cited/uncited distinction
  // (sourceRefs present) the old two-icon split encoded. The gate itself is pinned exactly --
  // only the glyph inside it and what it opens changed in the compact-UI pass.
  assert.match(source, /const cited = \(block\.sourceRefs\?\.length \?\? 0\) > 0/);
  assert.match(source, /\{cited &&/, "the marker must still be conditional on having something to cite");
  assert.match(source, /onClick=\{\(event\) => onToggleSource\(event\.currentTarget\.getBoundingClientRect\(\)\)\}/);
  assert.match(source, /align-super/, "must read as an inline citation mark, not a floating control");
});

test("an uncited block gets no marker, and no dedicated ask button either", async () => {
  const source = await SOURCE;
  // Silence where there is nothing to cite -- the same rule canvas-selection-menu.tsx already
  // applies to the term-lookup popover's sourceLabel. The capability to ask isn't gone: it's the
  // existing select-and-type-"where" path in learning-canvas.tsx's submit(), which needed no
  // change here to keep working.
  //
  // Matches the removed button's exact `label=` attribute, not the bare phrase -- the current
  // popover's own (legitimate) doc comment still asks "where did this come from?" in prose,
  // describing what it answers, which is a different thing from a button that used to ask it.
  assert.doesNotMatch(source, /label="Where did this come from\?"/, "the dedicated ask-button is gone");
});

// Compact-UI pass (owner spec, 2026-08-12): the marker becomes a stable, numbered citation
// instead of an unlabelled dot, and what it opens becomes a floating, dismissible popover
// instead of a panel printed inline in the document's own flow.
test("🔴 the citation marker is numbered off the attached-sources list, not off render order", async () => {
  const source = await SOURCE;
  // Blocks get rewritten wholesale by "Simpler"; canvas.sources does not get silently reordered
  // by teaching. Numbering off the sources list is numbering that cannot renumber everything
  // above an edit the way numbering off block position or ref order would.
  assert.match(source, /function citationIndices/);
  assert.match(
    source,
    /canvas\.sources\.forEach\(\(source, index\) => \{\s*if \(cited\.has\(source\.id\)\) indices\.push\(index \+ 1\)/,
  );
  assert.doesNotMatch(source, />\s*●\s*</, "the old unlabelled dot glyph must not still be the marker's content");
});

test("🔴 the source preview floats and dismisses -- it is not the old inline panel", async () => {
  const source = await SOURCE;
  // The old panel rendered directly in the block's own flow and pushed later content down.
  assert.doesNotMatch(source, /function SourcePanel/, "the inline-panel component is fully replaced");
  assert.match(source, /function CanvasSourcePreview/);
  assert.match(source, /className="fixed z-40"/, "must float, positioned independently of document flow");
  // Dismiss on outside-click and Escape, the same contract every other floating panel on this
  // surface honours (see canvas-controls.tsx's useDismiss and canvas-selection-menu.tsx).
  assert.match(source, /addEventListener\("mousedown", onDown\)/);
  assert.match(source, /event\.key === "Escape"/);
  // Reuses the selection menu's own clearance constants rather than re-guessing them -- two
  // popovers on the same page computing the same safe band two different ways is how they drift.
  assert.match(source, /import \{ BOTTOM_KEEPOUT, TOP_KEEPOUT \} from "\.\/canvas-selection-menu"/);
});

test("🔴 the preview still reads the stored excerpt, and still never asks a model", async () => {
  const source = await SOURCE;
  // SourcePanel's original guarantee, carried into the popover unchanged: the text shown is the
  // excerpt the block was generated from, resolved from canvas.sources, not requested fresh.
  assert.match(source, /quotedExcerpt\(canvas\.sources, ref\)/);
  assert.doesNotMatch(source, /fetch\(|await .*generate|model\.(generate|complete|ask)/i);
});

test("no 'Open source' link -- there is no source-viewer route to point it at", async () => {
  const source = await SOURCE;
  // Omitted deliberately rather than built against a guessed destination -- see the compact-UI
  // deliverable notes for the follow-up this needs from product direction.
  assert.doesNotMatch(source, />\s*Open source\s*</);
});

test("🔴 REVERSED: the exposure-acknowledgment button is DELETED, and Continue is the one control", async () => {
  const source = await SOURCE;
  // 🔴 THE OLD ASSERTION IS RECORDED RATHER THAN DELETED. It read: *"the exposure-acknowledgment
  // button is quieter, but it STILL RENDERS and still advances"*, on the reasoning that it was a
  // real signal (it rotated the recall queue) rather than a mastery claim.
  //
  // Two things falsified it. #585 proved the control had not rendered in any observable state
  // since the six-stage retirement — so "it still renders" was already false when written. And the
  // owner has now ruled it out by description: *"The only button should be 'continue' below
  // reading passages, thats it."* Re-testing and weak-spot targeting are owed automatically (§18,
  // objective ordering); a button for either is the learner managing the system, which §26 forbids.
  assert.doesNotMatch(source, /\{next && \(/, "the legacy advance control must be gone");
  assert.doesNotMatch(source, /onClick=\{onAdvance\}/, "and so must its handler");
  assert.doesNotMatch(source, /NextAction/, "and the type it depended on");

  // What replaces it is one control, from the shared label, gated by the shared owner.
  assert.match(source, /\{showContinue && \(/, "Continue renders from the derived property");
  assert.match(source, /\{CONTINUE_LABEL\}/, "and never from a literal — three equal literals is how ACCEPTED_MATERIAL drifted");
  assert.doesNotMatch(
    source,
    /bg-\(--ui-text-primary\)[^"]*text-\(--ui-bg-editor\)/,
    "🔴 restrained, per the owner: 'not a giant black CTA… it is the learner saying I have read this'",
  );
});
