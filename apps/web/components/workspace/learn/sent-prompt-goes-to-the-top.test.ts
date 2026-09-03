import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the sent prompt goes to the top, and STAYS there ──────────────────────────────────────────
//
// Owner chose this shape from four demonstrated options, 2026-08-31.
//
// 🔴🔴🔴 THE FIRST BUILD OF THIS BLANKED THE PAGE, and these guards exist because of how. It
// measured ONCE, on the frame of the send, while `CanvasFade` still had the previous answer
// mounted: the turn measured tall, the runway computed to zero, and it scrolled to put that tall
// block at the top. The old answer then unmounted, the block collapsed to one line, and the scroll
// was left past the end of the content with nothing holding it. Every assertion below pins one
// part of not doing that again.
//
// Source-read, like every other guard on this component (this app has no DOM harness; see
// `plugins-page.test.ts`). The BEHAVIOUR was verified in a browser against a real send, and the
// three measurements are recorded in the commit.

const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const code = CANVAS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const effect = code.slice(code.indexOf("if (sendSeq === 0"), code.indexOf("}, [sendSeq, threadOpen]);"));

test("the guard is reading the real component and found the effect", () => {
  assert.ok(CANVAS.length > 50_000, `learning-canvas.tsx read as ${CANVAS.length} chars`);
  assert.ok(effect.length > 400, "the pin effect is gone or was renamed");
});

test("🔴🔴 it runs in the conversation view and nowhere else", () => {
  // "chat mode not canvas mode", in the owner's words. The answer view draws one exchange alone
  // with nothing above it, so there is nothing to scroll past and nothing to pin.
  assert.match(effect, /if \(sendSeq === 0 \|\| !threadOpen\) return;/, "the pin no longer refuses to run outside the conversation view");
  assert.match(code, /\}, \[sendSeq, threadOpen\]\);/, "the pin stopped depending on the view it is gated on");
});

test("🔴🔴🔴 it re-places continuously, never once", () => {
  // THE BUG. One measurement taken while the previous answer was still mounted is what blanked the
  // page. Placing on a tick makes it self-correcting: when the old answer leaves, the turn shrinks,
  // the runway grows to match and the prompt is put back at the top. Verified in a browser against
  // a real send: turn 4820px -> 100px, runway 0px -> 697px, prompt held at 64px throughout.
  assert.match(effect, /setInterval\(/, "the pin stopped re-applying on a tick");
  assert.match(effect, /hold\(\);/, "the tick no longer re-places the prompt");
  assert.match(effect, /LANDING_TICK_MS\)/, "the pin stopped sharing the landing effect's cadence");
  // And it must not be the once-only shape that broke: a single place with nothing repeating it.
  assert.ok(effect.split("hold()").length - 1 >= 2, "the pin places only once again");
});

test("🔴🔴 the turn is measured by its own box, never by scrollHeight", () => {
  // The runway lives in the same scroller, so `scrollHeight` includes the space being decided:
  // reserving makes the turn look taller, which reserves less, converging to zero on the first
  // frame. I hit exactly that while building the mockup for this.
  assert.match(effect, /node\.getBoundingClientRect\(\)\.height/, "the turn height is no longer measured from its own box");
  assert.ok(!/scrollHeight/.test(effect), "the pin went back to measuring scrollHeight");
});

test("🔴 reserve before scrolling, or the prompt lands short of the top", () => {
  const setsRunway = effect.indexOf("runway.style.height");
  const scrolls = effect.indexOf("scroller.scrollTo(");
  assert.ok(setsRunway > 0 && scrolls > setsRunway, "it scrolls before the room exists, which silently clamps");
});

test("🔴 the learner's own scroll ends it, and it stays ended", () => {
  // A surface that keeps yanking the view back is the behaviour people file bugs about. Verified
  // live: after a wheel event the runway returned to 0px and stayed there through later resizes.
  assert.match(effect, /\["wheel", "touchmove", "keydown"\] as const/, "the pin no longer stands down when the learner scrolls");
  assert.match(effect, /window\.addEventListener\(name, release/, "the cancel listeners are not attached");
  assert.match(effect, /window\.removeEventListener\(name, release\)/, "the cancel listeners outlive the turn");
  assert.match(effect, /if \(!live\) return;\s*live = false;/, "release is no longer idempotent, so it can fire twice");
});

test("🔴 the room is handed back, and there is a ceiling", () => {
  // Left behind, the runway is a screenful of blank in the middle of the thread the moment this
  // turn scrolls up into the history.
  assert.match(effect, /runwayRef\.current\.style\.height = "0px"/, "the runway is not released");
  assert.match(effect, /PIN_MAX_MS/, "a turn that never settles can hold the scroll forever");
});

test("🔴🔴 the wrapper stays a plain box and the runway is its SIBLING", () => {
  // Inside, the runway would count toward the height being measured and the reserve would eat
  // itself. And `#canvas-answer-end` must stay the wrapper's own last child, because the character
  // hangs off it (#874) and block children stack from the top.
  // 🔴 WHAT "PLAIN" MEANS IS NO LAYOUT OF ITS OWN, NOT NO ATTRIBUTES. This pinned the tag character
  // for character and reddened when the wrapper gained `data-thread-turn` — the anchor that lets
  // the History Rail scroll to the live turn instead of blanking the page (2026-09-03). A data
  // attribute changes no box. What must never appear here is a class, a style or a ref that is not
  // `currentTurnRef`, because those are what would change the height this box exists to measure.
  const wrapper = code.indexOf('<div data-canvas-current=""');
  const tag = code.slice(wrapper, code.indexOf(">", wrapper) + 1);
  assert.match(tag, /ref=\{currentTurnRef\}/, "the measured wrapper lost its ref");
  assert.ok(!/className|style=/.test(tag), `the measured wrapper grew layout of its own: ${tag}`);
  const anchor = code.indexOf('id="canvas-answer-end"');
  const runway = code.indexOf("ref={runwayRef}");
  assert.ok(wrapper > 0 && anchor > wrapper, "the answer anchor left the measured wrapper");
  assert.ok(runway > anchor, "the runway moved above the answer anchor, so it would push the character down");
});

test("🔴 a send is keyed on a counter, not the sentence", () => {
  // Asking the same thing twice in a row is what someone does when the first answer missed, and
  // that must still pin.
  assert.match(code, /setSendSeq\(\(n\) => n \+ 1\)/, "the send counter stopped being bumped");
  const send = code.slice(code.indexOf("setCurrentSaid(trimmed)"), code.indexOf("setCurrentSaid(trimmed)") + 400);
  assert.match(send, /setSendSeq/, "the counter is no longer bumped where a turn actually starts");
});

test("🔴🔴 the send glides once, and the ticks after it do not chase reflow", () => {
  // Owner, 2026-09-01: "the prompts don't scroll smoothly when the prompt gets pinned to the top."
  // The first build set `scrollTop` directly on every tick of a 100ms interval, so a send read as
  // a hard cut followed by small jerks as the answer changed height. Ten instant scrolls a second
  // is not a scroll, it is a stutter.
  assert.match(effect, /scroller\.scrollTo\(\{/, "the pin went back to assigning scrollTop, which cannot ease");
  assert.ok(!/scroller\.scrollTop \+= /.test(effect), "the instant assignment is back");
  assert.match(effect, /behavior: glided \|\| window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth"/, "the first placement stopped gliding, or reduced motion stopped being honoured");

  // 🔴 THE THRESHOLD IS WHAT SEPARATES A PIN FROM A STUTTER. Without it every one-pixel reflow is
  // a scroll, ten times a second.
  assert.match(effect, /if \(glided && Math\.abs\(drift\) < PIN_DRIFT_PX\) return;/, "the pin chases sub-pixel drift again");
  assert.match(CANVAS, /const PIN_DRIFT_PX = 4;/, "the drift threshold moved");
});

