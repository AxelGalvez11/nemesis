import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Source-level, like every other structural guard in this directory: this app has no DOM test
// harness (canvas-runtime-branch.test.ts's own note), so a property about how components are wired
// is checked by reading the wiring. The DECISIONS these components make are pure and live in
// lib/learn/written-response.ts and lib/handwriting/written-work.ts, which is where the behavioural
// assertions are. What is left here is the handful of facts that only exist in the JSX, and every
// one of them is a way a learner could be handed a verdict they did not earn.

const ROOT = import.meta.dirname;

function read(name: string): string {
  return readFileSync(join(ROOT, name), "utf8");
}

/** Source with comments removed, so these guards read the wiring rather than the prose explaining
 *  it. Every file below documents at length the very patterns being banned. */
function code(name: string): string {
  return read(name)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*(?:[?:][^\S\n]*)?\/\/.*$/gm, "");
}

test("the writing sheet is the composer's writing surface, and there is only one", () => {
  const composer = code("canvas-composer.tsx");
  assert.match(composer, /<WrittenWorkSheet/, "the composer opens the sheet");
  assert.doesNotMatch(
    composer,
    /<HandwritingPad/,
    "two drawing surfaces with different submit rules is the second answer box this file exists to prevent",
  );
});

test("🔴 the sheet is reachable while thinking, not only while a question is open", () => {
  // The owner's framing: you reach for paper BEFORE you have an answer. Gated on `answering`, this
  // is a second answer box with a pencil on it rather than somewhere to work.
  const composer = code("canvas-composer.tsx");
  const control = composer.match(/\{inSession && \([\s\S]{0,600}?setDrawing\(true\)[\s\S]{0,400}?\)\}/);
  assert.ok(control, "the control that opens the sheet must be present for the whole session, not only while answering");
});

test("🔴 the sheet is told which question is open, and is told `null` when none is", () => {
  // This one prop is the entire lifecycle rule. With a question open the sheet grows a submit
  // control; without one it is scratch paper and grows none, because evidence about no question is
  // a durable claim no prompt supports (objective-task.ts).
  const composer = code("canvas-composer.tsx");
  assert.match(composer, /promptId=\{answering \? taskId : null\}/);
});

test("🔴 the sheet renders no submit control when nothing is being asked", () => {
  const sheet = code("written-work-sheet.tsx");
  const submit = sheet.match(/\{promptId && \([\s\S]{0,900}?onClick=\{readDrawing\}/);
  assert.ok(submit, "the hand-in control must be ABSENT rather than disabled when there is nothing to answer");
  // Absent, not disabled: a greyed control still advertises that pressing it is an option.
  assert.doesNotMatch(sheet, /disabled=\{!promptId/, "a disabled control is not the same claim as no control");
});

test("🔴 handing work in goes through the one answer path, marked `written`", () => {
  // Not a second route into the evidence log. It calls the same `onAnswer` a typed and a spoken
  // answer call, with the elapsed time the composer already tracks, so nothing downstream has to
  // learn that written work exists.
  const composer = code("canvas-composer.tsx");
  assert.match(composer, /onAnswer\(value, "written", Date\.now\(\) - startedAt\.current\)/);
});

test("🔴 the ink survives a prompt change; the READING is what must not", () => {
  // The pad this replaced closed itself whenever the question changed, which was right for a
  // one-answer capture surface and is wrong for scratch paper: someone working a problem out over
  // several minutes must not lose it because the page advanced. The risk that closing covered is
  // now held by identity instead.
  const composer = code("canvas-composer.tsx");
  const promptEffect = composer.match(/useEffect\(\(\) => \{\s*setText\(""\)[\s\S]*?\}, \[taskId\]\);/);
  assert.ok(promptEffect, "expected the prompt-changed effect to still exist");
  assert.doesNotMatch(promptEffect[0], /setDrawing\(false\)/, "closing the sheet on every prompt change interrupts the work it hosts");
  assert.match(composer, /const ink = useRef<string \| null>\(null\)/, "the ink is held above the effect that resets everything else");
});

test("🔴 every reading is checked against the question that was open when it was taken", () => {
  // Checked twice on purpose: once when the reply lands, and again at the moment of submission,
  // because the review step is where a learner spends the most time and the page can move on
  // underneath it.
  const sheet = code("written-work-sheet.tsx");
  const checks = sheet.match(/answersTheSameQuestion\(/g) ?? [];
  assert.ok(
    checks.length >= 2,
    `a reading is bound to its prompt at read time AND at submit time; found ${checks.length} check(s)`,
  );
});

test("🔴🔴 there is exactly one way to submit written work, and it is downstream of the gate", () => {
  // The single most important structural property in this change. `writtenSubmissionGate` decides
  // whether an uncertain reading may be judged at all; a second call to `onSubmit` that did not
  // pass through `readWork` would be a path from uncertain handwriting straight to a durable
  // verdict, which is the one thing this whole path exists to make impossible.
  const sheet = code("written-work-sheet.tsx");
  const submits = sheet.match(/onSubmit\(/g) ?? [];
  assert.equal(submits.length, 2, `expected exactly the ready path and the confirmed path, found ${submits.length}`);
  // Both of them render through the same function, so neither can hand over a raw observation.
  const renders = sheet.match(/onSubmit\(renderWriting\(/g) ?? [];
  assert.equal(renders.length, 2, "every submission is a rendered writing, never a raw reading");
  assert.match(sheet, /writtenSubmissionGate\(reading\.work\)/, "the gate runs on the reading before anything else happens to it");
});

test("🔴 the review step owns the only submit control that a low-confidence reading can reach", () => {
  const review = code("written-work-review.tsx");
  assert.match(review, /onConfirm\(\{ finalAnswerIndex, marks: values \}\)/);
  // Each mark gets its own field. Handing back one flattened paragraph would technically let
  // someone fix a misreading and would in practice mean nobody did, because the point of
  // uncertainty is that the learner cannot see WHICH part we were unsure of.
  assert.match(review, /work\.marks\.map\(\(mark, index\)/, "the correction is per mark, not one text blob");
  assert.match(review, /mark\.legible \? mark\.text : ""/, "a gap must not be seeded with our description of it as if they wrote it");
});

test("🔴 the state that makes the sheet scratch paper is actually reachable", () => {
  // 🔴 THE COMPOSER-SIDE TEST ABOVE CANNOT SEE THIS. It asserts the control is gated on
  // `inSession`, which is only the deliverable if `inSession` is genuinely broader than
  // `answering`. If the caller passed the same condition to both, the pencil would appear exactly
  // when a question was open, the affordance would not exist, and that test would still be green.
  //
  // `inSession={sink.kind === "policy"}` is true for the whole policy-owned session, while
  // `answering = Boolean(task && !task.answered && task.placeholder)` additionally requires an
  // unanswered task with a prompt. Reading feedback after an answer is one state in the gap, which
  // is exactly the moment someone reaches for paper to work the next thing out.
  const canvas = code("learning-canvas.tsx");
  assert.match(canvas, /inSession=\{sink\.kind === "policy"\}/, "the sheet's reachability comes from session ownership");
  const composer = code("canvas-composer.tsx");
  assert.match(
    composer,
    /const answering = Boolean\(task && !task\.answered && task\.placeholder\);/,
    "answering must stay strictly narrower than inSession, or the two collapse and the affordance disappears",
  );
});

test("🔴 the sheet cannot hand in or save a page it has not finished painting back", () => {
  // Restoring saved ink is asynchronous: `image.src` is set in the mount effect and the paint
  // happens in `onload`, while `hasInk` is true from the first render because there IS saved ink.
  // Anything that reads the canvas in that window sees a BLANK page, so putting the sheet away
  // quickly would save a blank over the learner's work and handing in would submit an empty
  // answer to a judge.
  const sheet = code("written-work-sheet.tsx");
  assert.match(sheet, /const \[restored, setRestored\] = useState\(!initialInk\)/);
  assert.match(sheet, /if \(!restored\) return;[\s\S]{0,200}toDataURL/, "keepInk must not write back before the restore lands");
  assert.match(sheet, /!canvas \|\| !restored \|\| !hasInk/, "readDrawing must not send a page that is not painted yet");
});

test("🔴 nothing is read while the learner is still writing", () => {
  // The owner's first requirement, made structural. Every stroke handler is local drawing; the one
  // network call in the file is reached from a press.
  const sheet = code("written-work-sheet.tsx");
  const reads = sheet.match(/capture\.read\(/g) ?? [];
  assert.equal(reads.length, 1, `expected one vision call site, found ${reads.length}`);
  // 🔴 THE BAN IS ON ACTING, NOT ON READING STATE. `startStroke` legitimately consults
  // `capture.busy` to stop someone drawing over a page that is mid-read; a blanket ban on the word
  // `capture` reddened on exactly that, which is a false positive rather than a defect. What must
  // never appear in a stroke handler is a call that sends the page anywhere.
  for (const handler of ["continueStroke", "startStroke", "endStroke"]) {
    const body = sheet.match(new RegExp(`function ${handler}\\([\\s\\S]*?\\n  \\}`))?.[0] ?? "";
    assert.ok(body, `expected ${handler} to still exist`);
    assert.doesNotMatch(
      body,
      /capture\.read\(|readWork\(|onSubmit\(|toBlob\(|fetch\(/,
      `${handler} must not send the page anywhere: drawing is not submitting`,
    );
  }
});
