// The mislabel this module exists to prevent, pinned as behaviour.
//
// The regression these tests were written for: dictate → ✕ → type → send arrived at the judge
// tagged "spoken", so a typed answer was graded under the speech-leniency instruction and stored
// against the wrong response-time baseline for ever. The last test walks that exact sequence,
// because the property is not "discard resets the flag" in isolation — it is that the flag is
// correct at the moment the answer is actually submitted.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_ANSWER_MODALITY,
  nextAnswerModality,
  type AnswerModalityEvent,
} from "./answer-modality";

/** Replay a sequence from the default, the way the composer accumulates one. */
function after(...events: AnswerModalityEvent[]) {
  return events.reduce(nextAnswerModality, DEFAULT_ANSWER_MODALITY);
}

test("a prompt starts from the keyboard", () => {
  assert.equal(DEFAULT_ANSWER_MODALITY, "typed");
  assert.equal(after({ kind: "prompt_changed" }), "typed");
});

test("a capture names the modality it produced", () => {
  assert.equal(after({ kind: "captured", via: "spoken" }), "spoken");
  assert.equal(after({ kind: "captured", via: "written" }), "written");
});

test("🔴 THE REGRESSION — a discarded capture takes its modality with it", () => {
  assert.equal(
    after({ kind: "captured", via: "spoken" }, { kind: "capture_discarded" }),
    "typed",
    "cancelling dictation and typing instead must not be recorded as speech",
  );
  assert.equal(
    after({ kind: "captured", via: "written" }, { kind: "capture_discarded" }),
    "typed",
  );
});

test("accepting a capture is NOT discarding it — an edited transcript is still spoken", () => {
  // ✓ lands the transcript in the composer as editable text. The learner did say it; tidying it
  // up before sending does not turn it into typing, and the judge should still forgive speech.
  assert.equal(after({ kind: "captured", via: "spoken" }), "spoken");
});

test("submitting returns the composer to the keyboard for the next answer", () => {
  assert.equal(
    after({ kind: "captured", via: "spoken" }, { kind: "submitted" }),
    "typed",
    "one spoken answer must not tag every later typed answer on the same prompt",
  );
});

test("the full mislabel sequence: speak, cancel, type, send", () => {
  assert.equal(
    after(
      { kind: "captured", via: "spoken" },
      { kind: "capture_discarded" },
      // …the learner now types. Typing is not an event: it is the absence of a capture.
    ),
    "typed",
  );
});

// 🔴 THE COMPOSER MUST ROUTE THROUGH THIS, NOT KEEP ITS OWN FLAG.
//
// The whole defect was a modality assignment that one code path forgot to undo. A module that is
// correct while the component still sets `inputModality.current = "spoken"` by hand fixes nothing,
// and that failure is invisible — every test above still passes. So these check the wiring itself.
//
// 🔴 AND THEY WERE CALIBRATED, because the first version of this guard had no teeth: deleting the
// discard from `cancelDictation` left all 3,522 tests green. A guard that does not fail when you
// break the thing it names is not a guard. Both tests below were confirmed to RED against the
// specific edit they exist to catch, then restored.

const composerSource = () =>
  readFileSync(join(import.meta.dirname, "../../components/workspace/learn/canvas-composer.tsx"), "utf8");

/** The body of a `const NAME = () => { … }` handler, so a test can assert about ONE handler rather
 *  than about the 700-line file that happens to contain the right words somewhere. */
function handlerBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = () => {`);
  assert.notEqual(start, -1, `${name} not found — it was renamed or removed`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  assert.fail(`${name} has unbalanced braces`);
}

test("canvas-composer sets modality only through nextAnswerModality", () => {
  const source = composerSource();
  assert.match(source, /nextAnswerModality/, "the composer must use the transition function");
  // A raw assignment of a modality literal is the shape that went wrong. Reducer calls are fine;
  // `inputModality.current = "spoken"` is not.
  assert.doesNotMatch(
    source,
    /inputModality\.current\s*=\s*["']/,
    "assigning a modality literal directly is what left 'spoken' set after a cancel",
  );
});

test("🔴 cancelling dictation discards the modality it set", () => {
  // THE regression. `cancelDictation` is documented as "throw the capture away and put the
  // composer back as it was"; without this line it put the TEXT back and kept the modality, so
  // the next typed answer on that prompt was graded and stored as speech.
  assert.match(
    handlerBody(composerSource(), "cancelDictation"),
    /modalityEvent\(\{\s*kind:\s*"capture_discarded"\s*\}\)/,
    "cancelDictation must discard the modality, not only the text",
  );
});
