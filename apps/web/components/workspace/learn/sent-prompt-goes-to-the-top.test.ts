import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the sent prompt goes to the top, and the reply forms under it ─────────────────────────────
//
// Owner, 2026-08-31: *"add the prompt jumps to the top (this is for chatmode not canvas mode)"* —
// the behaviour every chat surface he uses has. Left alone, a send keeps the scroll where it was
// and the answer grows somewhere below the fold.
//
// 🔴 SOURCE-READ, LIKE EVERY OTHER GUARD ON THIS COMPONENT, because this app has no DOM test
// harness (see `plugins-page.test.ts` for the standing reason). The GEOMETRY was verified in a
// real browser against the real layout instead, and both numbers are recorded below.

const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const code = CANVAS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("the guard is reading the real component", () => {
  assert.ok(CANVAS.length > 50_000, `learning-canvas.tsx read as ${CANVAS.length} chars`);
});

test("🔴🔴 the pin runs in the conversation view and NOWHERE ELSE", () => {
  // "chat mode not canvas mode", in his words. The answer view draws one exchange alone with
  // nothing above it, so there is nothing to scroll past and nothing to pin; moving its scroller
  // would be motion with no purpose. `threadOpen` is the same condition the thread renders on, so
  // the two can never disagree about which view is on screen.
  const effect = code.slice(code.indexOf("if (sendSeq === 0"), code.indexOf("}, [sendSeq, threadOpen]);"));
  assert.ok(effect.length > 200, "the pin effect is gone");
  assert.match(effect, /if \(sendSeq === 0 \|\| !threadOpen\) return;/, "the pin no longer refuses to run outside the conversation view");
  assert.match(code, /\}, \[sendSeq, threadOpen\]\);/, "the pin stopped depending on the view it is gated on");
});

test("🔴🔴 a send is keyed on a counter, not on the sentence", () => {
  // Keying on `currentSaid` would not fire when somebody asks the same thing twice in a row, which
  // is exactly what a person does when the first answer missed the point.
  assert.match(code, /setSendSeq\(\(n\) => n \+ 1\)/, "the send counter stopped being bumped");
  const send = code.slice(code.indexOf("setCurrentSaid(trimmed)"), code.indexOf("setCurrentSaid(trimmed)") + 400);
  assert.match(send, /setSendSeq/, "the counter is no longer bumped where a turn actually starts");
});

test("🔴🔴 the runway exists, because without it a short exchange CANNOT reach the top", () => {
  // A container only scrolls as far as it has content. A one-line question and a three-line reply
  // have nothing beneath them to pull up, so the prompt physically cannot reach the top whatever
  // `scrollTop` is set to. Measured in a real browser at 1280x900: with the turn forced to 200px
  // the runway computed to exactly 636px (900 - 64 inset - 200) and the prompt landed at 64.
  assert.match(code, /runwayRef/, "the runway is gone");
  assert.match(code, /scroller\.clientHeight - inset - currentTurnRef\.current\.getBoundingClientRect\(\)\.height/, "the runway stopped being sized to the shortfall");
  assert.match(code, /Math\.max\(0, Math\.round\(short\)\)/, "a turn taller than the screen now gets negative runway");
});

test("🔴 the room is handed back when the turn is done being current", () => {
  // Leaving it behind would put a screenful of blank space in the middle of the thread the moment
  // this turn scrolls up into the history.
  const effect = code.slice(code.indexOf("if (sendSeq === 0"), code.indexOf("}, [sendSeq, threadOpen]);"));
  assert.match(effect, /runwayRef\.current\.style\.height = "0px"/, "the runway is not released on cleanup");
  assert.match(effect, /observer\.disconnect\(\)/, "the resize observer outlives the turn");
});

test("🔴🔴 only a send scrolls; a streaming answer never drags the view", () => {
  // Following a streaming answer down the page is the behaviour people turn off. The observer
  // keeps the runway honest for the whole answer and must never call `place`.
  const effect = code.slice(code.indexOf("if (sendSeq === 0"), code.indexOf("}, [sendSeq, threadOpen]);"));
  assert.match(effect, /new ResizeObserver\(measure\)/, "the observer does something other than measure");
  assert.ok(!/ResizeObserver\(place\)/.test(effect), "the observer scrolls, so the answer drags the view");
  // `place` is called exactly once, when the turn is sent.
  assert.equal((effect.match(/\bplace\(\);/g) ?? []).length, 1, "the pin scrolls more than once per send");
});

test("🔴 the pin measures with rects, never offsetTop", () => {
  // `offsetTop` is relative to the nearest positioned ancestor, and this subtree gains and loses
  // positioned wrappers as the answer changes shape.
  const effect = code.slice(code.indexOf("if (sendSeq === 0"), code.indexOf("}, [sendSeq, threadOpen]);"));
  assert.match(effect, /getBoundingClientRect\(\)\.top - scroller\.getBoundingClientRect\(\)\.top/);
  assert.ok(!/offsetTop/.test(effect), "the pin went back to offsetTop");
});

test("🔴🔴 the wrapper stays a plain box, and the answer anchor stays inside it", () => {
  // Its only job is to be one measurable box. Any padding or flex of its own would change the
  // layout it is supposed to be measuring — every child already carries its own column.
  assert.match(code, /<div data-canvas-current="" ref=\{currentTurnRef\}>/, "the measured wrapper grew attributes or lost its ref");
  // 🔴 `#canvas-answer-end` MUST STILL BE INSIDE IT. The character hangs off that anchor (#874);
  // block children stack from the top, so the runway's height below cannot push it down, but only
  // while the anchor is the wrapper's own last child rather than a sibling after the runway.
  const wrapper = code.indexOf('<div data-canvas-current=""');
  const anchor = code.indexOf('id="canvas-answer-end"');
  const runway = code.indexOf("ref={runwayRef}");
  assert.ok(wrapper > 0 && anchor > wrapper, "the answer anchor left the measured wrapper");
  assert.ok(runway > anchor, "the runway is above the answer anchor, so it would push the character down");
});
