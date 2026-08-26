// A canvas is called what its conversation is about, and it stops changing once it is.
//
// 🔴🔴 OWNER, 2026-08-26: *"the canvas doesn't rename itself properly. based on the chat's
// content."* Verified before writing a line: it did not rename itself AT ALL from a conversation.
// `renameCanvas` has two callers and both are a person typing; the only automatic namer was
// `mergeSourceIntoCanvas`, which can only see an attached document. A canvas that was only ever a
// conversation stayed blank for ever.
//
// Three properties are held here, and the second and third matter more than the first:
//
//   1. it gets a name             from the first exchange, through one model call
//   2. it never takes one over    a non-blank title is never eligible, checked twice
//   3. it stops                   the first exchange names it; later turns are not consulted
//
// 🔴 THE MODEL CALL IS EXECUTED, NOT ASSERTED ABOUT. `nameCanvasFromExchange` takes its completion
// function as an argument for exactly this reason. A guard that only matched source text would have
// let the whole decision path rot behind a green tick, which is the failure this team has already
// paid for once.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canvasNeedsName, firstExchange, namingMessages, nameCanvasFromExchange, readCanvasName } from "./canvas-naming";
import { emptyCanvas, type CanvasSource } from "./canvas-model";
import { mergeSourceIntoCanvas } from "./canvas-store";
import type { CanvasMoment } from "./canvas-moment";

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SESSION = strip(readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8"));

const NOW = "2026-08-26T00:00:00.000Z";
const moment = (kind: CanvasMoment["kind"], userText?: string, assistantText?: string): CanvasMoment => ({
  id: `m${Math.random()}`,
  kind,
  occurredAt: NOW,
  ...(userText ? { userText } : {}),
  ...(assistantText ? { assistantText } : {}),
});

// ------------------------------------------------------------------ eligibility

test("🔴🔴 a name somebody typed is never eligible, and blank is the whole test", () => {
  // `renameCanvas` refuses an empty name (*"An empty name is a cancelled rename"*), so a title a
  // person typed cannot be blank. That is what makes "blank" a sufficient test for "unnamed" and
  // makes a second `titleSource` field unnecessary: it would be a copy of a fact the title carries.
  assert.equal(canvasNeedsName({ title: "" }), true);
  assert.equal(canvasNeedsName({ title: "   " }), true, "whitespace is not a name");
  assert.equal(canvasNeedsName({ title: "Week 4 revision" }), false);
  assert.equal(canvasNeedsName({ title: "Lecture.pdf" }), false, "a document's own title is a name too");
});

test("🔴🔴 #870 still wins: a document names the canvas, and the conversation does not take it back", () => {
  // PR #870 ("a document is named by its title") is a deliberate rule and this must not undo it.
  // Whoever names the canvas first wins, and that is now one rule covering three namers.
  const source: CanvasSource = { excerpts: [], id: "s1", kind: "pdf", title: "Tolerance stack analysis" };
  const named = mergeSourceIntoCanvas(emptyCanvas("c1", NOW), source);
  assert.equal(named.title, "Tolerance stack analysis");
  assert.equal(canvasNeedsName(named), false, "🔴 a conversation would rename a canvas its document already named");
});

// ------------------------------------------------------------------ which exchange

test("🔴 the FIRST exchange names it, not the newest, so the name settles and stops", () => {
  // A name that kept up with the conversation would rename the sidebar row under the learner's
  // cursor. That is a worse bug than a canvas called "New canvas".
  const moments = [
    moment("assistant", "How is a beam's deflection worked out?", "Start from the bending moment."),
    moment("assistant", "And under a distributed load?", "Integrate it along the span."),
  ];
  assert.deepEqual(firstExchange(moments), {
    asked: "How is a beam's deflection worked out?",
    replied: "Start from the bending moment.",
  });
});

test("🔴 a turn that answered by DOING still names the canvas", () => {
  // A `study` turn starts a lesson instead of speaking, so it records the ask with no reply.
  // Refusing to name from it would leave every canvas that opens with a lesson unnamed.
  assert.deepEqual(firstExchange([moment("user", "Teach me the law of the sea")]), {
    asked: "Teach me the law of the sea",
    replied: "",
  });
});

test("🔴🔴 a learner's ANSWER to a question can never name the canvas", () => {
  // A `response` moment is a demonstration. Naming the canvas after one would put somebody's attempt
  // at an answer in the sidebar, permanently, where they and anyone they share a screen with read it.
  assert.equal(firstExchange([moment("response", "I think it's the sodium one")]), null);
  assert.equal(firstExchange([moment("correction", "Not quite")]), null);
  assert.equal(firstExchange([]), null, "an empty canvas has nothing to be named after");
});

// ------------------------------------------------------------------ reading the answer

test("a plain answer becomes the name", () => {
  assert.equal(readCanvasName("Promissory estoppel in contract law"), "Promissory estoppel in contract law");
  assert.equal(readCanvasName('  "Bearing preload"  '), "Bearing preload", "quotes a model wrapped it in");
  assert.equal(readCanvasName("```\nTriage in mass casualty\n```"), "Triage in mass casualty", "a fenced answer");
  assert.equal(readCanvasName("Baroque counterpoint."), "Baroque counterpoint", "a trailing full stop");
});

test("🔴 a refusal leaves the canvas unnamed, which is a real outcome", () => {
  // "hey" is a real first message. A model with no way to decline invents a name for it, and
  // "New canvas" is honest about a canvas that has not said what it is about yet.
  assert.equal(readCanvasName("none"), "");
  assert.equal(readCanvasName("None."), "");
  assert.equal(readCanvasName(""), "");
  assert.equal(readCanvasName(null), "");
});

test("🔴🔴 an answer that is not shaped like a title is REFUSED, never truncated", () => {
  // Truncating produces a fragment that reads like a title while saying nothing, and it then sits in
  // the sidebar for the life of the canvas. #870's own note makes this argument about a document's
  // first paragraph; it applies harder to a namer that was asked for six words.
  const sentence =
    "The conversation is about how a court decides whether a promise made without consideration can still be enforced against the person who made it";
  assert.equal(readCanvasName(sentence), "");
  assert.equal(readCanvasName("| Class | Generic | Indications |"), "", "a row of cells is not a title");
  assert.equal(readCanvasName("-----"), "", "a rule is not a title");
});

// ------------------------------------------------------------------ the prompt

test("🔴🔴🔴 the naming prompt names no subject and no discipline", () => {
  // CLAUDE.md, and the project memory that records the trap by name: *"keyword scoping hides in
  // prompts"* — a prompt can smuggle in a keyword list the code does not have. An "e.g. anatomy,
  // torts, thermodynamics" would steer every canvas in the product toward whichever field was
  // listed first, and no code guard anywhere else would ever see it.
  const prompt = namingMessages({ asked: "x", replied: "y" })
    .map((message) => message.content)
    .join("\n");
  const FIELDS = [
    "anatomy", "biology", "chemistry", "physics", "medicine", "pharmac", "nursing", "law", "legal",
    "engineering", "history", "maths", "mathematics", "economics", "psychology", "computer science",
    "accounting", "architecture", "statute", "molecule", "circuit",
  ];
  for (const field of FIELDS) {
    assert.equal(
      prompt.toLowerCase().includes(field),
      false,
      `🔴 the naming prompt names "${field}", which steers every canvas in the product toward one field`,
    );
  }
});

test("🔴 the naming prompt carries no em dash, which is a standing owner rule", () => {
  const prompt = namingMessages({ asked: "x", replied: "y" })
    .map((message) => message.content)
    .join("\n");
  assert.equal(/[—―]/.test(prompt), false, "the naming prompt started using an em dash");
  assert.match(prompt, /Never use an em dash/, "the rule was dropped from the naming prompt");
});

test("the exchange actually reaches the model, and a long reply is bounded", () => {
  const messages = namingMessages({ asked: "What makes a contract void?", replied: "z".repeat(5000) });
  const body = messages[1]!.content;
  assert.match(body, /They asked: What makes a contract void\?/, "the ask does not reach the namer");
  assert.ok(body.length < 1200, `the namer is being handed ${body.length} characters of reply`);
});

// ------------------------------------------------------------------ the call itself

test("🔴🔴 the whole decision runs, with the model's answer injected", async () => {
  let seen: string | null = null;
  const name = await nameCanvasFromExchange("u1", { asked: "How does a heat pump move heat?", replied: "By compressing a refrigerant." }, async (messages) => {
    seen = messages[1]!.content;
    return "How a heat pump moves heat";
  });
  assert.equal(name, "How a heat pump moves heat");
  assert.match(seen ?? "", /How does a heat pump move heat\?/, "the namer never saw the exchange");
});

test("🔴 a namer that fails leaves the canvas unnamed and says nothing", async () => {
  // This runs unasked, behind a conversation somebody is having. A canvas that could not be named is
  // not something that happened TO them, so it must never reach the error strip mid-lesson.
  const thrown = await nameCanvasFromExchange("u1", { asked: "a", replied: "b" }, async () => {
    throw new Error("network");
  });
  assert.equal(thrown, "");
  assert.equal(await nameCanvasFromExchange("u1", { asked: "a", replied: "b" }, async () => null), "");
});

// ------------------------------------------------------------------ the wiring

test("🔴🔴 the session names the canvas, and re-checks before it writes", () => {
  // A model call is a second or two long. A document attached in that window has already named the
  // canvas by the time the answer lands, so the test and the write have to be one atomic step
  // against the freshest state React holds. Checking only before the call would let this win a race
  // it must always lose.
  assert.match(SESSION, /const exchange = firstExchange\(current\.moments\)/, "nothing reads the conversation");
  assert.match(SESSION, /void nameCanvasFromExchange\(uid, exchange\)/, "no canvas is ever named");
  assert.match(
    SESSION,
    /update\(\(latestCanvas\) => \(canvasNeedsName\(latestCanvas\) \? \{ \.\.\.latestCanvas, title: name \} : latestCanvas\)\)/,
    "🔴 the name is written without re-checking, so it can overwrite one that arrived while the model thought",
  );
});

test("🔴🔴 it fires once per canvas and then stops", () => {
  // A canvas that renamed itself every turn would be its own bug. The ref holds the id it fired for,
  // so a second exchange finds the work already done whether or not the first one produced a name.
  assert.match(SESSION, /const namedRef = useRef<string \| null>\(null\)/, "there is no once-guard");
  assert.match(SESSION, /if \(namedRef\.current === current\.id\) return;/, "the guard stopped being per canvas");
  assert.match(SESSION, /namedRef\.current = current\.id;/, "the guard is never armed, so it fires every turn");
  // 🔴 REVERSED. Naming from the newest exchange is the bug this shape exists to prevent.
  assert.equal(
    /lastThingSaid\([^)]*\)[\s\S]{0,200}nameCanvasFromExchange/.test(SESSION),
    false,
    "🔴 the canvas is being named from the latest turn again, so its name follows the conversation",
  );
});
