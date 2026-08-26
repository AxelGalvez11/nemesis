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
import { readdirSync, readFileSync } from "node:fs";
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
  // 🔴 REPOINTED TO canvas-surface.tsx, WHERE THE ELEMENT NOW LIVES — not weakened. §38.2 makes the
  // `×` the only way out of a canvas, so the floating strip and the exit inside it were hoisted
  // above `learning-canvas.tsx`'s render branches, where no branch can omit them. The property
  // being guarded is unchanged: no border, no background, no shadow, no backdrop.
  const header = classesOf(read("canvas-surface.tsx"), "header");

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
  // 🔴 REPOINTED 2026-08-20: the scroller gained `pb-[160px]` between these two classes, so a regex
  // pinning them ADJACENT went red on a change that altered neither. Both properties are still
  // pinned — and the bottom clearance is pinned too, because its ABSENCE was the bug: the composer
  // floats over this column and took no space in it, so the end of every answer was unreachable.
  assert.match(shell, /overflow-y-auto[^"]*pt-\[64px\]/, "the scrolling column lost its header offset");
  assert.match(shell, /overflow-y-auto[^"]*pb-\[160px\]/, "the scrolling column cannot scroll past the composer");
  // 🔴🔴 ONE MEASUREMENT NOW, NOT TWO. This used to read "the reading column is 680, the composer
  // pill is 768. Neither is a rounding of the other" — and it was wrong about the first. Measured
  // side by side on 2026-08-26 at a 1470px viewport, same request in both:
  //
  //             reference   Nemesis (before)
  //   text      768px       626px
  //   composer  768px       768px
  //
  // The reference sets its prose to exactly the width of its composer. Ours had the lesson at 626
  // under a composer at 768, which is one column drawn as two. 822 is the OUTSIDE of the reading
  // box: every part of the canvas wears `max-w-(--canvas-column) px-6`, and `px-6` is 27px a side
  // against this app's 112.5% root, so 822 - 54 = 768 of text.
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
  // The sheet and its measure moved to canvas-surface.tsx with the <main> the exit had to sit on.
  assert.match(read("canvas-surface.tsx"), /"--canvas-column" as string\]: CANVAS_COLUMN_PX/);
  assert.match(read("canvas-surface.tsx"), /CANVAS_COLUMN_PX = "822px"/, "the reading column is no longer 768 of text");
  // 🔴 THE NUMBER MOVED INTO A TOKEN, SO THE GUARD FOLLOWS IT AND STILL CHECKS THE VALUE. The
  // composer now reads `--composer-max-width` so Library, Canvas and the composer share one
  // content frame instead of each spelling 768 separately. Asserting only that the class reads
  // `var(--composer-max-width)` would pass at any width at all, which is how a spec written from
  // a measurement quietly stops holding the measurement — so the token's own value is asserted
  // too, in the file that declares it.
  assert.match(read("canvas-composer.tsx"), /max-w-\[var\(--composer-max-width\)\]/);
  assert.match(
    readFileSync(join(import.meta.dirname, "../../../app/globals.css"), "utf8"),
    /--composer-max-width:\s*768px/,
  );
  // 52/26, MEASURED off ChatGPT's live composer for the compact-UI pass (was 54/27, close
  // already) -- see the sizing note at the top of canvas-composer.tsx.
  //
  // 🔴 REPOINTED 2026-08-20: these two were ONE class string until attachments moved inside the
  // composer, which made it a column — the radius belongs to the growing box and the 52px to the
  // input row within it. A regex spanning both went red on a change that altered neither number.
  // Both properties are still pinned, just separately.
  //
  // 🔴 REPOINTED AGAIN 2026-08-21, AND THIS TIME A NUMBER GENUINELY WENT. The second radius (20px)
  // existed for the grown state the source chips produced; the chips are gone from the composer
  // (owner: *"the sources should appear in the sources"*), so the box has one radius again. The
  // MEASURED number, 26px, is what this test exists to pin and it is unchanged — what is dropped is
  // the assertion that a second, now-unreachable one is still spelled out beside it.
  const composer = read("canvas-composer.tsx");
  // 🔴 THE TOKEN NOW, AND THE MEASURED NUMBER MOVED RATHER THAN LEFT. The literal `min-h-[52px]`
  // was one of three shape values the canvas composer held privately while the FRONT DOOR's
  // composer — the one that flies into this one's place on every send — read them from
  // `--composer-*`. Two of the three had already drifted (26px vs 28px radius, 12px vs 8px side
  // padding), which is a 2px corner pop and a 4px control shift at the exact instant of the route
  // swap. So this asserts the same 52px, one level up: the class points at the token, and the
  // token's own value is pinned in globals.css beside the rest of the composer's geometry.
  assert.match(composer, /min-h-\[var\(--composer-min-height\)\] items-center/, "the input row stopped using the shared height");
  assert.match(read("../../../app/globals.css"), /--composer-min-height: 52px;/, "the input row is no longer 52px tall");
  // 🔴 AND THE RADIUS WENT THE SAME WAY, WITH ONE REAL CORRECTION ON THE WAY. This pinned a private
  // 26px while the front door's composer — the one that flies into this one's place — had been on
  // `--composer-radius: 28px` all along. Two pills that are one object to a learner were two
  // pixels apart, and the difference only ever showed for the single frame of the route swap,
  // which is precisely where nobody looks for it. The token wins because globals.css records that
  // its values are the ones measured off the reference.
  assert.match(composer, /"rounded-\[var\(--composer-radius\)\]"/, "the composer radius stopped using the shared token");
  assert.match(read("../../../app/globals.css"), /--composer-radius: 28px;/, "the composer radius is no longer measured");
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

test("🔴🔴 the masthead is solid and never overlaps the resting content", () => {
  // REPOINTED, 2026-08-19. The old assertion demanded `to-transparent` — a gradient — on the
  // grounds that a fade draws no edge. It draws no edge and it DOES fade whatever is under it:
  // at 88px it reached 24px into a column that rests at `pt-[64px]`, so in dark mode the top of
  // the learner's own question dissolved into black. "Draws no edge" was the wrong property to
  // protect; "never paints over a letter" is the right one, and a solid band shorter than the
  // resting offset gives both.
  const shell = read("canvas-surface.tsx");
  const band = /className="pointer-events-none absolute inset-x-0 top-0 z-20 h-\[(\d+)px\] ([^"]+)"/.exec(shell);
  assert.ok(band, "expected a masthead band at the top of the canvas");

  const height = Number(band[1]!);
  assert.ok(!/gradient/.test(band[2]!), "the masthead fades again — it will erase the top of the question");

  // The scroll container's own top padding — which lives in `learning-canvas.tsx`, a different
  // file from the band. Read rather than hard-coded: the two numbers are only meaningful against
  // each other, they are declared apart, and pinning one while the other moves is exactly how this
  // came back the first time.
  const resting = /overflow-y-auto[^"]*pt-\[(\d+)px\]/.exec(read("learning-canvas.tsx"));
  assert.ok(resting, "expected the scrolling column to declare its top offset");
  assert.ok(
    height < Number(resting[1]!),
    `the masthead (${height}px) reaches into the resting column (${resting[1]!}px) and will cover text`,
  );
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

  // The learner's own words are likewise not a card. 🔴 THE QUOTE MARKS THIS USED TO REQUIRE ARE
  // GONE (§46.2): `LearnerUtterance` carries authorship on a tinted ground instead, because
  // punctuation reads as "someone said this" — true of every line on the screen — and the old
  // treatment leaned on 24.75px to do the rest, which §46.3 forbids. The property is unchanged:
  // the learner's own words are still rendered.
  assert.match(
    policy,
    /<LearnerUtterance[^>]*>\{feedback\.answer\}<\/LearnerUtterance>/,
    "the learner's words are still shown",
  );
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

test("🔴 §39: the Continue owner reads the RUNTIME's exposition, not the decision's", () => {
  // 🔴 A REACHABLE DISAGREEMENT BETWEEN TWO DOORS, MEASURED BY CALLING THE FUNCTIONS.
  //
  //   answer the LAST objective on a canvas -> `decideNext` returns null while the verdict is up
  //     via the decision   declaredCognitiveMode(null) -> null -> requiresReading TRUE -> Continue
  //     via the runtime    the verdict's own transient exposition        -> the screen auto-advances
  //
  // The learner was offered a button on a screen already moving on underneath it. `use-policy-
  // runtime` exposes `exposition` precisely because a verdict can outlive the decision that
  // produced it, and its own comment records that `declaredCognitiveMode` "cannot see the case
  // above" — so reading the decision here is not a style choice, it is the defect.
  const shell = read("learning-canvas.tsx");
  assert.match(
    shell,
    /readingRequirementOf\(policy\.exposition\.mode\)/,
    "the Continue owner is reading the decision again — a verdict outliving its decision reads as 'we were not told', which puts a Continue on a screen that auto-advances",
  );
  assert.equal(
    /readingRequirementOf\(declaredCognitiveMode\(/.test(shell),
    false,
    "declaredCognitiveMode is back in the Continue owner; it cannot see a verdict that outlived its decision",
  );
});

test("🔴 §46.5: the landing surface never tells the learner which way to scroll", () => {
  // 🔴 THE OWNER QUOTED A STRING THAT IS NOT IN THIS REPO. §46.5 names "Scroll down to see the
  // other canvases"; it appears in no file and in no commit. What it describes is a RULE, and the
  // rule is what this guards: the front door may not explain its own navigation. The one line that
  // actually matched was the empty state, "Nothing yet. Whatever you start above will appear
  // here." — a sentence pointing at the composer the learner is already looking at.
  //
  // 🔴 THE PATTERNS ARE DIRECTIONAL WORDS NEXT TO INTERFACE WORDS, NOT A BANNED-PHRASE LIST. A list
  // of exact sentences only ever catches the sentence someone already removed; the next one is
  // phrased differently and passes. What cannot be rephrased away is pointing at a direction.
  const source = read("canvas-home.tsx");
  // Comments explain the rule and legitimately quote the copy being banned, so they are stripped
  // before matching. Without this the guard fails on its own explanation, and the obvious way to
  // make it green is to delete the reasoning — which is the wrong repair.
  const copy = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const directional = [
    /scroll (down|up|below|further)/i,
    /\bswipe\b/i,
    /(start|type|create|add|put)[^.<>{}]{0,40}\babove\b/i,
    /\bbelow\b[^.<>{}]{0,40}(canvas|session|list|see|find)/i,
    /see (the )?(other|more|your) (canvas|session)/i,
    /(will )?appear (here|below)/i,
  ];
  for (const pattern of directional) {
    assert.equal(
      pattern.test(copy),
      false,
      `the front door carries navigation instructions again (matched ${pattern}). §46.5: canvases are discoverable through layout, never through prose telling the learner where to look.`,
    );
  }
});

test("🔴 §46.5: the front door is the composer, and nothing is filed below it", () => {
  // 🔴 THIS GUARD HAS NOW REPLACED TWO EARLIER ONES, AND THE HISTORY IS THE POINT.
  //   v1 asserted a 56px `--first-screen-lift` that left the canvases peeking above the fold —
  //      reasoning that §46.5 bans instructional scroll hints, so the LAYOUT had to hint instead.
  //   v2 removed the fold and asserted the canvases sat ON the first screen.
  //   v3 — this one — is what the owner actually wanted: no canvas list on this surface at all.
  //      They marked a screenshot green around the greeting and composer, red around the list:
  //      "i dont want this at all. i dont want whats in red, only whats in green".
  //
  // Both earlier versions were rearranging a thing that should not have been there. A landing
  // page that shows a learner their backlog invites them to browse it, and the product's claim is
  // that they arrive with something to learn and begin immediately.
  const source = read("canvas-home.tsx");
  const copy = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // 🔴 THE PROPERTY IS "NOTHING ENUMERATES THE LEARNER'S CANVASES HERE", NOT "THE WORD sessions IS
  // ABSENT". A guard matching one identifier would go green the moment the list came back under a
  // different name, which is precisely how it would come back.
  for (const [pattern, why] of [
    [/\blistCanvases\b/, "the front door fetches the canvas list again"],
    [/\blistFolders\b/, "the front door fetches folders again — folders exist to organise a list"],
    [/\.map\(\s*\(?\s*session/, "the front door renders a row per canvas again"],
    [/\bpinnedAt\b/, "pinning is a property of a list, and there is no list here"],
  ] as const) {
    assert.equal(
      pattern.test(copy),
      false,
      `${why}. §46.5 v3: the landing surface is the greeting, the composer and its hint line — nothing else.`,
    );
  }

  // 🔴 AND THE FOLD MACHINERY MUST NOT RETURN WITH IT. With nothing below the composer there is no
  // scroll to track and no second position to morph into. A moving part kept for a problem the
  // page no longer has is how the fold gets quietly reintroduced to justify it.
  for (const dead of ["--first-screen-lift", "DOCK_AFTER_PX", "setDocked", "docked ?"]) {
    assert.equal(
      copy.includes(dead),
      false,
      `${dead} is back — that machinery only exists to hide something below a fold`,
    );
  }
  assert.equal(
    /pointer-events-none absolute inset-x-0 z-30/.test(copy),
    false,
    "the composer is floating over the page again instead of sitting in the column",
  );

  // 🔴 AND THE GREEN HALF MUST STILL BE THERE. Every assertion above is satisfied by an empty
  // file, which is the failure mode this repo has already met: a guard that only forbids passes
  // perfectly against a deleted feature. So the surface must still hold what the owner kept.
  assert.ok(/What are you working on\?/.test(source), "the greeting is gone");
  assert.ok(/ASK_PLACEHOLDER|Ask Nemesis/.test(source), "the composer is gone");
  assert.ok(/CanvasRecorder/.test(source), "dictation and recording left the composer");
});

test("🔴 §46.3: the Canvas has ONE type scale, and it has five steps", () => {
  // 🔴 THIRTEEN SIZES IS NOT A SCALE. The surface was drawn with thirteen distinct font sizes
  // between 11.25px and 31.5px — every one a local decision, which is exactly what §46.3 bans:
  // "Do not create dramatic text-size jumps to manufacture importance. Large fonts are not a
  // semantic tool in Nemesis." They are now five tokens declared in desktop-ui.css.
  //
  // 🔴 THE REM FORM IS BANNED OUTRIGHT, NOT JUST DISCOURAGED. `html { font-size: 112.5% }` is set
  // deliberately in this repo, so `text-[0.8125rem]` reads as 13px and paints as 14.6px. Sizes that
  // read as one number and paint as another are how thirteen of them accumulated without anyone
  // choosing thirteen. A literal px value is banned too: it would be a sixth step nobody declared.
  // 🔴 THERE IS AN ESCAPE HATCH, AND IT COSTS A WRITTEN REASON. Two inputs genuinely must be
  // `text-[16px]`: below 16px iOS Safari zooms the whole viewport in on focus, and that is a
  // platform threshold rather than a typographic choice — binding it to the scale would let a
  // future type tweak silently break focus on every iPhone. A blanket exception for "px in an
  // input" would have been invisible; a marker on the line names the cost each time it is paid.
  const EXEMPT = /§46\.3-exempt:\s*\S/;
  // 🔴 BOTH SURFACES, BECAUSE §46.3 SAYS "TYPOGRAPHY", NOT "CANVAS TYPOGRAPHY". The first version
  // of this guard covered only this directory, and the shell quietly kept ten more sizes of its
  // own — including a 15px that showed up in a live measurement of the Canvas route. A rule scoped
  // to the surface that happened to be under review is a rule the next surface never hears about.
  const roots = [import.meta.dirname, join(import.meta.dirname, "../shell")];
  const files = roots.flatMap((root) =>
    readdirSync(root)
      .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
      .map((name) => join(root, name)),
  );
  const offenders: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      const stripped = line.replace(/\/\/.*$/, "");
      // `text-[…]` carrying a bare length. The scale tokens carry a `length:` hint and a token
      // name, which this does not match, and neither do colour utilities.
      // 🔴 NO WILDCARD CLASS NAME IN THIS COMMENT. Tailwind scans .ts files too, and a literal
      // utility written with a `*` in prose was emitted as a real rule and broke the CSS build.
      const bad = /text-\[(\d|\.)[^\]]*(rem|px|em)\]/.exec(stripped);
      if (bad) {
        // The marker may sit on this line or in the comment block immediately above it.
        const window = lines.slice(Math.max(0, index - 12), index + 1).join("\n");
        if (!EXEMPT.test(window)) offenders.push(`${file.split("/").slice(-2).join("/")}:${index + 1} ${bad[0]}`);
      }

      // 🔴 AND THE `length:` HINT IS NOT OPTIONAL — THIS SHIPPED BROKEN ONCE AND LOOKED FINE.
      // In Tailwind, `text-[var(--x)]` is a COLOR utility: the whole scale was emitted as
      // `color: var(--canvas-text-body)` and not one font size changed. The failure is silent in
      // source review (the class names read correctly) and only showed up because the CSS build
      // choked on an unrelated line. `text-[length:var(--x)]` is what makes it a font size.
      // Tailwind's own named steps are a second scale hiding in plain sight: `text-xs` is 13.5px
      // here and `text-sm` 15.75px, neither of which is on ours.
      const named = /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/.exec(stripped);
      if (named) {
        offenders.push(`${file.split("/").slice(-2).join("/")}:${index + 1} ${named[0]} is Tailwind's scale, not ours`);
      }

      const unhinted = /text-\[var\(--canvas-text-/.exec(stripped);
      if (unhinted) {
        offenders.push(
          `${file.split("/").slice(-2).join("/")}:${index + 1} ${unhinted[0]}…] is missing the \`length:\` hint — Tailwind reads this as a COLOR, so the size silently does not apply`,
        );
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a font size outside the scale is back on the Canvas (§46.3). Use one of the five canvas text tokens with a length hint:\n  ${offenders.join("\n  ")}`,
  );
});

test("🔴 §46.1: the Canvas swap is opacity only, and it is keyed so it cannot strobe", () => {
  // §46.1 asks for calm, continuous, cognitively smooth updates: "Use subtle fades ... Avoid abrupt
  // replacement of large regions; strong slides; bounce; scale animations; flashy transitions."
  // Someone drilling fifty facts crosses this boundary fifty times, so anything that moves becomes
  // the dominant impression of the surface.
  const view = read("canvas-policy-view.tsx");
  assert.match(
    view,
    /key=\{screenKey\(runtime\)\}/,
    "the swap stopped being keyed on the screen's identity — an unkeyed fade re-runs on every render and strobes the question while the learner is reading it",
  );
  const css = readFileSync(join(import.meta.dirname, "../../../app/globals.css"), "utf8");
  const rule = /@keyframes canvas-swap-in \{([^}]*\}[^}]*)\}/.exec(css);
  const frames = rule?.[1];
  assert.ok(frames, "the canvas swap animation is gone");
  assert.equal(
    /transform|scale|translate|rotate/.test(frames),
    false,
    `the swap animates geometry, not just opacity (§46.1 bans slides, scale and bounce): ${frames}`,
  );
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]{0,400}\.canvas-swap/,
    "the swap is no longer disabled under prefers-reduced-motion");
});

test("🔴 §46.4: a nav icon is the same size collapsed and expanded", () => {
  // 🔴 THE LEARNER SPOTTED THIS BEFORE ANY TEST DID (owner, 2026-08-14: "there is a difference in
  // size for icons when sidebar is collapsed and not collapsed"). The rail drew its glyphs at
  // 20px; the expanded sidebar drew the SAME glyphs at `1em` inside a `size-4` box. A codicon is
  // a FONT, so `1em` resolved against the row's `--canvas-text-small` — 14px. Collapsing the
  // sidebar moved every icon by six pixels.
  //
  // 🔴 THE PROPERTY IS "ONE SOURCE", NOT "THE NUMBER 20 APPEARS TWICE". Two files each hard-coding
  // 20 would satisfy a spelling check and drift again the first time one of them was tuned, which
  // is exactly how they drifted in the first place. So both must READ the shared constant.
  const rail = read("../shell/nav-rail.tsx");
  const sidebar = read("../shell/chat-sidebar.tsx");

  for (const [name, source] of [["nav-rail", rail], ["chat-sidebar", sidebar]] as const) {
    assert.ok(
      /NAV_ICON_PX/.test(source),
      `${name} does not use the shared nav icon size — the two sidebar states can drift again`,
    );
  }

  // 🔴 AND `em` MUST NOT COME BACK ON A NAV ICON. Tying a glyph to the label beside it turns any
  // future change to the type scale into a silent change to every icon in the product.
  const navIcon = /<Codicon[^>]*name=\{item\.codicon\}[^>]*\/>/s;
  for (const [name, source] of [["nav-rail", rail], ["chat-sidebar", sidebar]] as const) {
    const match = navIcon.exec(source);
    assert.ok(match, `${name}: could not find the nav icon to check`);
    assert.equal(
      /size=["{]`?1?em/.test(match[0]),
      false,
      `${name}: the nav icon is sized in em again, so it tracks the label's font rather than the icon scale`,
    );
  }

  // The constant itself is declared once, with a number, in the file both import from.
  const shared = read("../../../lib/workspace/sidebar-nav.ts");
  assert.match(shared, /export const NAV_ICON_PX = \d+;/, "the shared nav icon size is gone");
});
