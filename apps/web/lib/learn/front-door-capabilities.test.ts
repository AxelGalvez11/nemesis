import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAPABILITY_COPY, COMPOSER_CAPABILITIES } from "./composer-capability";

// Every capability is reachable from BOTH composers, or from neither.
//
// 🔴 THIS TEST EXISTS BECAUSE THE OWNER FOUND THE GAP, NOT BECAUSE ANYTHING FAILED. Deep research
// shipped in #824: added to `COMPOSER_CAPABILITIES`, offered by the session composer, wired through
// `?cap=` and validated in `learn/page.tsx`. Every one of those is generic. The front door's `+`
// menu was not — it wrote one row by hand, `setCapability("course")` — so it kept offering exactly
// one capability while claiming to be the menu, and the whole feature was invisible to anyone who
// had not already opened a canvas. Nothing broke, no test went red, and the owner opened the `+`
// on the landing page and asked where Deep research had gone.
//
// A hard-coded row cannot be wrong about itself. That is what makes it dangerous: it stops being
// the whole menu without ever becoming incorrect.

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * The file with its comments removed, so a guard reads the code and not the explanation of the
 * code.
 *
 * 🔴 IT STRIPS BLOCK COMMENTS AS SPANS, NOT LINE BY LINE, AND THAT MATTERS. The line-prefix version
 * used by the neighbouring guards drops a line only when it BEGINS with `//`, `*` or `{/*` — so the
 * second and later lines of a wrapped `{/* … *\/}` block survive, prose and all. This very test
 * failed on its own comment for that reason: the sentence explaining that the old code said
 * `setCapability("course")` was read as code saying it. A guard that its own rationale can trip is
 * a guard nobody can write honestly about.
 */
const code = (path: string): string =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const HOME = "../../components/workspace/learn/canvas-home.tsx";
const COMPOSER = "../../components/workspace/learn/canvas-composer.tsx";

test("🔴 the front door builds its menu from the list, never from a name", () => {
  const home = code(HOME);
  assert.match(home, /COMPOSER_CAPABILITIES\.map\(/, "the front door's `+` does not iterate the capabilities");
  // The specific regression: a row that names one capability is a row that cannot notice the next.
  for (const capability of COMPOSER_CAPABILITIES) {
    assert.ok(
      !home.includes(`setCapability("${capability}")`),
      `🔴 the front door stages ${capability} by name — add a third capability and this row is still the only one`,
    );
  }
});

test("🔴 the session composer builds its menu from the list too", () => {
  const composer = code(COMPOSER);
  assert.match(composer, /for \(const offered of capabilities\)/, "the session composer's `+` does not iterate");
});

test("🔴🔴 and the canvas HANDS it the whole list, which is where the second copy hid", () => {
  // 🔴 THE COMPOSER ITERATED CORRECTLY AND STILL SHOWED TWO ROWS, because what it was handed was a
  // hand-written `["course", "research"]` in `learning-canvas.tsx`. Iterating a list that is itself
  // a stale copy is the same defect one level up — and this guard is the half that was missing when
  // five capabilities were added on 2026-08-25 and only the front door showed them.
  //
  // Calibration: write the array out by name again and this reddens.
  const canvas = code("../../components/workspace/learn/learning-canvas.tsx");
  assert.match(
    canvas,
    /const CANVAS_CAPABILITIES: readonly ComposerCapability\[\] = COMPOSER_CAPABILITIES;/,
    "the canvas hands the composer its own copy of the capability list",
  );
  assert.ok(
    !/CANVAS_CAPABILITIES[^=]*=\s*\[/.test(canvas),
    "🔴 the canvas builds a literal capability list — it will go stale the next time the union grows",
  );
});

test("both surfaces read the same copy record, so the two menus cannot disagree", () => {
  for (const path of [HOME, COMPOSER]) {
    const text = code(path);
    assert.match(text, /CAPABILITY_COPY\[/, `${path} does not index the copy record`);
    for (const capability of COMPOSER_CAPABILITIES) {
      assert.ok(
        !text.includes(`CAPABILITY_COPY.${capability}`),
        `🔴 ${path} reaches for CAPABILITY_COPY.${capability} directly, which is the hard-coded row in another spelling`,
      );
    }
  }
});

test("🔴 a staged capability asks its own question, not the generic one", () => {
  // The placeholder used to be `capability === "course" ? … : "Ask Nemesis…"`. That is not a
  // default; it is the wrong sentence for every capability except the one named, and it is what
  // put "Ask Nemesis…" under a Deep research chip.
  for (const capability of COMPOSER_CAPABILITIES) {
    const prompt = CAPABILITY_COPY[capability].prompt;
    assert.ok(prompt.length > 0, `${capability} has no placeholder question`);
    assert.ok(prompt.endsWith("?"), `${capability}'s placeholder should ask something: ${prompt}`);
  }
  for (const path of [HOME, COMPOSER]) {
    const text = code(path);
    assert.ok(
      !/capability === "(course|research)"/.test(text),
      `🔴 ${path} still branches its placeholder on a capability by name`,
    );
    assert.match(text, /CAPABILITY_COPY\[capability\]\.prompt/, `${path} does not use the capability's own question`);
  }
});

test("the front door can carry every capability to the canvas", () => {
  // `?cap=` is validated against COMPOSER_CAPABILITIES in learn/page.tsx, so the pipe is already
  // generic — this pins that it stays that way, since a menu row is useless if the URL drops it.
  const page = code("../../app/(workspace)/learn/page.tsx");
  assert.match(page, /COMPOSER_CAPABILITIES as readonly string\[\]\)\.includes\(entry\.cap/);
  const home = code(HOME);
  assert.match(home, /&cap=\$\{capability\}/, "the front door does not send the staged capability at all");
});
