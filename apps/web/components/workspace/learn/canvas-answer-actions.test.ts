import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { timeSince } from "./canvas-answer-actions";

// The row of actions under an answer, and the rule about what may be in it.
//
// Owner, 2026-08-26, with a screenshot of Claude's own row: *"add these at the end of every answer
// too"* — the toolbar, not the flashcards, which he corrected in the next message.

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ACTIONS = strip(read("./canvas-answer-actions.tsx"));
const TURN = strip(read("./canvas-thread-turn.tsx"));
const CANVAS = strip(read("./learning-canvas.tsx"));

test("🔴🔴🔴 no control in this row is wired to nothing", () => {
  // THE rule for this file. Nemesis has no ratings store — no table, no endpoint — so thumbs would
  // be two buttons that light up and record nothing. Asked directly, the owner chose to ship the
  // four that work and add thumbs when there is somewhere to put them.
  //
  // Calibration: add a thumb here before the store exists and this reddens.
  for (const dead of ["thumb", "Good response", "Bad response", "rating", "helpful"]) {
    assert.ok(!ACTIONS.toLowerCase().includes(dead.toLowerCase()), `\`${dead}\` is in the row with nowhere to send it`);
  }
});

test("🔴 it is the reference's geometry, measured", () => {
  // claude.ai at 1456px: 24x24 boxes at radius 6, touching (24px pitch), timestamp 11px.
  assert.match(ACTIONS, /h-\[24px\] w-\[24px\]/, "the buttons are not the reference's box");
  assert.match(ACTIONS, /rounded-\[6px\]/, "the buttons lost the reference's radius");
  assert.match(ACTIONS, /gap-0/, "the row has gaps; the reference's boxes touch");
  assert.match(ACTIONS, /text-\[11px\]/, "the timestamp is not the reference's size");
});

test("🔴🔴 read-aloud is mounted ONCE, on the live answer only", () => {
  // The speech controller is keyed to the single reply on screen. A speaker per past turn would be
  // a column of them fighting over one voice — the same reason `SpokenExample` is not drawn in the
  // thread. Calibration: pass `onReadAloud` from the thread turn and this reddens.
  assert.ok(!/onReadAloud/.test(TURN), "a past turn mounts its own speaker");
  assert.match(CANVAS, /onReadAloud=\{\(\) =>/, "the live answer lost its read-aloud");
});

test("🔴 nothing is offered on a turn that cannot do it", () => {
  // A `source` moment is "material attached" — copying it copies an empty string. And an opening
  // line Nemesis wrote by itself has no learner turn behind it, so Retry would re-send nothing.
  assert.match(TURN, /\{turn\.reply\.trim\(\) && \(/, "the row is drawn on a turn with no answer");
  assert.match(TURN, /turn\.said\?\.trim\(\) \? \(\) => onRetry\(turn\.said!\) : undefined/, "Retry is offered with no question behind it");
  assert.match(CANVAS, /onRetry=\{currentSaid\?\.trim\(\) \? \(\) => retryTurn\(currentSaid\) : undefined\}/, "the live answer offers Retry with nothing to re-ask");
});

test("🔴 the row waits for the answer to finish arriving", () => {
  // Copying half a sentence, or reading a paragraph still being written, is worse than a beat's wait.
  assert.match(CANVAS, /\{!turnInFlight && replyText\.trim\(\) && \(/, "the row appears mid-answer");
});

test("🔴🔴 retry is an ordinary turn, not an edit of the old one", () => {
  // Re-running through `converse` means the retry is recorded, joins the thread and can be argued
  // with. Rewriting the previous answer in place would leave the moment log claiming something was
  // said that no longer is.
  assert.match(CANVAS, /const retryTurn = useCallback\(\(said: string\) => \{ void converse\(said\); \}/, "retry no longer goes through the ordinary turn path");
});

test("🔴 the clock never says zero, and never ticks", () => {
  // A counter that opens at "0 minutes ago" reads as broken; eighty live timers in a thread is a
  // real cost for a fact nobody is watching.
  const now = Date.parse("2026-08-26T12:00:00.000Z");
  assert.equal(timeSince("2026-08-26T11:59:59.000Z", now), "just now");
  assert.equal(timeSince("2026-08-26T11:59:00.000Z", now), "1 minute ago");
  assert.equal(timeSince("2026-08-26T11:57:00.000Z", now), "3 minutes ago");
  assert.equal(timeSince("2026-08-26T11:00:00.000Z", now), "1 hour ago");
  assert.equal(timeSince("2026-08-25T12:00:00.000Z", now), "1 day ago");
  assert.equal(timeSince("not a date", now), "", "an unparseable time renders nothing rather than NaN");
  assert.ok(!/setInterval/.test(ACTIONS), "the timestamp is on a ticking clock");
});

test("🔴 the time is computed after mount, not during render", () => {
  // `Date.now()` during render differs between the server and the client, and React discards the
  // tree for it.
  assert.match(ACTIONS, /useEffect\(\(\) => \{\s*if \(at\) setSince\(timeSince\(at, Date\.now\(\)\)\);/, "the timestamp is read during render");
});
