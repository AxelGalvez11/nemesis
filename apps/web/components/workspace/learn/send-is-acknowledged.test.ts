import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("🔴 the mascot is for a turn, and the forming lines are kept for the other wait", () => {
  // §21's argument — the lines are the SHAPE of the question that replaces them — holds exactly
  // where it was written and nowhere else. Deleting them to make room for the mascot would throw
  // away a measured design for a case it is still right about.
  assert.match(previewCode, /if \(mascot\) \{/);
  // 🔴 THE COMPONENT IS `<BloubBot`, NOT `<Bloub`. This read `/<Bloub /` and had been red since
  // the second renderer (`components/workspace/learn/bloub.tsx`) was deleted — a guard that fails
  // for a reason nobody is looking at is a guard nobody reads.
  assert.match(previewCode, /<BloubBot /);
  assert.match(previewCode, /canvas-forming/, "the forming lines were deleted rather than kept");
  assert.match(canvasCode, /mascot=\{turnInFlight\}/);
});

// ── The composer travels to where it is about to be ─────────────────────────

test("🔴🔴 the distance is MEASURED, never a constant", () => {
  // The front door centres its block with `my-auto`, so the composer's position depends on the
  // greeting's height, the window's height and the length of the Library list below it. A
  // hard-coded translate would be correct at exactly one window size.
  assert.match(homeCode, /getBoundingClientRect\(\)/);
  assert.match(homeCode, /window\.innerHeight - canvasComposerInset\(\) - rect\.height/);
});

test("🔴🔴 the clearance under the canvas composer is READ, not typed", () => {
  // It is `pb-4` — one rem — and the root font size is the learner's SCALING setting. A literal
  // here is right at exactly one setting, and the literal that was here (16) was right at none:
  // the app's root is 112.5%, so `pb-4` is 18px and the composer landed 2px high.
  //
  // Calibration: put any number back in place of the read and this reddens.
  assert.match(homeCode, /getComputedStyle\(document\.documentElement\)\.fontSize/);
  assert.ok(
    !/const CANVAS_COMPOSER_INSET = \d/.test(homeCode),
    "the clearance is a literal again, so it is wrong at every scale but one",
  );
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
  assert.match(homeCode, /transform: departing \? `translate3d\(\$\{travel\.x\}px, \$\{travel\.y\}px, 0\)`/);
  assert.ok(!/marginTop: departing/.test(homeCode), "the move animates layout instead of a transform");
});

test("🔴🔴 the composer SIDESTEPS as well as drops, because the canvas has no rail", () => {
  // The canvas is immersive — it takes the nav rail away — so a composer centred inside a railed
  // column here is centred 26px right of where the canvas will centre its own. Travelling only
  // downward meant the route swap corrected the horizontal in one frame, and a move that ends
  // with a jump reads as a broken move.
  //
  // Calibration: drop the `x` term and this reddens.
  assert.match(homeCode, /x: Math\.round\(window\.innerWidth \/ 2 - \(rect\.left \+ rect\.width \/ 2\)\)/);
});

// ── And the character travels with it ───────────────────────────────────────

test("🔴🔴🔴 the character walks to the exact spot the canvas will stand it on", () => {
  // Owner 2026-08-21: "the mascot should move toward the center smoothly not jaggedly".
  //
  // These are two components on two surfaces — this greeter unmounts and `BloubDock` mounts —
  // so the hand-off is invisible only while the two agree about the point and the size. It was
  // not agreeing about either: the greeter held its place while the dock mounted in the
  // lower-left corner and crawled to the middle, which the learner reads as two characters.
  assert.match(homeCode, /const \[handoff, setHandoff\]/);
  assert.match(homeCode, /transform: `translate3d\(\$\{handoff\.dx\}px, \$\{handoff\.dy\}px, 0\) scale\(\$\{handoff\.k\}\)`/);
});

test("🔴🔴 and it takes those numbers FROM the dock, so they cannot drift apart", () => {
  // A copied `0.42`, a copied `2.1` and a copied `52` would all look right the day they were
  // typed and come apart on the first retune of the middle station — as a hand-off that is
  // subtly wrong, which is harder to see than one that is obviously wrong.
  //
  // Calibration: inline any of the three as a literal and this reddens.
  assert.match(homeCode, /from "@\/components\/bloub\/bloub-dock"/);
  for (const name of ["centreStation", "DOCK_SIZE", "DOCK_CENTRE_SCALE"]) {
    assert.match(homeCode, new RegExp(name), `${name} is not read from the dock`);
  }
});

test("🔴🔴 and the dock does not walk in from a corner it was never standing in", () => {
  // The other half of the same hand-off. A canvas opened from the front door mounts ALREADY
  // busy, so its dock's first placement is the middle — and animating into it would replay,
  // from the corner, a journey the learner just watched the greeter make.
  //
  // Calibration: make the first placement use the journey duration and this reddens.
  const dock = code(readFileSync(new URL("../../bloub/bloub-dock.tsx", import.meta.url), "utf8"));
  assert.match(dock, /ms: !was\.placed \? 0 :/);
  assert.match(dock, /visibility: place\.placed \? undefined : "hidden"/);
});

test("🔴🔴 the dock moves ONE property, so nothing snaps while something else eases", () => {
  // The judder had a mechanism: the corner was `left`/`bottom`, re-measured off the composer
  // every 120ms and written with no transition, while the journey was an eased transform
  // measured FROM that corner. Every anchor change jumped the element AND retargeted the
  // easing mid-flight. The base corner is the props now and never moves.
  //
  // Calibration: write the measured anchor back onto `left`/`bottom` and this reddens.
  const dock = code(readFileSync(new URL("../../bloub/bloub-dock.tsx", import.meta.url), "utf8"));
  assert.ok(!/setOffset|setInset/.test(dock), "the dock moves itself with layout properties again");
  assert.match(dock, /^\s+left,$/m);
  assert.match(dock, /^\s+bottom,$/m);
});

// ── The vendored engine keeps its licence ───────────────────────────────────

test("🔴🔴 bloub's MIT licence travels with the code that needs it", () => {
  // The engine is Jérémy Perret's, copied verbatim. MIT permits that and requires the notice; a
  // vendored copy with the licence left behind is the one way this goes wrong quietly.
  //
  // 🔴 IT FOLLOWED THE ENGINE TO `packages/shared/src/bloub/`, WHICH IS THE POINT OF THE GUARD.
  // The engine moved out of `apps/web/lib/bloub/` so the phone could render the same character;
  // a move is exactly the moment a LICENSE gets left behind in the directory nobody deleted.
  const licence = readFileSync(
    new URL("../../../../../packages/shared/src/bloub/LICENSE", import.meta.url),
    "utf8",
  );
  assert.match(licence, /MIT License/);
  assert.match(licence, /Jérémy Perret/);
  // 🔴 AND IT READS THE RENDERER THAT EXISTS. This pointed at `./bloub.tsx` — the second renderer
  // PR #708 replaced and which has not existed since — so it threw ENOENT rather than checking
  // anything. Attribution is a property of every renderer, so both are read.
  for (const renderer of [
    new URL("../../bloub/bloub-bot.tsx", import.meta.url),
    new URL("../../../../mobile/src/components/bloub/BloubBot.tsx", import.meta.url),
  ]) {
    assert.match(
      readFileSync(renderer, "utf8"),
      /MIT/,
      `${renderer.pathname} does not say where the engine came from`,
    );
  }
});
