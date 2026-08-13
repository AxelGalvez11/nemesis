import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { THINKING_COPY, THINKING_VISIBLE_AFTER_MS, type ThinkingPhase } from "@/lib/learn/thinking-phases";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

/** Source with comments removed.
 *
 *  🔴 EVERY FORBIDDEN-SUBSTRING GUARD IN THIS FILE NEEDS THIS, and the ones that predate it say so
 *  individually. A file that documents why a spinner is wrong necessarily contains the word
 *  "spinner"; scanning the raw text makes the explanation the violation, and the obvious way to go
 *  green is to delete the explanation. Shared here so the next guard inherits the fix instead of
 *  rediscovering it. */
const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

// ── if animation implies information, the information must be real ──────────

test("🔴 every thinking phase is EMITTED by something that actually runs", async () => {
  // The rule the microphone waveform established: those bars move because a real amplitude changed,
  // and a canned loop would look identical while the mic was dead. A caption naming a step nothing
  // performs is the same defect in text — and it is invisible, because a plausible sequence of
  // stages is exactly what a working system looks like.
  const emitters = [
    await read("../../../lib/learn/canvas-knowledge.ts"),
    await read("./use-policy-runtime.ts"),
  ].join("\n");

  for (const phase of Object.keys(THINKING_COPY) as ThinkingPhase[]) {
    assert.ok(
      emitters.includes(`"${phase}"`),
      `"${phase}" has copy but nothing emits it — it would describe work that never happens`,
    );
  }
});

test("🔴 no phase is advanced by a clock", async () => {
  // The tempting shortcut is a timer walking the list so the caption always looks busy. It would
  // survive every test that checks the strings, and it would confidently narrate stages that had
  // already finished or never started.
  const view = await read("./canvas-thinking.tsx");
  for (const forbidden of ["setInterval", "setTimeout", "requestAnimationFrame"]) {
    assert.equal(view.includes(forbidden), false, `${forbidden} would make the caption a simulation`);
  }
});

test("a fast step says nothing at all", async () => {
  // Not "shows a brief spinner" — shows nothing. Below the threshold the surface stays still, which
  // is what instant is made of.
  assert.ok(THINKING_VISIBLE_AFTER_MS >= 400, "too eager: fast work would flash a loading state");
  const hook = await read("./use-delayed-flag.ts");
  assert.match(hook, /setShown\(false\)/, "the flag must clear immediately when work ends");
});

// ── associative recall: almost no motion ────────────────────────────────────

test("🔴 the swap between items is opacity ONLY, and short", async () => {
  // Someone drilling fifty facts crosses this boundary fifty times. A slide or a scale becomes the
  // dominant impression of the surface and turns retrieval into an interface being waited on.
  const css = await read("../../../app/globals.css");
  const block = css.slice(css.indexOf("@keyframes canvas-swap-in"), css.indexOf(".canvas-swap {") + 200);
  assert.match(block, /opacity/);
  for (const forbidden of ["transform", "translate", "scale", "rotate"]) {
    assert.equal(block.includes(forbidden), false, `the item swap grew a ${forbidden}`);
  }
  const duration = /\.canvas-swap \{ animation: canvas-swap-in (\d+)ms/.exec(css)?.[1];
  assert.ok(duration, "the swap duration is no longer declarative");
  assert.ok(Number(duration) >= 120 && Number(duration) <= 180, `${duration}ms is outside 120–180ms`);
});

test("🔴 the retrieval screen has no scrim, skeleton or pulse", async () => {
  const view = await read("./canvas-policy-view.tsx");
  const from = view.indexOf('decision.action.type === "retrieve"');
  const to = view.indexOf("if (decision.action.type ===", from + 10);
  const branch = view.slice(from, to);
  for (const forbidden of ["animate-pulse", "skeleton", "inset-0", "backdrop", "opacity-70", "/70"]) {
    assert.equal(branch.includes(forbidden), false, `the retrieval screen grew ${forbidden}`);
  }
});

test("🔴 the whole-page scrim can never paint while the policy is contributing", async () => {
  // It is the thing the ambient thinking state replaces: greying the document destroys the context
  // the learner is holding, and it has to be rebuilt when the overlay clears.
  //
  // 🔴 THE PROPERTY IS UNCHANGED; WHAT ENFORCES IT MOVED. Before step 7b the scrim sat inside the
  // legacy arm of `{policyOwns ? … : …}`, so "it cannot paint over the policy" was true by POSITION
  // and this asserted the position. Composition removed the arms — a document and a hosted task now
  // share one surface — so the scrim needs an explicit guard. Under composition it matters MORE, not
  // less: it would grey out the question being answered AND the document being answered from.
  const canvas = await read("./learning-canvas.tsx");
  const scrim = canvas.indexOf("bg-(--ui-bg-editor)/70");
  assert.notEqual(scrim, -1, "the legacy scrim moved — re-point this guard");
  const guard = canvas.lastIndexOf("{!regions.policy &&", scrim);
  assert.notEqual(guard, -1, "the scrim is no longer guarded against the policy's region");
  // 🔴 CALIBRATED BY DELETING THE GUARD, which is the realistic regression — a later edit moves the
  // overlay out and nothing complains. Nothing may open another JSX expression between the guard and
  // the scrim: that would make the scrim a sibling the guard never covered.
  assert.equal(canvas.slice(guard + 1, scrim).includes("{"), false, "the scrim escaped its guard");
});

// ── the glyphs that stayed have to actually move ────────────────────────────

test("🔴 every retained loading glyph spins", async () => {
  // Without the modifier a codicon-loading renders a static broken circle. It sat perfectly still
  // through every wait, reading as decoration or as a rendering fault rather than as activity.
  for (const file of [
    "./canvas-composer.tsx",
    // Was `canvas-stages.tsx`, deleted with the six-stage machine; then `canvas-empty.tsx`, which
    // inherited its loading glyph; now `canvas-thinking-preview.tsx`, which replaces BOTH of that
    // component's waits with forming lines. The property outlives the component every time, so the
    // check follows it rather than retiring — and it still has teeth here, because the preview is
    // exactly the file where someone would reach for a spinner next.
    "./canvas-thinking-preview.tsx",
    "./canvas-selection-menu.tsx",
    "./canvas-policy-view.tsx",
    "./learning-canvas.tsx",
  ]) {
    const source = await read(file);
    for (const line of source.split("\n")) {
      if (!line.includes('name="loading"') && !line.includes('"loading" :')) continue;
      assert.match(line.trim(), /spinning/, `a frozen loading glyph in ${file}`);
    }
  }
});

// ── reduced motion, including the utilities ─────────────────────────────────

test("🔴 reduced motion covers the Tailwind utilities too, not just hand-written CSS", async () => {
  // The gap that gets missed every time: `.fade` and friends were guarded, `animate-pulse` was not,
  // so a scoped paragraph kept breathing for someone who had asked the whole system to stop moving.
  const css = await read("../../../app/globals.css");
  const guards = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  for (const covered of [".canvas-swap", ".canvas-phrase", "animate-pulse"]) {
    assert.ok(guards.includes(covered), `${covered} still animates under reduced motion`);
  }
});

test("the composer's height transition is height-only and drops under reduced motion", async () => {
  // `transition-all` would animate colour and opacity on every keystroke and make typing syrupy.
  const composer = await read("./canvas-composer.tsx");
  assert.match(composer, /transition-\[height\]/);
  assert.match(composer, /motion-reduce:transition-none/);
  // 🔴 COMMENTS STRIPPED FIRST. The first version of this scanned the raw file and failed on the
  // comment that explains why `transition-all` is wrong — a guard tripped by its own documentation
  // teaches people to delete the documentation.
  const code = composer
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.equal(code.includes("transition-all"), false, "the composer must not animate everything");
});

// ── processing is a thinking preview, not a wait (UX brief §5, §20, §21) ────

test("🔴 the processing state contains NOTHING from §5's forbidden list", async () => {
  // §5 rules these out by name — "no large grey upload box, no centred spinner on an empty
  // screen, no progress bar without real progress, no fake percentage, no large loading
  // headline". Each one is individually reasonable and that is the problem: they arrive one at a
  // time, each looking like an improvement on a blank screen.
  // 🔴 COMMENTS STRIPPED FIRST — the same fix the composer's transition guard below already
  // carries, and it was needed here for the identical reason. This file's header explains what it
  // replaced ("a large dashed upload box with a spinning glyph in it"), so the raw-source version
  // of this check failed on its own documentation. A guard tripped by the prose explaining WHY the
  // rule exists teaches the next person to delete the prose.
  const view = code(await read("./canvas-thinking-preview.tsx"));
  for (const forbidden of ["spinning", 'name="loading"', "progress", "animate-spin", "<h1", "<h2"]) {
    assert.equal(view.includes(forbidden), false, `the thinking preview grew ${forbidden}`);
  }
});

test("🔴 no clock walks the caption — the label is the step that is RUNNING", async () => {
  // The same rule `CanvasThinking` carries, and it matters more here: this surface is shown for
  // several seconds during ingestion, which is exactly long enough for a canned sequence of
  // "Reading the material → Mapping the concepts → Preparing your first question" to look
  // completely convincing while describing work that has already finished or never started.
  const view = await read("./canvas-thinking-preview.tsx");
  for (const forbidden of ["setInterval", "setTimeout", "requestAnimationFrame", "useState", "useEffect"]) {
    assert.equal(view.includes(forbidden), false, `${forbidden} would make the caption a simulation`);
  }
});

test("🔴 the sweep travels LEFT TO RIGHT and stops under reduced motion", async () => {
  // §20 asks for one motion system across Nemesis — "information forming from left to right" —
  // and §5 requires the preview to honour prefers-reduced-motion. Both live in CSS, so both are
  // asserted there rather than in the component that names the class.
  const css = await read("../../../app/globals.css");
  assert.match(css, /@keyframes canvas-forming/, "the forming animation is gone");
  const guards = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  // 🔴 THE SELECTOR LIST OF THE `animation: none` RULE, NOT THE BLOCK. Calibrated by deleting
  // `.canvas-forming,` from that list — and the first version of this check STAYED GREEN, because
  // the class is still mentioned two lines further down in the `background-image: none` rule. A
  // substring search over the whole media query cannot tell "the sweep is stopped" from "the class
  // is named somewhere nearby", which is precisely the regression it exists to catch.
  // Everything between the media query's own `{` and the `{` of the rule that switches animation
  // off — i.e. exactly that rule's selector list, and nothing else in the block.
  const stopsAnimation = guards.indexOf("animation: none");
  assert.notEqual(stopsAnimation, -1, "the reduced-motion block no longer turns any animation off");
  const selectors = guards.slice(guards.indexOf("{") + 1, guards.lastIndexOf("{", stopsAnimation));
  assert.ok(selectors.includes(".canvas-forming"), ".canvas-forming still animates under reduced motion");
  // 🔴 THE LINES MUST NOT DISAPPEAR, ONLY STOP. Someone who asked the system to stop moving still
  // has to be able to see that the region is busy — the same rule `animate-pulse` follows two
  // lines below it, where the opacity is held rather than the element hidden.
  assert.match(guards, /\.canvas-forming \{ background-image: none; \}/);
  assert.equal(guards.includes(".canvas-forming { display: none"), false);
});

test("🔴 neither deleted pre-content screen can come back (§1)", async () => {
  // §1 deletes the large centred "What do you want to learn?" screen, the separate drop-zone, and
  // the "1 source attached → Help me learn this" holding screen. They were one component and one
  // local function; both are gone, and this is the check that keeps them gone — the realistic
  // regression is someone reintroducing one because a single state "needs a screen".
  const canvas = await read("./learning-canvas.tsx");
  const code = canvas
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  for (const gone of ["Help me learn this", "What do you want to learn", "<CanvasEmpty", "function SourcesAttached"]) {
    assert.equal(code.includes(gone), false, `${gone} is back — §1 deleted it, and the composer is the entry point now`);
  }
});

test("§11 — a passage being rewritten forms left to right, it does not throb", async () => {
  const document_ = await read("./canvas-document.tsx");
  // 🔴 THE SPECIFIC REGRESSION: `busy && "animate-pulse"`. A whole-element opacity throb is a WAIT
  // signal; §20 asks for one motion system, "information forming from left to right", and a
  // paragraph being rewritten is information being formed. The band is shared with the thinking
  // preview so the two read as one system rather than two effects.
  assert.match(document_, /busy && "canvas-rewriting"/);
  assert.ok(
    !/busy && "animate-pulse"/.test(document_),
    "a rewriting passage must not fall back to the pulse it replaced",
  );

  const css = await read("../../../app/globals.css");
  assert.match(css, /@keyframes canvas-rewriting \{ from \{ background-position: 200% 0; \}/);
  // 🔴 NO FILL, WHICH IS THE DIFFERENCE FROM `.canvas-forming`. That class paints a solid bar
  // because it stands in for text that does not exist yet. §11's text is on screen and being read,
  // so the band travels BEHIND the words rather than covering them.
  const rule = /\.canvas-rewriting \{([\s\S]*?)\}/.exec(css);
  assert.ok(rule?.[1], "expected the .canvas-rewriting rule");
  assert.ok(!/background-color/.test(rule[1]), "the existing passage must stay legible while it rewrites");

  // Reduced motion: the sweep stops, the state stays visible. Someone who asked the system to stop
  // moving still has to be able to see which paragraph is busy.
  const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
  assert.match(reduced, /\.canvas-rewriting,/, "the new animation must be listed in the reduced-motion block");
  assert.match(reduced, /\.canvas-rewriting \{ background-image: none; \}/);
});

test("§11 — the way back to the original is drawn at rest, and only where the learner rewrote something", async () => {
  const document_ = await read("./canvas-document.tsx");
  // Located by its own label rather than by a shape, so the guard cannot quietly start reading a
  // different button — which is exactly what it did on the first run, and it reported the OTHER
  // button's `opacity-0` as this one's defect.
  const label = document_.indexOf("Show how this was written");
  assert.ok(label > 0, "expected the restore control");
  const open = document_.lastIndexOf("<button", label);
  // 🔴 AND THE CODE, NOT THE COMMENT — the second way this same guard misread itself. The control
  // carries a note explaining that it must NOT be `opacity-0`, and reading raw source found that
  // phrase and reported it as the defect. A guard that fails on the sentence documenting the rule
  // gets "fixed" by deleting the explanation.
  const control = [
    document_
      .slice(open, document_.indexOf("</button>", label))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1"),
  ];
  // 🔴 THE SAME RULE #578 SPENT A SECTION ON, APPLIED TO MY OWN CODE. I wrote this with
  // `opacity-0 group-hover:opacity-100` first — the exact spelling that left 62 of 62 Library row
  // controls invisible at rest and absent entirely on a touch screen. Restraint here is the colour
  // and the size, never the visibility.
  const markup = control[0] ?? "";
  assert.ok(markup.length > 0, "expected markup for the restore control");
  assert.ok(!/opacity-0/.test(markup), "the restore control must not be invisible until hover");
  assert.ok(!/group-hover:opacity/.test(markup), "hover cannot be the only thing that draws it");
  assert.match(markup, /text-\(--ui-text-quaternary\)/, "quiet, though (§19)");

  // Only on blocks the LEARNER rewrote. The teaching loop replaces blocks through the same op, and
  // offering an undo for a change nobody asked for is worse than offering none.
  assert.match(document_, /!busy && isRewritten\(block\)/);
});
