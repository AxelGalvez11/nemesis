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

/** The class list of the first element of the given tag.
 *
 *  🔴 ANY WHITESPACE AFTER THE TAG NAME, NOT A LITERAL SPACE. This looked for `"<header "` and so
 *  stopped finding the element the moment its attributes were split across lines — which is what a
 *  formatter does as soon as a second attribute is added. The failure was `no <header> in the
 *  source`, i.e. it read as "the header was deleted" rather than "my parser cannot see it", and the
 *  obvious way to make that green again is to weaken the assertions underneath. A guard that
 *  misreports its own blindness as a product defect is worse than no guard. */
function classesOf(source: string, tag: string): string {
  const open = new RegExp(`<${tag}\\s`).exec(source);
  assert.ok(open, `no <${tag}> in the source`);
  const match = /className="([^"]+)"/.exec(source.slice(open.index, open.index + 600));
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
  // 64px, down from 72 -- compact-UI pass, tightened alongside the header this padding clears
  // (12px inset + 28px control + 24px breathing room, was 16+32+24).
  assert.match(shell, /overflow-y-auto pt-\[64px\]/);
  // Two measurements of two different things, both taken off the references: the reading
  // column is 680, the composer pill is 768. Neither is a rounding of the other.
  //
  // 🔴 768, WAS 770 — MEASURED, NOT TIDIED (UX brief §27.2). The owner measured ChatGPT's composer
  // form at exactly 768px wide in their own browser at a 1440px viewport, against our 770. Two
  // pixels is invisible; the reason to move is that 770 was a number nobody could point at, and a
  // spec written from a measurement should hold the measured value so the next person comparing
  // the two surfaces finds them equal rather than nearly equal.
  //
  // 🔴 AND IT IS WRITTEN IN PX, WHICH IS LOAD-BEARING HERE. `apps/web`'s root is 112.5%, so any
  // rem-expressed width would render 12.5% larger than its number — 42rem, the shared chat
  // composer's max width, is 756px and not 672. See canvas-composer.tsx's header.
  assert.match(shell, /"--canvas-column" as string\]: "680px"/);
  assert.match(read("canvas-composer.tsx"), /max-w-\[768px\]/);
  // 52/26, MEASURED off ChatGPT's live composer for the compact-UI pass (was 54/27, close
  // already) -- see the sizing note at the top of canvas-composer.tsx.
  assert.match(read("canvas-composer.tsx"), /min-h-\[52px\][^"]*rounded-\[26px\]/);
});

test("there is exactly one answer surface on the canvas", () => {
  // 🔴 REPOINTED, NOT RETIRED. This used to read `canvas-stages.tsx`, where the recall and test
  // stages each grew their own textarea, microphone and submit button — two composers on one
  // screen, and the learner had to work out which was for them. Those stages are deleted, but the
  // PROPERTY outlives them: whatever presents a task must not grow its own answer box. The policy
  // view is what presents tasks now, so the check follows it there.
  const policy = read("canvas-policy-view.tsx");
  assert.ok(!/<textarea/.test(policy), "the task surface must not contain a text input — the composer is the answer surface");
  assert.ok(!/useCanvasDictation/.test(policy), "the task surface must not own a second microphone");

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

/* 🔴 RETIRED WITH `canvas-stages.tsx`, AND THE GAP IS DELIBERATE AND REPORTED, NOT HIDDEN.
 *
 * A test here asserted §27 — that question, feedback and taught text carry `selectableRegion(...)`
 * so the learner can select and ask about them. Its four subjects (`recall:`, `question:`,
 * `feedback:`, `taught:`) were all in the deleted stages.
 *
 * `canvas-policy-view.tsx` calls `selectableRegion` NOWHERE, so the property has no subject in the
 * surviving arm. Repointing this test would have meant either asserting something false or quietly
 * dropping the region list to make it pass — and a test kept alive by lowering its bar is worse
 * than the deletion it survived.
 *
 * So it is retired, and the honest consequence is recorded instead: **task text on the policy arm
 * is not currently marked selectable.** That is a real capability the legacy arm had and the
 * surviving one does not. It is a product decision (does §27 apply to a task prompt, or only to
 * reading material?), so it is Brain's to rule on, not something to smuggle back in as a test. */

test("nothing offers a one-key reveal of the answer", () => {
  // 🔴 HALF REPOINTED, HALF RETIRED, on purpose.
  //
  // §22: a reveal shortcut makes the cheapest path through a retrieval prompt the one that
  // produces no retrieval. The ABSENCE half is a property of whatever presents a retrieval, so it
  // follows to the policy view.
  const policy = read("canvas-policy-view.tsx");
  assert.ok(!/Show me the answer/.test(policy), "the reveal control must not come back");
  assert.ok(!/event\.code === "Space"|event\.key === " "/.test(policy), "no space-to-reveal binding");

  // The old positive assertion looked for the literal "I don't know" BUTTON. It is not repointed,
  // because the control was deliberately replaced rather than moved: a learner who does not know
  // says so in the composer, and `isAdmissionOfNotKnowing` routes it down the same
  // no-demonstration path the button used. Asserting the literal here would demand the return of
  // the control §22's own fix removed. The meaning survives in the runtime, which owns that test.
  assert.ok(!/I don&rsquo;t know/.test(policy), "the admission is the composer's, not a button on the task");
});

test("the top scrim fades to nothing, so it draws no edge", () => {
  const shell = read("learning-canvas.tsx");
  const scrim = /className="pointer-events-none absolute inset-x-0 top-0 [^"]*bg-gradient-to-b ([^"]+)"/.exec(shell);
  assert.ok(scrim?.[1], "expected a top scrim on the canvas");
  // A gradient terminating in a colour would put a step at its lower edge — which is a divider
  // drawn 88px lower down, exactly the thing being removed.
  assert.match(scrim[1], /to-transparent/);
});

test("a correction is prose, not a card", () => {
  // 🔴 REPOINTED. The subject was `{response.taught && ...}` in the deleted stages; the property —
  // an explanation reads as writing rather than as a component the app produced — outlives it and
  // now belongs to the policy view's feedback and correction screens.
  const policy = read("canvas-policy-view.tsx");
  const explanation = /\{feedback\.evaluation\.feedback\}|\{decision\.knowledge\.statement\}/.test(policy);
  assert.ok(explanation, "expected the policy view to still render an explanation");

  // Every explanatory passage is a <p>, and none of them is boxed. A border, a ring or an elevated
  // fill would demote the correction to a widget.
  const paragraphs = policy.match(/<p className="[^"]*"/g) ?? [];
  assert.ok(paragraphs.length >= 3, `expected the explanatory paragraphs: got ${paragraphs.length}`);
  for (const paragraph of paragraphs) {
    assert.ok(
      !/\bborder\b|\bring-1\b|bg-\(--ui-bg-elevated\)/.test(paragraph),
      `an explanation must not be re-boxed: ${paragraph}`,
    );
  }

  // The learner's own quoted words keep their quieter type but are likewise not a card.
  assert.match(policy, /[“"]\{feedback\.answer\}[”"]/, "the learner's words are still shown");
});

test("the task surface reserves room for the floating composer", () => {
  // 🔴 REPOINTED. This has broken twice: a vertically centred task grows downward as feedback
  // arrives, and its primary action slides under the composer's gradient. The stages are gone; the
  // policy view now owns every centred, growable task region, so the check follows it.
  const policy = read("canvas-policy-view.tsx");
  const regions = policy.match(/regionHeight\(sharing: boolean\): string \{[\s\S]*?\}/)?.[0] ?? "";
  assert.ok(regions, "expected regionHeight to still decide how the task region sizes itself");
  assert.match(regions, /\bpb-40\b/, "a full-height task must reserve composer clearance");
  // `h-full` would clip a long correction instead of letting the page scroll to it. Anchored to a
  // space, not `\b`: a hyphen is a non-word character, so `\bh-full\b` happily matches the
  // `h-full` sitting inside `min-h-full` and the assertion inverts itself.
  assert.ok(!/(^|\s)h-full(\s|$)/.test(regions), `use min-h-full so the task can grow: ${regions}`);
});

test("🔴 every Canvas upload door accepts exactly the same material", () => {
  // Integration found this live: the Sources panel took `.xlsx`/`.csv` and the composer's "Add
  // material" refused them, so a learner was told their spreadsheet was unsupported by one control
  // and supported by another. UX brief §2 names a spreadsheet explicitly among what the composer
  // must take; §15's one-component rule makes a per-door capability list exactly the drift it
  // exists to prevent.
  //
  // 🔴 THE CHECK IS "THEY REFERENCE ONE CONSTANT", NOT "THE STRINGS MATCH". Three equal literals
  // are how this drifted in the first place — they were equal once too. A shared constant cannot
  // be edited in one place.
  for (const door of ["canvas-composer.tsx", "canvas-home.tsx", "canvas-controls.tsx"]) {
    const source = read(door);
    assert.match(
      source,
      /accept=\{ACCEPTED_MATERIAL\}/,
      `${door} declares its own accept list — the three doors have to promise the same thing, because the list is a claim about what the extractor can read`,
    );
    assert.equal(
      /accept="\./.test(source),
      false,
      `${door} still carries a literal accept list somewhere`,
    );
  }
});
