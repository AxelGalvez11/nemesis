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
//   1. it gets a name             from the first NAMEABLE exchange, one model call at a time
//   2. it never takes one over    a non-blank title is never eligible, checked twice
//   3. it stops                   the first accepted name ends it; a refused greeting is retired
//                                 and the walk moves on; a FAILED call stays eligible (2026-08-31)
//
// 🔴 THE MODEL CALL IS EXECUTED, NOT ASSERTED ABOUT. `nameCanvasFromExchange` takes its completion
// function as an argument for exactly this reason. A guard that only matched source text would have
// let the whole decision path rot behind a green tick, which is the failure this team has already
// paid for once.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canvasNeedsName, firstExchange, firstUntriedExchange, namingMessages, nameCanvasFromExchange, readCanvasName } from "./canvas-naming";
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

test("🔴 the prompt names a greeting instead of refusing it, and 'none' stays a guarded word", () => {
  // Owner reversal, 2026-08-31: ChatGPT names a bare "hi" ("Greeting exchange" sits in his own
  // list), so the refusal channel left the prompt and a greeting is named for what it is.
  const source = namingMessages({ asked: "hi", replied: "" })[0]!.content;
  assert.ok(!/reply with exactly/.test(source), "the none channel is back in the prompt");
  assert.match(source, /greeted you or made small talk/, "the prompt no longer says what to call a greeting");
  // Belt: a model that remembers the old contract and says "none" anyway is read as a refusal,
  // never as a name - and the walk then moves on exactly as it does for a garbage shape.
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
  const out = await nameCanvasFromExchange("u1", { asked: "How does a heat pump move heat?", replied: "By compressing a refrigerant." }, async (messages) => {
    seen = messages[1]!.content;
    return "How a heat pump moves heat";
  });
  assert.deepEqual(out, { kind: "named", name: "How a heat pump moves heat" });
  assert.match(seen ?? "", /How does a heat pump move heat\?/, "the namer never saw the exchange");
});

test("🔴🔴 failed and refused are DIFFERENT outcomes, because they deserve different futures", async () => {
  // Refused: the model read it and said no (a greeting). Asking again about the same exchange is
  // waste, so the caller retires it. Failed: the answer never arrived; the exchange is still
  // perfectly nameable and stays eligible. The old single "" wore both faces, which is how one
  // dropped call - measured in production, 2026-08-31 - left a canvas untitled for life.
  const thrown = await nameCanvasFromExchange("u1", { asked: "a", replied: "b" }, async () => { throw new Error("network"); });
  assert.deepEqual(thrown, { kind: "failed" });
  assert.deepEqual(await nameCanvasFromExchange("u1", { asked: "a", replied: "b" }, async () => null), { kind: "failed" });
  assert.deepEqual(await nameCanvasFromExchange("u1", { asked: "hi", replied: "Hello!" }, async () => "none"), { kind: "refused" });
  // An answer with an unusable shape is a refusal too: the model spoke, the words were not a name,
  // and the same input will produce the same essay.
  assert.deepEqual(await nameCanvasFromExchange("u1", { asked: "a", replied: "b" }, async () => "This conversation appears to be about several things at once, so I would summarise it as follows in a sentence."), { kind: "refused" });
});

test("🔴🔴 the walk moves past a refused greeting to the first nameable exchange", () => {
  // Production, 2026-08-31: four canvases opened with "hi", grew real conversations, and could
  // never be named because the namer re-read the greeting for ever. The refusal worked; the walk
  // did not move.
  const moments = [
    { id: "m0", kind: "assistant", occurredAt: "t0", userText: "hi", assistantText: "Hello!" },
    { id: "m1", kind: "response", occurredAt: "t1" },
    { id: "m2", kind: "assistant", occurredAt: "t2", userText: "walk me through osmosis", assistantText: "Water moves across a membrane." },
  ] as never;
  assert.equal(firstUntriedExchange(moments, new Set())?.key, "m0", "the earliest exchange no longer goes first");
  const after = firstUntriedExchange(moments, new Set(["m0"]));
  assert.equal(after?.key, "m2", "a retired greeting still pins the walk");
  assert.equal(after?.exchange.asked, "walk me through osmosis");
  assert.equal(firstUntriedExchange(moments, new Set(["m0", "m2"])), null, "an exhausted canvas keeps asking");
});

// ------------------------------------------------------------------ the wiring

test("🔴🔴 the session names the canvas, re-checks before it writes, and writes THROUGH", () => {
  // A model call is a second or two long. A title typed or a document attached in that window has
  // already named the canvas by the time the answer lands, so the test and the write are one
  // atomic step against the freshest state React holds.
  assert.match(SESSION, /firstUntriedExchange\(current\.moments, naming\.current\.tried\)/, "nothing reads the conversation");
  assert.match(
    SESSION,
    /update\(\(current\) => \(canvasNeedsName\(current\) \? \{ \.\.\.current, title: outcome\.name \} : current\)\)/,
    "🔴 the name is written without re-checking, so it can overwrite one that arrived while the model thought",
  );
  // 🔴 AND SAVED NOW, NOT ON THE DEBOUNCE. The name lands seconds after the answer, which is when
  // a quick session gets closed; production carried canvases whose whole life fit inside that
  // window.
  assert.match(SESSION, /void saveCanvas\(uid, \{ \.\.\.latest\.current, title: outcome\.name \}\)/, "the fresh name waits for the debounce it can miss");
});

test("🔴🔴 a refusal retires the exchange, a failure leaves it eligible, and a name ends it", () => {
  assert.match(SESSION, /if \(outcome\.kind === "failed"\) return;/, "a dropped call now retires a nameable exchange for ever again");
  assert.match(SESSION, /state\.tried\.add\(key\);\s*\n\s*if \(outcome\.kind === "refused"\) return;/, "a refused greeting is not retired, so the walk pins to it");
  assert.match(SESSION, /if \(state\.busy \|\| state\.tried\.has\(key\)\) return;/, "naming calls can stack or repeat");
  // 🔴 STILL NEVER FROM THE NEWEST TURN. Naming from the latest exchange renames the canvas as the
  // conversation moves - the bug this shape has always existed to prevent.
  assert.equal(
    /lastThingSaid\([^)]*\)[\s\S]{0,200}nameCanvasFromExchange/.test(SESSION),
    false,
    "🔴 the canvas is being named from the latest turn again, so its name follows the conversation",
  );
});

test("🔴 the name starts at send, so the title usually beats the answer to the save", () => {
  // 🔴 `said &&` since 2026-09-03: a send with files and no words is a turn now, and an empty
  // opener has nothing to name from; the with-reply try that follows still names it.
  assert.match(SESSION, /if \(said && canvasNeedsName\(latest\.current\)\) void tryNameRef\.current\(`ask:\$\{said\}`, \{ asked: said, replied: "" \}\);/, "the send-time head start is gone; naming waits for the reply again");
});
