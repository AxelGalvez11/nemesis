import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { selectionActions } from "@/lib/learn/canvas-selection";

// 🔴🔴🔴 THE HIGHLIGHT TOOLBAR WAS UNREACHABLE ON EVERY CANVAS WITH NO READING MATERIAL.
//
// Reported 2026-08-20: *"what happened to the canvas highlight feature for adding vocabulary or
// explaining further?"* — with a screenshot of text highlighted on a reply and no toolbar.
//
// Nothing had been deleted. `readCanvasSelection` refuses any selection with no
// `[data-selectable-id]` ancestor, and `selectableRegion()` — the only thing that writes that
// attribute — was called from exactly ONE place in the whole app: `canvas-document.tsx`, on a
// document block. A topic-only canvas has `canvas.blocks.length === 0` by design (§24), so it has
// no marked region anywhere and the feature could not be invoked at all.
//
// 🔴 AND #695 TURNED "ABSENT" INTO "BROKEN". Selection went on canvas-wide, so a learner could
// finally drag across a reply and get nothing back. Highlighting that does nothing reads as a dead
// feature; before, the text simply refused to highlight.
//
// Everything behind it already worked without a block: `explainSelection` omits `passage` when
// there is none, `askAboutSelection` spreads `blockId` conditionally, and remembered definitions
// key on the term. The capability was whole; only the way in was missing.

const canvas = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const policy = readFileSync(new URL("./canvas-policy-view.tsx", import.meta.url), "utf8");
const document_ = readFileSync(new URL("./canvas-document.tsx", import.meta.url), "utf8");

/** Comments stripped, because this file necessarily discusses the very attribute it checks for. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const canvasCode = code(canvas);
const policyCode = code(policy);

// ── Every surface that shows Nemesis's words can be highlighted ─────────────

test("🔴🔴 the conversational reply is a selectable region", () => {
  // The exact surface in the screenshot. Calibration: delete the spread and this reddens alone.
  // 🔴 REPOINTED 2026-08-20. This pinned `<p {...selectableRegion("reply")}>{session.aside.text}</p>`
  // and went red when the reply started rendering through `AssistantMarkdown`, so its `[n]` markers
  // could become inline favicon pills. The element changed; the property did not. What matters is
  // that the reply carries a marker and that the marker is on a wrapper holding only this prose.
  // 🔴 REPOINTED 2026-08-20 (again). This pinned the literal id, and a reply is no longer ONE prose
  // run: it splits around any drawing the model asked for, and each run needs its own region because
  // offsets are measured per marked element. The property is that the reply's prose is markable and
  // that the first run keeps the id other lanes probe by.
  assert.match(canvasCode, /selectableRegion\(index === 0 \? "reply" : `reply-\$\{index\}`\)/);
  assert.match(canvasCode, /<AssistantMarkdown[\s\S]{0,600}?text=\{segment\.text\}/, "the reply no longer renders its own text");
  // 🔴 REPOINTED AGAIN 2026-08-20, and the reason is the reason this comment keeps growing: this
  // line has now pinned an exact call THREE times. The property is that the reply is split before
  // it is rendered, not how many arguments the splitter takes — it gained a second one when a reply
  // became able to draw all nine visual kinds rather than only a molecule.
  assert.match(canvasCode, /replySegments\(replyText\b/, "the reply is no longer split into prose and drawings");
});

test("🔴🔴 the claim being taught is too, both of its lines", () => {
  // The most likely place to need a word defined, and it was the least reachable: a learner could
  // look a term up inside their own lecture but not inside the sentence Nemesis chose to teach.
  assert.match(policyCode, /selectableRegion\("claim-heading"\)/);
  assert.match(policyCode, /selectableRegion\("claim-body"\)/);
});

test("🔴 and so is the question", () => {
  // Looking a word up in the question is not answering it: `askAboutSelection` calls `recordEvent`,
  // never `recordEvidence`. Without this a learner who does not know what a word MEANS can only
  // guess or leave.
  assert.match(policyCode, /selectableRegion\("question"\)/);
});

test("🔴🔴 the marker goes on the element holding ONLY that text", () => {
  // `readCanvasSelection` measures offsets against the marked element and refuses when the measured
  // string does not match what the browser reports selected. The reply's wrapper also holds source
  // pills, the offer line and two buttons, so marking the wrapper would make every selection in it
  // fail the integrity check — the feature would look exactly as broken as before, with a guard
  // saying it was fixed.
  const replyAt = canvasCode.indexOf('selectableRegion(index === 0 ? "reply"');
  assert.notEqual(replyAt, -1, "the reply is no longer marked");
  const marked = canvasCode.slice(replyAt - 60, replyAt + 80);
  assert.match(marked, /<div |<p /, "the marker is not on a dedicated element");
  assert.ok(
    !/className="canvas-swap[^"]*"\s*\{\.\.\.selectableRegion/.test(canvasCode),
    "the marker is on the wrapper that also holds the pills and buttons",
  );
  // 🔴🔴 AND NOT AROUND A DRAWING EITHER. One marker wrapping prose AND an `<svg>` would fail
  // `readCanvasSelection`'s integrity check on every selection inside it — the measured text would
  // not match what the browser reports selected, and the toolbar would silently never appear. The
  // split puts each prose run in its own marked div and the visual outside all of them.
  assert.match(canvasCode, /segment\.kind === "visual" \? \(\s*<SemanticVisual/);
});

// ── What the toolbar may offer where there is nothing to rewrite ─────────────

test("🔴🔴 'Simpler' is NOT offered on a region with no block behind it", () => {
  // `simplifySelection` REWRITES the passage and writes it back to `canvas.blocks`. A reply, a
  // taught claim and a question are the policy's words for one screen; there is no stored block to
  // write to, so offering the option would be a control that silently does nothing.
  //
  // 🔴 THE FILTER ALREADY EXISTED — this asserts the new regions inherit it by declining
  // `rewritable`, rather than adding a second rule. Calibration: pass `{ rewritable: true }` to any
  // of the three call sites and this reddens.
  for (const shape of ["word", "phrase", "passage"] as const) {
    const offered = selectionActions(shape, false).map((option) => option.action);
    assert.ok(!offered.includes("simpler"), `${shape} still offers simpler when nothing is rewritable`);
    assert.ok(offered.length > 0, `${shape} offers nothing at all`);
  }
  for (const site of ['selectableRegion(index === 0 ? "reply"', 'selectableRegion("claim-heading")', 'selectableRegion("claim-body")', 'selectableRegion("question")']) {
    const source = canvasCode.includes(site) ? canvasCode : policyCode;
    const at = source.indexOf(site);
    assert.notEqual(at, -1, `${site} is gone`);
    assert.ok(!source.slice(at, at + 60).includes("rewritable"), `${site} claims to be rewritable`);
  }
});

test("🔴 a document block still IS rewritable, so this took nothing away", () => {
  // The one region that legitimately rewrites must keep doing so; a fix that made every region
  // non-rewritable would pass every assertion above and delete a feature.
  assert.match(code(document_), /rewritable/, "the document block no longer claims to be rewritable");
  const withBlock = selectionActions("passage", true).map((option) => option.action);
  assert.ok(withBlock.includes("simpler"), "simpler is gone even where there is a block to rewrite");
});

// ── Inline citations, and the misattribution that was one line away ─────────

test("🔴🔴🔴 an inline [n] resolves against the INDEX-ALIGNED list, never the cited one", () => {
  // THE defect this change came closest to shipping, and it would have looked like a feature.
  //
  // `citedWebResults` returns the pages in ANSWER order: an answer citing [4] then [1] gives
  // `[fourth, first]`. `AssistantMarkdown` resolves a marker by INDEX — `sources[n - 1]` — so
  // handing it that list makes [4] open whichever page happened to be cited fourth, and drops [6]
  // and [7] entirely. The owner's own screenshot shows markers [1] [4] [6] [7] against four pills,
  // which is exactly the shape that misattributes.
  //
  // A citation that resolves to real text from the wrong place is the failure `knowledge-citation.ts`
  // calls "the exact defect the whole two-locator design exists to make impossible".
  //
  // Calibration: pass `session.aside.sources` to the renderer and this reddens.
  // 🔴 THE HOISTED VALUE, because a `.map` callback cannot carry the non-null narrowing and a `!`
  // here would assert exactly the thing that has gone wrong on this surface before.
  assert.match(canvasCode, /const replyConsulted = session\.aside\?\.blockId === null \? session\.aside\.consulted : undefined;/);
  assert.match(canvasCode, /sources=\{replyConsulted\}/);
  assert.ok(
    !/sources=\{replySources\}|sources=\{session\.aside\.sources\}/.test(canvasCode),
    "inline citations resolve against the answer-ordered list and will attribute sentences to the wrong page",
  );
});

test("🔴🔴 a searched answer still shows its pages when the model cited none", () => {
  // Measured in a browser: "whats the latest news on ai?" returned an answer plainly built from
  // live pages with not one [n] in it, so `citedWebResults` returned empty and the row vanished.
  // The search ran and was paid for; a surface showing nothing claims the model knew it alone.
  assert.match(canvasCode, /const replySources =/);
  assert.match(canvasCode, /session\.aside\?\.sources\?\.length \? session\.aside\.sources : session\.aside\?\.consulted \?\? \[\]/);
  assert.match(canvasCode, /\{replySources\.length > 0 && \(/);
});
