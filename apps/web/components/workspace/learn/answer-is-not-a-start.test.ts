import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ASK_PLACEHOLDER, START_WITH_MATERIAL_PLACEHOLDER } from "@/lib/learn/canvas-tasks";
import type { ComposerIntent } from "@/lib/learn/composer-intent";

// 🔴🔴🔴 A TYPED ANSWER WAS ROUTED TO "START THIS CANVAS", AND THAT IS WHAT THIS FILE GUARDS.
//
// The composer decided what a submission meant by asking which handlers it held:
//
//     if (onStart) onStart(value);          // ← `onStart` was non-null on every canvas whose
//     else if (answering) onAnswer(…);      //   stored state had not advanced, which includes
//     else onAsk(value);                    //   every canvas asking a question about attached
//                                           //   material. It silently outranked a real answer.
//
// The composer now switches on ONE value computed by `composerIntent`. These tests exist at two
// levels because neither alone would have caught it: the render tests prove the intent reaches the
// surface the learner sees, and the source guard proves the precedence has not been reordered back.
//
// 🔴 WHAT THEY CANNOT DO IS PRESS THE BUTTON. There is no DOM implementation in this repo's test
// runner (node:test + tsx, no jsdom), so a click cannot be dispatched here. The proof that a press
// lands in the judge is a real browser against the production build — see
// `scripts/typed-answer-acceptance.ts`. Nothing in this file should be read as replacing it.

// 🔴 `globalThis.React` BECAUSE `tsx` COMPILES `.tsx` WITH THE CLASSIC JSX RUNTIME. Next builds
// with the automatic runtime; both produce the same elements, so this is a difference in how the
// test HARNESS compiles, not in what the component does.
(globalThis as unknown as { React: typeof React }).React = React;

const TASK = {
  answered: false,
  id: "prompt-1",
  index: 0,
  kind: "question" as const,
  placeholder: "Type your answer…",
  prompt: "What happens to clearance when hepatic blood flow falls?",
  total: 1,
};

const noop = () => undefined;

async function render(intent: ComposerIntent, attachedCount = 0) {
  const { CanvasComposer } = await import("./canvas-composer");
  return renderToStaticMarkup(
    createElement(CanvasComposer, {
      attachedCount,
      busy: false,
      intent,
      onAnswer: noop,
      onAsk: noop,
      onClarify: noop,
      onClearSelection: noop,
      onFiles: noop,
      onStart: noop,
      selected: [],
    }),
  );
}

// ── The intent reaches the surface ──────────────────────────────────────────

test("🔴 an ANSWER intent puts the task's own placeholder in the composer", async () => {
  const html = await render({ kind: "answer", sink: "policy", task: TASK });
  assert.ok(html.includes("Type your answer"), "the composer is not labelled as the answer surface");
  assert.ok(!html.includes(ASK_PLACEHOLDER), "it still reads as a place to ask questions");
});

test("a START intent with material says that sending is enough on its own", async () => {
  const html = await render({ kind: "start" }, 1);
  assert.ok(html.includes(START_WITH_MATERIAL_PLACEHOLDER.slice(0, 20)), "§3: sending with nothing typed must read as an option");
});

test("an ASK intent is an ordinary composer, material or no material", async () => {
  const html = await render({ kind: "ask" }, 1);
  assert.ok(html.includes("Ask Nemesis"), "the ask placeholder is missing");
});

// 🔴🔴 THE COMPOSER DOES NOT DRAW SOURCES, AT ANY INTENT. Owner, 2026-08-21: *"sources are still
// appearing on the chat composer which i dont want. the sources should appear in the sources."*
//
// The chips were authored as an attachment preview and fed `canvas.sources`, so once a topic with
// no material grounded itself by searching the web, the machine's own reading list appeared over
// the learner's composer as though they had attached it. Measured by the owner: asking to learn a
// language put two marketing pages for a language app in the box.
//
// This asserts on the PROP as well as the markup, because the markup test would go green just as
// well if a future edit passed the list and drew it somewhere the string match happened to miss.
test("🔴🔴 the composer is not given the sources at all, so it cannot draw them", () => {
  assert.ok(
    !/pendingSources/.test(composerSource),
    "the composer takes the source list again, which is all it needs to start drawing chips",
  );
  assert.match(composerSource, /attachedCount\??:? ?(number|=)/, "the composer no longer knows whether material is waiting");
  assert.match(canvasSource, /attachedCount=\{canvas\.sources\.length\}/, "the caller is passing more than a count again");
  assert.ok(!/pendingSources=/.test(canvasSource), "the caller is handing the sources back to the composer");
});

test("🔴 and the Sources panel is still where they are drawn", () => {
  // Removing them from the composer is only correct because there is somewhere honest they DO
  // appear. If this ever stops being true, the fix above becomes a disappearance.
  const controls = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");
  assert.match(controls, /canvas\.sources\.map/, "the Sources panel no longer lists the sources");
  assert.match(controls, /faviconUrl\(host\)/, "the panel stopped showing where a source came from");
});

// ── The precedence has not been reordered back ──────────────────────────────

const composerSource = readFileSync(new URL("./canvas-composer.tsx", import.meta.url), "utf8");
const canvasSource = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");

test("🔴🔴 ANSWER is decided before START, and no route is chosen by handler presence", () => {
  // A source-order guard, and it is here rather than in a click test only because there is no DOM
  // to click in. It is calibrated: restoring `if (onStart) … else if (answering) …` reddens it.
  const submit = composerSource.slice(composerSource.indexOf("const submit = () => {"));
  // 🔴 COMMENTS STRIPPED FIRST. The first draft of this guard matched its own warning about the
  // old code — a guard reading its own prose is the exact hollow shape this repo has shipped before.
  const body = submit
    .slice(0, submit.indexOf("\n  };"))
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const answerAt = body.indexOf('intent.kind === "answer"');
  const startAt = body.indexOf('intent.kind === "start"');
  assert.ok(answerAt > -1 && startAt > -1, "the routing no longer switches on the intent");
  assert.ok(answerAt < startAt, "starting is being tested before answering again — this is the defect");
  assert.ok(
    !/\bif \(onStart\)/.test(body),
    "a route is being chosen by whether a handler was passed, which is what made an answer a start",
  );
});

test("🔴 the caller hands over the start handler unconditionally", () => {
  // `onStart={preContent ? beginOrAnswer : null}` was the other half: presence WAS the signal, so
  // the caller had to withhold the function to withhold the meaning. Meaning lives in the intent now.
  assert.match(canvasSource, /onStart=\{beginOrAnswer\}/, "the start handler is conditional again");
  assert.ok(
    !/onStart=\{preContent/.test(canvasSource),
    "the stale-state predicate is back in the composer's wiring",
  );
  assert.match(canvasSource, /intent=\{intent\}/, "the composer is no longer told what a submission means");
});

// ── A clarification is answerable through the same box ──────────────────────

test("🔴🔴 a pending clarification labels the composer as its answer surface", async () => {
  // The card's buttons are a shortcut for typing the label. The box under them must say so, or the
  // learner reads the options as the only way to respond and the "Other" case never gets used.
  const html = await render({
    kind: "clarify",
    question: {
      id: "course-depth",
      invitesWritten: true,
      options: [
        { description: null, id: "survey", label: "Overview" },
        { description: null, id: "academic", label: "Academic" },
      ],
      prompt: "How deep should this course go?",
    },
  });
  assert.ok(html.includes("Pick one above"), "the composer is not wired to the pending question");
  assert.ok(!html.includes(ASK_PLACEHOLDER), "it still reads as an ordinary question box");
  // 🔴 AND IT IS NOT AN EVIDENCE SURFACE. `answering` drives the answer chrome, and a preference
  // dressed as a cognitive answer is the confusion this whole path exists to avoid.
  assert.ok(!html.includes("Submit answer"), "a preference is being presented as a demonstration");
});

// ── Files the learner just picked are visible before sending ────────────────

test("🔴 a file picked mid-conversation chips on the composer before the next send", async () => {
  // Owner, 2026-08-23, pointing at ChatGPT: "nemesis should also be able to attach attachments to
  // the chat composer like in this image before sending." Attaching worked; it was invisible where
  // the learner was typing. The chips are fed by the PICK, never by canvas.sources — the data
  // source that got the previous chips deleted (2026-08-21: machine-grounded pages chipping as if
  // the learner attached them) cannot reach these.
  const { CanvasComposer } = await import("./canvas-composer");
  const html = renderToStaticMarkup(
    createElement(CanvasComposer, {
      busy: false,
      intent: { kind: "ask" },
      onAnswer: noop,
      onAsk: noop,
      onClarify: noop,
      onClearSelection: noop,
      onFiles: noop,
      onStart: noop,
      recentAttachments: [{ id: "f1", title: "Top_300_Drug_Charts.pdf" }],
      selected: [],
    }),
  );
  assert.ok(html.includes("Top_300_Drug_Charts.pdf"), "the picked file is invisible at the composer");

  const empty = await render({ kind: "ask" });
  assert.ok(!empty.includes("Top_300_Drug_Charts"), "control: chips render with nothing picked");
});

test("🔴 the chips are fed by the pick, not by the canvas — the 2026-08-21 regression stays dead", () => {
  // The deleted chips died of `pendingSources={canvas.sources...}`. Nothing may feed the new row
  // from the canvas's source list.
  assert.ok(
    !/recentAttachments=\{canvas\.sources/.test(canvasSource),
    "the attachment chips are reading canvas.sources again",
  );
  assert.match(
    canvasSource,
    /file\.name/,
    "the chips are no longer built from the picked files themselves",
  );
});
