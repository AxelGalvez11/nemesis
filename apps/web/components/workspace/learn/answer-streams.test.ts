// The typed turn streams: the model's plan lines show while it works, the answer is read as it is
// written, and a row above the answer says how long the turn worked and opens to those lines.
//
// Owner, 2026-09-03: *"the DeepSeek model should not output its own reasoning at all... it should give
// a reasoning preview like every model does nowadays, like the reasoning summary... the shimmering plus
// the reasoning summary."* Before this, a typed turn showed one shimmering word for its whole latency
// and the milestones the model wrote arrived with the answer, too late to be read.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const CHAT = read("./canvas-chat.ts");
const SESSION = read("./use-canvas-session.ts");
const CANVAS = read("./learning-canvas.tsx");
const ROUTER = readFileSync(new URL("../../../lib/learn/turn-router.ts", import.meta.url), "utf8");

test("🔴🔴 every round streams, and the draft watcher reads milestones and prose off the stream", () => {
  assert.match(CHAT, /const draft = draftWatch\(\);/);
  assert.match(CHAT, /onDelta: \(_delta: string, accumulated: string\) => \{\s*if \(watch\) \{/, "streaming is gated on the spoken lane again");
  assert.match(CHAT, /const seen = draft\.feed\(accumulated\);\s*if \(seen\.milestones\) onMilestones\?\.\(seen\.milestones\);\s*if \(seen\.prose\) onDraft\?\.\(seen\.prose\);/);
  // Raw reasoning still has no path to the screen: the stream handler reads `content` only.
  assert.doesNotMatch(CHAT, /onReasoning/, "the turn is capturing raw reasoning");
});

test("🔴🔴 a plain reply keeps its milestones now that they can be shown in time", () => {
  assert.doesNotMatch(ROUTER, /if \(then === "reply" && !searching\) return \[\];/, "plain replies are stripped of their lines again");
  assert.match(ROUTER, /For an answer that draws on the learner's material or takes real composing, write two to four "\s*\+\s*"lines about THEIR material and THIS answer/);
  assert.match(ROUTER, /Give an empty array for a greeting, small talk or a one-line answer\./);
});

test("🔴🔴 the session holds the draft and the finished summary, and clears both at the right moments", () => {
  assert.match(SESSION, /const \[draft, setDraft\] = useState\(""\);/);
  assert.match(SESSION, /const \[lastTurn, setLastTurn\] = useState<\{ lines: readonly string\[\]; seconds: number \} \| null>\(null\);/);
  assert.match(SESSION, /setBusy\(\{ kind: "command", blockIds: \[\], label: "Thinking" \}\);\s*setDraft\(""\);\s*setLastTurn\(null\);\s*shownLines\.current = \[\];\s*turnStartedAt\.current = performance\.now\(\);/);
  assert.match(SESSION, /setLastTurn\(\s*shownLines\.current\.length > 0\s*\? \{ lines: shownLines\.current, seconds: \(performance\.now\(\) - turnStartedAt\.current\) \/ 1000 \}\s*: null,\s*\);/, "a turn that showed nothing leaves a row anyway, or the row lost its lines");
});

test("🔴🔴 the canvas draws the draft in the answer's column and the summary in the caption's slot", () => {
  assert.match(CANVAS, /const liveText = replyText \|\| \(turnInFlight \? session\.draft : ""\);/);
  assert.match(CANVAS, /\{turnInFlight && !session\.aside && session\.draft\.trim\(\) && \(/, "the draft is not drawn");
  assert.match(CANVAS, /data-canvas-draft=""/);
  assert.match(CANVAS, /\{threadOpen && !turnInFlight && replyText\.trim\(\) && session\.lastTurn && \(\s*<CanvasThinkingSummary lines=\{session\.lastTurn\.lines\} seconds=\{session\.lastTurn\.seconds\} \/>/);
  // The finished answer does not replay its arrival over text the learner already read.
  assert.match(CANVAS, /\$\{session\.drafted \? "" : "canvas-answer-in "\}/);
  assert.match(CANVAS, /captionLeaving=\{Boolean\(liveText\.trim\(\)\)\}/);
});
