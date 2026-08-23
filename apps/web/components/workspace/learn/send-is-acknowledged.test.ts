import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { canvasPresentation } from "./canvas-presence";

// 🔴🔴🔴 NOTHING TOLD THE LEARNER THEIR MESSAGE HAD BEEN SENT.
//
// Owner, 2026-08-20, twice in the same sitting: *"when user enters a prompt and sends i would like
// a micro animation where the chat composer moves to the bottom position, since user prompts aren't
// supposed to show up as a chat"* and *"since user chat prompts will not show up, when user sends
// chat could we have a thinking screen or loading screen"*.
//
// Both are one defect. The Canvas deliberately never renders the learner's own words, so between
// pressing send and the answer arriving — measured at seconds for a reply and MINUTES for a lesson
// — the surface was identical to the surface before pressing it. There was no way to tell a sent
// message from a swallowed one.
//
// Two answers, one for each end of that gap: the composer travels to where it is about to be, and
// the thinking state takes the surface until the answer lands.

const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const HOME = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");
const PREVIEW = readFileSync(new URL("./canvas-thinking-preview.tsx", import.meta.url), "utf8");

function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const canvasCode = code(CANVAS);
const homeCode = code(HOME);
const previewCode = code(PREVIEW);

const TEACHING = { blocks: 0, canvasState: "learn", policyPresenting: true, working: false } as const;

// ── The thinking state takes the surface ────────────────────────────────────

test("🔴🔴 a turn in flight replaces what was on screen", () => {
  // The owner's explicit choice between three options: "Replaces it while thinking."
  // Calibration: remove the `turnInFlight ?` arm from the presence ladder and this reddens.
  const { presence } = canvasPresentation({ ...TEACHING, turnInFlight: true });
  assert.equal(presence, "preparing");
});

test("🔴🔴🔴 BACKGROUND work does NOT replace a lesson someone is reading", () => {
  // THE dangerous half. `working` is also true for knowledge resolution, which this session
  // measured running for MINUTES on a topic-only canvas. Keyed on that, a learner reading a
  // teaching screen would have it taken away for minutes with no way back — #690's blank screen
  // with a drawing painted over it.
  //
  // Calibration: change the ladder's condition from `turnInFlight` to `working` and this reddens
  // alone, while the test above stays green. That asymmetry is the entire safety argument.
  const { presence } = canvasPresentation({ ...TEACHING, turnInFlight: false, working: true });
  assert.equal(presence, "task", "a lesson was taken off screen by ambient work");
});

test("🔴 the canvas keys the thinking screen on the SESSION's busy, not the policy's flags", () => {
  // `busy` is set by `converse`, `command` and `attachFiles` — things the learner just did. The
  // three policy flags in `working` are background. Naming the derivation here rather than its
  // shape, so a future edit that widens it has to walk past this.
  assert.match(canvasCode, /const turnInFlight = busy\.kind !== null;/);
  assert.ok(
    !/const turnInFlight = working/.test(canvasCode),
    "the thinking screen is keyed on background work and will blank a lesson mid-read",
  );
});

test("🔴🔴 and the content regions stand down while it owns the surface", () => {
  // A presence that says "preparing" while the policy region still paints is two things on screen
  // and the replacement never happens. All three content regions ask the same question.
  for (const region of ["policy", "reply", "document"]) {
    const at = canvasCode.indexOf(`{regions.${region} &&`);
    assert.notEqual(at, -1, `the ${region} region is gone`);
    assert.match(
      canvasCode.slice(at, at + 120),
      /presence !== "preparing"/,
      `the ${region} region still paints while the thinking screen owns the surface`,
    );
  }
});

test("🔴🔴 there is no skeleton loader on either wait, and the caption sits BESIDE the mascot", () => {
  // 🔴 THIS TEST HAS BEEN REVERSED, AND THE REVERSAL IS AN OWNER DECISION RATHER THAN A REGRESSION.
  //
  // It used to assert the forming lines SURVIVED — three staggered bars occupying the shape a
  // question occupies, so the first question landed where the placeholder already was. That
  // argument was good and is why they lasted this long.
  //
  // Owner, 2026-08-20: *"i dont want skeleton loader, also when nemesis is thinking or loading, the
  // mascot three dot should have the thinking preview to the right of it."* A skeleton is a guess
  // about what is coming drawn as though it were already there — three grey bars promising a
  // paragraph that may turn out to be a molecule, a plot, or one sentence.
  assert.ok(!/canvas-forming/.test(previewCode), "the skeleton bars are back");
  assert.ok(!/LINES\.map/.test(previewCode), "something is still drawing placeholder bars");

  // 🔴🔴 AND THIS HALF HAS BEEN REVERSED AGAIN, FOR THE REASON THE FIRST VERSION COULD NOT SEE.
  //
  // It used to assert BOTH waits laid the caption out as a row, which was the mechanism chosen to
  // put it beside the character. A row is the right shape and it was still the wrong mechanism:
  // the mascot's position is a live transform (it walks, and it scales 2.1x to come forward), so
  // no static box on the page can be beside it. The `justify-end` that had meant "push to the
  // bottom" as a column silently became "push to the right" as a row, and the caption ended up
  // against the right edge of the window — owner, 2026-08-21: *"why is the 'thinking' so far
  // off"*, with a screenshot of the word alone in the far corner.
  //
  // So the caption moved onto the dock, as a sibling of its own transform, where being beside the
  // character is structural rather than a coincidence of two layouts agreeing.
  //
  // The wait with NO mascot still centres its own caption — there is no character to sit beside.
  assert.equal((previewCode.match(/flex-row items-center/g) ?? []).length, 1, "the mascot wait is laying out a caption again");
  assert.match(previewCode, /className="sr-only"/, "the mascot wait is painting a caption instead of announcing one");
  assert.ok(!/justify-end/.test(previewCode), "justify-end is back — in a row that means the right edge, not the foot");
  assert.match(canvasCode, /mascot=\{turnInFlight\}/);
  assert.match(canvasCode, /caption=\{turnInFlight \|\| presence === "preparing" \? preparingLabel : null\}/, "the dock is no longer given the caption");
  // 🔴 AND THE PREVIEW STILL DOES NOT DRAW ITS OWN MASCOT. Two mounts of one renderer put two sets
  // of three dots on one screen; the dock owns the character, this owns the caption.
  assert.ok(!/<Bloub /.test(previewCode), "the preview is drawing its own mascot again");
});

// ── The composer travels to where it is about to be ─────────────────────────

test("🔴🔴 the distance is MEASURED, never a constant", () => {
  // The front door centres its block with `my-auto`, so the composer's position depends on the
  // greeting's height, the window's height and the length of the Library list below it. A
  // hard-coded translate would be correct at exactly one window size.
  assert.match(homeCode, /getBoundingClientRect\(\)/);
  assert.match(homeCode, /window\.innerHeight - CANVAS_COMPOSER_INSET - rect\.height/);
});

test("🔴🔴 the navigation waits for the move, or the move plays against a dead page", () => {
  // The canvas mounts with its composer already docked. If this one has not arrived by then the
  // two do not line up and the swap is visible, which is the opposite of the point.
  assert.match(homeCode, /window\.setTimeout\(\(\) => router\.push\(href\), DOCK_MS\)/);
});

test("🔴🔴 reduced motion skips the TRAVEL, not the send", () => {
  // The failure to avoid is a slower version of the same animation for someone who asked for none.
  // Calibration: delete the `still` branch and this reddens.
  assert.match(homeCode, /prefers-reduced-motion: reduce/);
  const at = homeCode.indexOf("prefers-reduced-motion: reduce");
  assert.match(homeCode.slice(at, at + 200), /router\.push\(href\);/, "reduced motion does not still send");
});

test("🔴 it moves with a transform, so nothing under it reflows", () => {
  // Animating a layout property would reflow the Library list on every frame of the move.
  assert.match(homeCode, /transform: departing \? `translateY\(\$\{lift\}px\)` : undefined/);
  assert.ok(!/marginTop: departing/.test(homeCode), "the move animates layout instead of a transform");
});

// ── The vendored engine keeps its licence ───────────────────────────────────

test("🔴🔴 bloub's MIT licence travels with the code that needs it", () => {
  // The engine in `lib/bloub/` is Jérémy Perret's, copied verbatim. MIT permits that and requires
  // the notice; a vendored copy with the licence left behind is the one way this goes wrong
  // quietly.
  const licence = readFileSync(new URL("../../../lib/bloub/LICENSE", import.meta.url), "utf8");
  assert.match(licence, /MIT License/);
  assert.match(licence, /Jérémy Perret/);
  // 🔴 REPOINTED 2026-08-20: the renderer moved from `learn/bloub.tsx` to `components/bloub/`, and
  // this test went red pointing at a file that no longer exists rather than at a missing notice.
  // Derived from whoever actually imports the engine, so the next move cannot break it either —
  // and so the check keeps meaning "the code using this says where it came from" rather than "this
  // one path still exists".
  const users = readdirSync(new URL("../../bloub/", import.meta.url)).filter((f) => f.endsWith(".tsx"));
  assert.ok(users.length > 0, "nothing renders the vendored engine any more");
  const attributed = users.some((f) => /MIT/.test(readFileSync(new URL(`../../bloub/${f}`, import.meta.url), "utf8")));
  assert.ok(attributed, `none of ${users.join(", ")} says where the engine came from`);
});

// ── Attachments: dropped anywhere, carried inside the composer ────────────────────────────────

test("🔴🔴 a file dropped anywhere on the canvas is attached", () => {
  // 🔴 REPORTED 2026-08-20: *"the composer doesnt allow me to drop in multiple attachments before
  // sending."* There was no drop handler on the canvas AT ALL. The front door has had one since it
  // was built; the canvas never did, so the browser took the drop, navigated away from the session
  // and opened the PDF in the tab.
  //
  // Calibration: remove `onDropFiles` from the CanvasSurface mount and this reddens.
  const surface = readFileSync(new URL("./canvas-surface.tsx", import.meta.url), "utf8");
  assert.match(surface, /onDrop=\{/, "the canvas surface does not accept a drop");
  // 🔴 THE DRAGOVER IS THE LOAD-BEARING HALF: without preventDefault there the drop event never
  // fires, because the browser's navigate-to-file default wins. A guard that only checked onDrop
  // would pass against a handler that can never run.
  assert.match(surface, /onDragOver=\{[\s\S]{0,120}?preventDefault/, "dragover is not cancelled, so onDrop can never fire");
  assert.match(canvasCode, /onDropFiles=\{\(files\) => void session\.attachFiles\(files\)\}/, "the canvas does not hand dropped files to the session");
});

test("🔴 the loading branch does NOT accept drops, because there is nothing to attach to", () => {
  // `session.attachFiles` needs a canvas. Accepting a file a beat before one exists is a silent
  // discard, which is worse than the browser's own refusal.
  const loading = canvasCode.slice(canvasCode.indexOf("if (!session.ready)"), canvasCode.indexOf("if (!session.ready)") + 900);
  assert.ok(!/onDropFiles/.test(loading), "the not-ready branch accepts drops it cannot honour");
});

// 🔴🔴 THIS TEST USED TO ASSERT THE CHIPS WERE INSIDE THE COMPOSER. It read: *"attachment chips are
// INSIDE the composer, not stacked above it"*, from owner 2026-08-20, *"i dont want the attachments
// to be above the chat composer at all."* Moving them inside was the wrong reading of that.
//
// Owner, 2026-08-21: *"sources are still appearing on the chat composer which i dont want. the
// sources should appear in the sources."* They are gone from the composer entirely now, so the
// assertion is inverted rather than deleted: what has to hold is that no future edit puts them
// back, above OR inside. `answer-is-not-a-start.test.ts` carries the rest — that the composer is
// not even GIVEN the list, and that the Sources panel still draws it.
test("🔴🔴 the composer draws no source chips at all, above or inside", () => {
  const composer = readFileSync(new URL("./canvas-composer.tsx", import.meta.url), "utf8");
  assert.ok(!/\{chipsInside && \(/.test(composer), "the chips are back inside the composer box");
  assert.ok(!/mb-1\.5 ml-1 flex flex-wrap items-center gap-1\.5/.test(composer), "the floating chip row is back");
  assert.ok(!/faviconUrl/.test(composer), "the composer is drawing source favicons again");
  // The box itself is still a column, because the textarea grows inside it.
  assert.ok(composer.includes('"flex flex-col bg-(--ui-bg-elevated)"'), "the composer stopped being a column");
});

test("🔴🔴 the canvas scrolls past the composer, which floats over it", () => {
  // Owner, 2026-08-20: *"also i cant scroll all the way down."* The scroller had top padding to
  // clear the header and NOTHING for the composer — which is absolutely positioned at bottom-0, so
  // it occupies no space in the scroll flow and the end of every answer sat permanently beneath it.
  // There was nothing below to scroll to.
  //
  // Calibration: drop the pb and this reddens.
  assert.match(canvasCode, /overflow-y-auto pb-\[160px\] pt-\[64px\]/, "the scroller does not clear the floating composer");
});

// ── Arriving at the canvas ───────────────────────────────────────────────────────────────────

test("🔴🔴 the canvas's own half of the transition exists at all", () => {
  // Owner, 2026-08-20: *"the transition from landing page to canvas needs to be smoother ... the
  // upper header controls need to appear as a fade in."*
  //
  // The FRONT DOOR half was already built — the composer travels down, the greeting fades — and
  // then the route changed and the canvas simply WAS there, header and all, hard-cut. Half a
  // transition reads worse than none: the eye is following a moving composer and the destination
  // arrives fully formed around it.
  const surface = readFileSync(new URL("./canvas-surface.tsx", import.meta.url), "utf8");
  assert.match(surface, /className="canvas-chrome-in /, "the header controls appear with no entrance");

  const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@keyframes canvas-chrome-in/, "the animation is named but not defined");
  // 🔴 DELAYED, so the controls start after the composer has finished travelling and the two read
  // as one movement in sequence rather than two things at once.
  assert.match(css, /\.canvas-chrome-in \{ animation: canvas-chrome-in \d+ms \d+ms/, "the entrance has no delay, so it races the composer");
  // 🔴 AND SILENCED UNDER REDUCED MOTION, because the front door's own travel already is. Someone
  // who asked the system to stop moving must not get half of it anyway.
  // 🔴 THE LAST BLOCK, NOT THE FIRST. globals.css has five separate `prefers-reduced-motion`
  // blocks; `indexOf` finds one 49,000 characters away from the canvas rules, and slicing forward
  // from it reads a completely unrelated stylesheet.
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce) {\n  .canvas-swap,"));
  assert.ok(reduced.length > 0, "the canvas reduced-motion block moved");
  assert.match(reduced.slice(0, 400), /\.canvas-chrome-in,/, "the entrance ignores reduced motion");
});

test("🔴 the composer's drop is longer than it was, and lands softer", () => {
  // At 260ms the composer covered most of a screen height in a quarter of a second, which reads as
  // a jump with a blur rather than as a thing travelling.
  const home = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");
  const dock = /const DOCK_MS = (\d+);/.exec(home);
  assert.ok(dock && Number(dock[1]) >= 300, `the drop is back to ${dock?.[1]}ms`);
  assert.match(home, /cubic-bezier\(0\.32, 0\.72, 0, 1\)/, "the drop is back on the brisker curve");
});

test("🔴🔴 the mascot wears a mark above its head, and does not deform into one", () => {
  // Owner, 2026-08-20, asked directly and chose this over the engine's own poses: *"do not fire at
  // all, the mascot should have an exclamation mark or question mark appear above its head for
  // those kinds of things."* `lib/bloub` ships `exclaim` and `alert` states that deform the
  // character itself; the character stays itself and something appears near it instead.
  const dock = readFileSync(new URL("../../bloub/bloub-dock.tsx", import.meta.url), "utf8");
  assert.match(dock, /marker \?: "!" \| "\?" \| null;|marker\?: "!" \| "\?" \| null;/, "the dock takes no marker");
  assert.match(dock, /\{marker && \(/, "the marker is accepted and never drawn");
  // 🔴 OUTSIDE THE ENGINE. lib/bloub is vendored whole and not edited, and its loop writes SVG
  // attributes every frame — a glyph pushed through it would be a fourth thing to keep in sync.
  assert.match(dock, /bloub-marker/, "the marker is not a sibling of the character");

  // 🔴 THE ERROR OUTRANKS THE QUESTION. Both can be true at once, and only the failure is news —
  // the question is already rendered in full, in words, in the middle of the page.
  // Whitespace-tolerant: this guards the ORDER (a failure outranks a question), not the line
  // breaks. Written tight, it reddened the moment the condition was reformatted onto four lines.
  assert.match(canvasCode, /session\.error\s*\?\s*"!"\s*:/, "the error no longer outranks the question");
  // 🔴 EVERY GUARD ON THE "?", ASSERTED SEPARATELY. This matched the whole condition as one
  // string, so tightening it — which is what the owner's repeat report on 2026-08-21 required —
  // reddened the test for doing the right thing, while a future edit that DROPPED a guard and
  // reformatted would slip past. Each clause is now its own claim.
  const mark = canvasCode.slice(canvasCode.indexOf("marker={"), canvasCode.indexOf("marker={") + 320);
  for (const [clause, why] of [
    ["awaitingDemonstration", "the mark no longer waits on the policy actually wanting an answer"],
    // 🔴 THE REST OF "RANDOM". `awaitingAnswer` is the policy's belief; `regions.policy` is whether
    // the question is on screen. They come apart on every surface that withholds the policy region,
    // and the mark then sat over a page with no question anywhere on it.
    ["regions.policy", "the mark can appear while the question it refers to is off screen"],
    ["!turnInFlight", "the mark is back on the mascot's head while Nemesis is working"],
    ['presence !== "preparing"', "the mark is back during preparation"],
  ] as const) {
    assert.ok(mark.includes(clause), why);
  }

  // 🔴 THE BADGE IS THE CHARACTER'S OWN COLOUR, NOT THE PAGE'S. Reported 2026-08-21: *"the mascot
  // has a random question mark that isnt in purple like the mascot."* It was `--ui-text-tertiary`,
  // so the one thing sitting ON the character was the one thing that did not belong to it.
  // `inkFor` is what `BloubBot` paints its body with, so the badge cannot drift from the body it
  // sits on — not across themes, and not across the accents a learner can choose.
  assert.match(dock, /backgroundColor: inkFor\(accent, theme\)/, "the mark is painted in page grey again");
  // 🔴 AND IT DOES NOT GROW WITH THE DOCK. The character scales to `centreScale` coming forward;
  // a badge that scaled with it became a page-sized glyph over the middle of an empty screen.
  assert.match(dock, /travel\.k/, "the badge is no longer counter-scaled");
});

test("🔴🔴 the mascot comes forward for a TURN, never for background work", () => {
  // 🔴 REPORTED AS THE MASCOT PAINTING OVER ANSWERS, AND MEASURED ON PRODUCTION. The dock's resting
  // position was correct — bottom 84px, left 336px, right at the composer — and a transform was
  // lifting it 412px and scaling it 2.1x, the deliberate "come forward to think" station, still
  // applied minutes after the answer had landed.
  //
  // The cause is what `policy.thinking` MEANS: `phase !== null`, and the phases include
  // `mapping_knowledge`, which is background knowledge resolution measured in MINUTES. A learner
  // reading a finished answer had a character standing over it at double size because something
  // unrelated was still running behind the page.
  //
  // 🔴 THE THINKING SCREEN ALREADY LEARNED THIS. `use-canvas-session` records the same distinction
  // in as many words — key on the turn, never on `working`, which includes knowledge resolution.
  // The dock was wired to the other signal and nobody had looked. Calibration: put
  // `policy.thinking` back and this reddens.
  assert.match(canvasCode, /stateForCanvas\(\{ thinking: turnInFlight, preparing: presence === "preparing" \}\)/);
  assert.ok(
    !/stateForCanvas\(\{ thinking: policy\.thinking/.test(canvasCode),
    "the dock is back on the policy's phase flag, which stays true through background work",
  );
});
