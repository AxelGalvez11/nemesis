// Guards for the shape of the canvas shell.
//
// These are source-level assertions rather than rendered-DOM ones, because the thing being
// protected IS a styling decision and there is no DOM harness in this package. Crude, but it
// catches the exact regression it exists for: someone reaching for `border-b` to "tidy up" the
// top of the canvas, or wrapping a piece of explanation back into a card.
//
// The behaviour they encode was measured in the browser, not guessed:
//   - the old header painted a full-width 1px edge at y≈54 across all 1024 columns
//   - a vertically centred stage pushes its own primary action under the composer's fade
//   - `flex-1` + pointer events on the title turned the strip into a click trap

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (file: string) => readFileSync(join(import.meta.dirname, file), "utf8");

/** The class list of the first element of the given tag. */
function classesOf(source: string, tag: string): string {
  const open = source.indexOf(`<${tag} `);
  assert.notEqual(open, -1, `no <${tag}> in the source`);
  const match = /className="([^"]+)"/.exec(source.slice(open, open + 600));
  assert.ok(match?.[1], `<${tag}> has no literal className`);
  return match[1];
}

test("the top controls are a transparent layer, never a header bar", () => {
  const header = classesOf(read("canvas-header.tsx"), "header");

  // The measured defect: a full-width painted edge under the controls.
  assert.ok(!/\bborder(-[btxy])?\b/.test(header), `header must not carry a border: ${header}`);
  assert.ok(!/\bbg-/.test(header), `header must not have a background of its own: ${header}`);
  assert.ok(!/\bshadow/.test(header), `header must not cast a shadow: ${header}`);
  assert.ok(!/backdrop/.test(header), `header must not use a backdrop filter: ${header}`);

  // It floats over the page rather than occupying a row in the column flow, and it does not
  // eat clicks meant for the document scrolling underneath it.
  assert.match(header, /\babsolute\b/);
  assert.match(header, /\bpointer-events-none\b/);
});

test("the canvas title is a label, not a full-width click target", () => {
  const source = read("canvas-header.tsx");
  const title = /<span className="([^"]*flex-1[^"]*)"/.exec(source);
  assert.ok(title?.[1], "expected the title span to still be the flex-1 element");
  assert.ok(
    !/pointer-events-auto/.test(title[1]),
    "the title spans the whole strip; making it interactive blocks selecting the text beneath it",
  );
});

test("the shell reserves clearance with padding rather than a header element", () => {
  const shell = read("learning-canvas.tsx");
  // Padding on the scroller, not a sized box above it.
  assert.match(shell, /overflow-y-auto pt-\[72px\]/);
  // Two measurements of two different things, both taken off the references: the reading
  // column is 680, the composer pill is 770. Neither is a rounding of the other.
  assert.match(shell, /"--canvas-column" as string\]: "680px"/);
  assert.match(read("canvas-composer.tsx"), /max-w-\[770px\]/);
  assert.match(read("canvas-composer.tsx"), /min-h-\[54px\][^"]*rounded-\[27px\]/);
});

test("there is exactly one answer surface on the canvas", () => {
  const stages = read("canvas-stages.tsx");
  // 🔴 The recall and test stages each used to grow their own textarea, microphone and submit
  // button, which put two composers on one screen and made the learner work out which was for
  // them. The persistent composer answers everything now.
  assert.ok(!/<textarea/.test(stages), "no stage may contain a text input — the composer is the answer surface");
  assert.ok(!/useCanvasDictation/.test(stages), "no stage may own a second microphone");

  const composer = read("canvas-composer.tsx");
  assert.match(composer, /<textarea/, "the composer is where answering happens");
  // It routes by what is being asked rather than by having two of itself.
  assert.match(composer, /if \(answering\) onAnswer\(/);
});

test("selectable regions opt back in to text selection", () => {
  const hook = read("use-canvas-selection.ts");
  // 🔴 The whole selection layer is inert without this. The workspace sets `user-select: none`
  // under `[data-workspace]`, and `desktop-chrome.css` re-enables text only for elements
  // carrying `data-selectable-text`. Without it a Range still constructs and reads back
  // correctly in code — so every internal check passes — while the browser refuses to make a
  // selection at all and no drag does anything.
  assert.match(hook, /"data-selectable-text": "true"/);
});

test("the selection marker sits on the element holding only the block's text", () => {
  const document_ = read("canvas-document.tsx");
  // The <section> also contains the note, the hover concept labels, the source panel and the
  // aside, so offsets measured from there would count all of it and come out plausible and
  // wrong. The marker belongs on the element inside BlockBody.
  const body = document_.slice(document_.indexOf("function BlockBody"));
  assert.match(body, /selectableRegion\(block\.id/);
  const section = document_.slice(document_.indexOf("<section"), document_.indexOf("</section>"));
  assert.ok(!/data-selectable-id/.test(section.slice(0, section.indexOf("<BlockBody"))),
    "the section itself must not be the measured region");
});

test("question and feedback text are selectable but not rewritable", () => {
  const stages = read("canvas-stages.tsx");
  // §27: text interaction is a canvas primitive, not a reading-stage feature.
  for (const region of ["recall:", "question:", "feedback:", "taught:"]) {
    assert.ok(stages.includes(`selectableRegion(\`${region}`), `${region} text should be selectable`);
  }
  // None of them pass `rewritable` — "Simpler" would have nowhere to write.
  assert.ok(!/selectableRegion\(`[^`]+`, \{[^}]*rewritable/.test(stages));
});

test("nothing offers a one-key reveal of the answer", () => {
  const stages = read("canvas-stages.tsx");
  // §22: a reveal shortcut makes the cheapest path through a retrieval prompt the one that
  // produces no retrieval. "I don't know" replaces it — same lack of evidence, but stated by
  // the learner rather than reached by pressing space.
  assert.ok(!/Show me the answer/.test(stages), "the reveal control must not come back");
  assert.ok(!/event\.code === "Space"|event\.key === " "/.test(stages), "no space-to-reveal binding");
  assert.match(stages, /I don&rsquo;t know/);
});

test("the top scrim fades to nothing, so it draws no edge", () => {
  const shell = read("learning-canvas.tsx");
  const scrim = /className="pointer-events-none absolute inset-x-0 top-0 [^"]*bg-gradient-to-b ([^"]+)"/.exec(shell);
  assert.ok(scrim?.[1], "expected a top scrim on the canvas");
  // A gradient terminating in a colour would put a step at its lower edge — which is a divider
  // drawn 88px lower down, exactly the thing being removed.
  assert.match(scrim[1], /to-transparent/);
});

test("explanation is not boxed; the learner's own words are", () => {
  const stages = read("canvas-stages.tsx");

  // What the canvas taught in response to an answer renders as prose.
  const taught = /\{response\.taught && \(\s*<(\w+)([^>]*)>/.exec(stages);
  assert.ok(taught?.[1] && taught[2] !== undefined, "expected the taught passage to still be rendered");
  assert.equal(taught[1], "p", "the correction is prose, not a card");
  assert.ok(
    !/\bborder\b|\bring-1\b|bg-\(--ui-bg-elevated\)/.test(taught[2]),
    `the correction must not be re-boxed: ${taught[2]}`,
  );

  // A message bubble IS a meaningful object, so it keeps its fill — but not an outline on top.
  const bubbles = stages.match(/className="rounded-\[18px\][^"]*"/g) ?? [];
  assert.equal(bubbles.length, 2, "expected the test and recall learner bubbles");
  for (const bubble of bubbles) {
    assert.ok(/bg-\(--ui-bg-tertiary\)\/40/.test(bubble), `bubble should keep the soft fill: ${bubble}`);
    assert.ok(!/\bborder\b/.test(bubble), `bubble should not also be outlined: ${bubble}`);
  }
});

test("stages reserve room for the floating composer", () => {
  const stages = read("canvas-stages.tsx");
  // 🔴 This has broken twice. A vertically centred stage grows downward as the teaching loop
  // adds a correction, and its own primary action slides under the composer's gradient.
  const centred = stages.match(/className="flex min-h-full flex-col items-center justify-center[^"]*"/g) ?? [];
  assert.ok(centred.length >= 2, "expected the recall and test stages to be centred columns");
  for (const stage of centred) {
    assert.match(stage, /\bpb-40\b/, `a centred stage must reserve composer clearance: ${stage}`);
    // `h-full` would clip a long correction instead of letting the page scroll to it.
    // Anchored to a space, not `\b`: a hyphen is a non-word character, so `\bh-full\b` happily
    // matches the `h-full` sitting inside `min-h-full` and the assertion inverts itself.
    assert.ok(!/(^|\s)h-full(\s|$)/.test(stage), `use min-h-full so the stage can grow: ${stage}`);
  }
});
