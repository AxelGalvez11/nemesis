import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Structural assertions over the rendered surface. `MinimapControl` is not mounted in tests —
// this directory has no DOM harness, and `canvas-runtime-branch.test.ts` /
// `canvas-presence.test.ts` establish the pattern this file follows: read the component source,
// with comments stripped so a guard cannot be satisfied by a sentence explaining the rule instead
// of the code obeying it (the board records this exact trap twice, in this same file's siblings).

const CONTROLS_SOURCE = readFile(new URL("./canvas-controls.tsx", import.meta.url), "utf8");
const HEADER_SOURCE = readFile(new URL("./canvas-header.tsx", import.meta.url), "utf8");

/** Strips both comment forms — the same regex `canvas-presence.test.ts` and
 *  `canvas-runtime-branch.test.ts` use, kept identical on purpose rather than reinvented. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * The whole territory section — the palette/copy constants AND the `MinimapControl` function —
 * isolated from the other controls in the same file so a vocabulary check cannot pass by finding
 * a forbidden word in `SourcesControl` or `ObjectivesControl` instead, and cannot fail on one
 * either.
 *
 * 🔴 STARTS AT `TERRITORY_DOT`, NOT AT `export function MinimapControl(`, AND NOT AT THE SECTION
 * COMMENT ABOVE EITHER. Two calibration attempts on this exact boundary both failed silently
 * before this one:
 *
 * 1. Anchored on `export function MinimapControl(` — changing `TERRITORY_MEANING.established` to
 *    `"Complete"` stayed GREEN, because that dictionary's VALUES sit in a `const` above the
 *    function, invisible to a slice that starts after it, even though the function reads that
 *    exact dictionary at render time.
 * 2. Anchored on the `// ---- territory (minimap)` section comment — every test calling this
 *    helper THREW, because `stripComments` (below) deletes `//` lines before this function ever
 *    searches the result, so the anchor was gone before `.indexOf` ran. A different failure mode,
 *    same root cause: the anchor and the strip order were never checked against each other.
 *
 * Anchored on `const TERRITORY_DOT` (real code, survives stripping, sits above both constants)
 * through `export function SessionControl(` (the next real declaration) is what finally makes the
 * calibration in this file's own history impossible to reintroduce silently.
 */
async function minimapBody(): Promise<string> {
  const code = stripComments(await CONTROLS_SOURCE);
  const start = code.indexOf("const TERRITORY_DOT");
  assert.notEqual(start, -1, "TERRITORY_DOT moved or was renamed in canvas-controls.tsx");
  const end = code.indexOf("export function SessionControl(", start);
  assert.ok(end > start, "could not find the end of the territory section — SessionControl moved");
  return code.slice(start, end);
}

test("🔴 H6 — every setFocus call passes only a FocusScope shape, never an operation, difficulty or mode", async () => {
  const body = await minimapBody();
  const calls = [...body.matchAll(/setFocus\(([\s\S]*?)\)/g)].map((match) => match[1]!);
  assert.ok(calls.length >= 2, "expected at least the whole-canvas row and the per-territory row to call setFocus");

  for (const call of calls) {
    // The two legitimate shapes, and nothing else: the constant `WHOLE_CANVAS`
    // (`{kind: "canvas"}`), or a literal naming exactly `identityKeys`, `kind: "selection"` and
    // `label` — the three fields `FocusScope`'s selection member has (canvas-focus.ts). Any other
    // key present is a mode, a difficulty, or an operation crossing the one boundary H6 exists to
    // hold shut.
    const isWholeCanvas = call.trim() === "WHOLE_CANVAS";
    const isSelectionLiteral =
      /identityKeys:/.test(call) && /kind:\s*"selection"/.test(call) && /label:/.test(call);
    assert.ok(
      isWholeCanvas || isSelectionLiteral,
      `setFocus called with an unrecognised shape: ${call.trim()} — H6 requires focus_scope only, never a mode`,
    );
    if (isSelectionLiteral) {
      for (const forbidden of ["mode:", "operation:", "difficulty:", "kind: \"mode\"", "strategy:"]) {
        assert.ok(!call.includes(forbidden), `setFocus call carries a "${forbidden}" — that is exactly what H6 forbids`);
      }
    }
  }
});

test("no percentage, score or count-of-N language in the territory panel", async () => {
  const body = await minimapBody();
  assert.doesNotMatch(body, /%/, "a percentage appeared — §23 forbids fake precision on the Minimap");
  // 🔴 REQUIRES A SPACE ON EACH SIDE OF THE SLASH, NOT `\s*`. A bare `\s*` (zero or more) matches
  // Tailwind's opacity suffix — `bg-amber-500/80` in TERRITORY_DOT below — and reddened this test
  // on a change that never touched learner-facing copy. The owner's own forbidden example, "17 / 24
  // cards", is spaced; a CSS utility's slash never is. Requiring `\s+` targets the real pattern and
  // stops re-flagging the class name every time this file is touched.
  assert.doesNotMatch(body, /\d+\s+\/\s+\d+/, "an N-of-M count appeared — the owner's rule is 'never 17 / 24 cards'");
  assert.doesNotMatch(body, /mastery|score\b/i, "a mastery number or score reached the learner-facing surface");
});

test("no flashcard vocabulary anywhere in the territory panel", async () => {
  const body = await minimapBody();
  for (const forbidden of [/\bcard\b/i, /\bdeck\b/i, /front\s*\/\s*back/i, /\breveal\b/i, /\bAgain\b/, /\bHard\b/, /\bGood\b/, /\bEasy\b/]) {
    assert.doesNotMatch(body, forbidden, `flashcard vocabulary (${forbidden}) reached the territory panel`);
  }
});

test("🔴 established is never rendered as a completion checkmark or 'done' — §18/M1", async () => {
  const body = await minimapBody();
  // The established dot must come from the shared palette map, not a literal glyph coined here —
  // a ✓ or a word implying finality would contradict "a correct retrieval is not terminal".
  assert.doesNotMatch(body, /["'`]✓["'`]/, "a literal checkmark glyph appeared on the territory panel");
  assert.doesNotMatch(body, /\bdone\b|\bcomplete[d]?\b|\bfinished\b/i, "completion language reached a territory row");
});

test("the control is gated by !minimal, alongside its siblings — session chrome, not the composer", async () => {
  const header = stripComments(await HEADER_SOURCE);
  const gated = /\{!minimal && \(\s*<>[\s\S]*?<MinimapControl[\s\S]*?<\/>\s*\)\}/.exec(header);
  assert.ok(gated, "MinimapControl is not inside the !minimal block — it would stay on screen during a retrieval");
});

test("MinimapControl receives a narrow slice, not the whole PolicyRuntime, through CanvasHeader", async () => {
  const header = stripComments(await HEADER_SOURCE);
  assert.match(
    header,
    /minimap:\s*Pick<PolicyRuntime,/,
    "CanvasHeader's minimap prop is no longer a narrow Pick<> — check it still cannot reach runtime internals it does not need",
  );
});

test("the control opens and closes the same way its siblings do — useDismiss, not a bespoke handler", async () => {
  const body = await minimapBody();
  assert.match(body, /useDismiss\(open, \(\) => setOpen\(false\)\)/, "MinimapControl no longer shares the panel dismissal pattern");
});
