import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { THINKING_COPY, THINKING_VISIBLE_AFTER_MS, type ThinkingPhase } from "@/lib/learn/thinking-phases";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

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

test("🔴 the whole-page scrim can never paint while the policy owns the canvas", async () => {
  // It is the thing the ambient thinking state replaces: greying the document destroys the context
  // the learner is holding, and it has to be rebuilt when the overlay clears.
  const canvas = await read("./learning-canvas.tsx");
  const scrim = canvas.indexOf("bg-(--ui-bg-editor)/70");
  assert.notEqual(scrim, -1, "the legacy scrim moved — re-point this guard");
  const branchOpens = canvas.indexOf("{policyOwns ? (");
  const branchCloses = canvas.indexOf("</>\n        )}", branchOpens);
  assert.ok(scrim > branchOpens && scrim < branchCloses, "the scrim escaped the legacy arm");
});

// ── the glyphs that stayed have to actually move ────────────────────────────

test("🔴 every retained loading glyph spins", async () => {
  // Without the modifier a codicon-loading renders a static broken circle. It sat perfectly still
  // through every wait, reading as decoration or as a rendering fault rather than as activity.
  for (const file of [
    "./canvas-composer.tsx",
    "./canvas-stages.tsx",
    "./canvas-selection-menu.tsx",
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
