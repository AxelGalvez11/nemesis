import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { domainLabel, sourceLabel } from "../favicon";
import { markForBusy, THINKING_COPY, THINKING_MARK, thinkingMark, type ThinkingPhase } from "./thinking-phases";

// Owner 2026-08-24: icons on the thinking preview, and favicons while it searches. The rule the
// captions live under applies unchanged to a mark — it is a claim about what Nemesis is doing,
// read faster than a sentence and questioned less.

test("🔴 every phase that can report itself has a mark, and nothing else does", () => {
  const phases = Object.keys(THINKING_COPY) as ThinkingPhase[];
  for (const phase of phases) {
    assert.ok(THINKING_MARK[phase], `${phase} has a caption but no mark`);
  }
  assert.equal(
    Object.keys(THINKING_MARK).length,
    phases.length,
    "a mark exists for a phase this runtime cannot emit — see the header of thinking-phases.ts",
  );
});

test("🔴 the mark follows the SAME precedence as the caption beside it", () => {
  // learning-canvas.tsx builds systemLabel as: busy.label → session.work → THINKING_COPY[phase].
  // If this function ordered them differently, the picture and the sentence would eventually
  // describe two different instants — a magnifier next to "Reading your material".
  assert.equal(thinkingMark({ busyKind: "source", phase: "finding_gap" }), "reading", "busy must outrank the phase");
  assert.equal(thinkingMark({ phase: "finding_gap", work: "Looking something up" }), null, "work must outrank the phase");
  assert.equal(thinkingMark({ phase: "mapping_knowledge" }), "mapping");
  assert.equal(thinkingMark({}), null, "a mark appeared with nothing to describe");
});

test("🔴 searching outranks everything, because it is the most specific true thing", () => {
  assert.equal(thinkingMark({ busyKind: "command", searching: true }), "searching");
  assert.equal(thinkingMark({ phase: "reading_source", searching: true }), "searching");
  assert.equal(thinkingMark({ searching: true, work: "Reading the results" }), "searching");
  // ...and only when it is actually true.
  assert.equal(thinkingMark({ busyKind: "command", searching: false }), "writing");
});

test("🔴 a free-text label earns no mark", () => {
  // `session.work` is a sentence with no kind attached. Inferring one from its words would be
  // exactly the keyword-matching this codebase refuses elsewhere — and it would be wrong the
  // first time a label was reworded.
  for (const work of ["Reading the paper", "Searching the web", "Checking your answer", "Anything at all"]) {
    assert.equal(thinkingMark({ work }), null, `"${work}" was matched to a mark by its wording`);
  }
});

test("an unknown busy kind draws nothing rather than guessing", () => {
  assert.equal(markForBusy("something-new"), null);
  assert.equal(markForBusy(null), null);
  assert.equal(markForBusy(undefined), null);
  assert.equal(markForBusy("source"), "reading");
  assert.equal(markForBusy("recall"), "checking");
});

test("the two doors onto the naming rule agree", () => {
  // `domainLabel` takes a bare hostname and `sourceLabel` takes a URL, and they must be the same
  // rule — one delegates to the other, and this is what says so.
  //
  // 🔴 A FUNCTION-LEVEL INVARIANT, NOT A CLAIM ABOUT ANY SURFACE. It was written as "a chip and a
  // source card spell a host the same way", which stopped being true the same day: the searched-
  // domain chips print the BARE HOSTNAME instead, because title-casing a host invents misspellings
  // of real organisations — "Bbc", "Jstor" — and does it hardest to the most recognisable sources.
  // The functions still have to agree with each other; what reads them is their own decision.
  for (const host of ["pubmed.ncbi.nlm.nih.gov", "en.wikipedia.org", "www.bbc.co.uk", "fifa.com"]) {
    assert.equal(domainLabel(host), sourceLabel(`https://${host}/some/path`), `${host} reads two ways`);
  }
  assert.equal(domainLabel("en.wikipedia.org"), "Wikipedia");
  assert.equal(domainLabel("www.bbc.co.uk"), "Bbc");
  assert.equal(domainLabel(null), null);
  assert.equal(domainLabel(""), null);
});

test("🔴 the dock draws the mark from the prop, not from the caption's words", () => {
  const dock = readFileSync(new URL("../../components/character/character-dock.tsx", import.meta.url), "utf8");
  assert.match(dock, /captionMark \? <ThinkingMark kind=\{captionMark\} \/> : null/, "the mark is not drawn");
  const canvas = readFileSync(new URL("../../components/workspace/learn/learning-canvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /const preparingMark = thinkingMark\(\{/, "the canvas no longer derives a mark");
  assert.match(canvas, /searching: turnInFlight && session\.searchedDomains\.length > 0/, "searching is not gated on a real turn");
});

test("🔴 the shimmer wraps the WORDS, so it cannot paint the mark out", () => {
  // `canvas-thinking-word` clips a moving gradient to glyphs, which it does by setting
  // `color: transparent`. While it sat on the whole caption box the mark beside the words was
  // drawn perfectly and painted in nothing — measured in a browser, `getComputedStyle(svg).color`
  // came back `rgba(0,0,0,0)`. Anything else that ever joins the caption would have met the same
  // fate, so the class belongs on the sentence it animates.
  const dock = readFileSync(new URL("../../components/character/character-dock.tsx", import.meta.url), "utf8");
  assert.match(dock, /<span className="canvas-thinking-word">\{caption\}<\/span>/, "the shimmer left the words");
  assert.ok(
    !/character-caption canvas-thinking-word/.test(dock),
    "🔴 the shimmer is back on the caption BOX, which paints everything that is not text transparent",
  );
  const mark = readFileSync(new URL("../../components/character/thinking-mark.tsx", import.meta.url), "utf8");
  assert.match(mark, /text-\(--ui-text-tertiary\)/, "the mark inherits a colour it cannot rely on");
  assert.ok(!/height="1em"/.test(mark), "the mark is sized in em inside a counter-scaled box");
});
