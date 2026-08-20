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
  assert.match(previewCode, /<Bloub /);
  assert.match(previewCode, /canvas-forming/, "the forming lines were deleted rather than kept");
  assert.match(canvasCode, /mascot=\{turnInFlight\}/);
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
  const renderer = readFileSync(new URL("./bloub.tsx", import.meta.url), "utf8");
  assert.match(renderer, /MIT/, "the renderer does not say where the engine came from");
});
