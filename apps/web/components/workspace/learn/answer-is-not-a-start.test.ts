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

async function render(intent: ComposerIntent, pendingSources: readonly { id: string; title: string }[] = []) {
  const { CanvasComposer } = await import("./canvas-composer");
  return renderToStaticMarkup(
    createElement(CanvasComposer, {
      busy: false,
      intent,
      onAnswer: noop,
      onAsk: noop,
      onClearSelection: noop,
      onFiles: noop,
      onStart: noop,
      pendingSources,
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

test("🔴🔴 attached material does NOT show start chips while a question is being asked", async () => {
  // This is the whole defect at the level the learner could have seen it. `pendingSources` used to
  // be gated by the caller (`preContent ? canvas.sources… : []`) — a SECOND reading of the same
  // stale predicate — so the surface said "nothing has started yet" while asking a question.
  const html = await render({ kind: "answer", sink: "policy", task: TASK }, [{ id: "s1", title: "Pharmacokinetics.pdf" }]);
  assert.ok(!html.includes("Pharmacokinetics.pdf"), "a started canvas is still advertising itself as unstarted");
});

test("a START intent shows the material and says sending is enough", async () => {
  const html = await render({ kind: "start" }, [{ id: "s1", title: "Pharmacokinetics.pdf" }]);
  assert.ok(html.includes("Pharmacokinetics.pdf"), "§2/§26: the attachment preview must be visible before send");
  assert.ok(html.includes(START_WITH_MATERIAL_PLACEHOLDER.slice(0, 20)), "§3: sending with nothing typed must read as an option");
});

test("an ASK intent is an ordinary composer, chips or no chips", async () => {
  const html = await render({ kind: "ask" }, [{ id: "s1", title: "Pharmacokinetics.pdf" }]);
  assert.ok(!html.includes("Pharmacokinetics.pdf"));
  assert.ok(html.includes("Ask Nemesis"), "the ask placeholder is missing");
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
