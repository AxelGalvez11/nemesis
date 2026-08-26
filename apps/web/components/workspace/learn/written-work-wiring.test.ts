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

test("🔴🔴 THE PAGE TO WORK ON IS PARKED: no door in the composer, every part of it still here", () => {
  // Owner 2026-08-26, two messages apart: *"the pencil should be available so users can draw in
  // canvas not inside a box"*, then *"remove pencil mode for now"*. The second wins, and "for now"
  // is their word, so this file changed from guarding the WIRING to guarding the PARKING.
  //
  // 🔴 SIX GUARDS WERE REVERSED INTO THIS ONE, and what they asserted is recorded here because it
  // is what has to come back, in this order, if the door is restored:
  //   1. `<WrittenWorkSheet` rendered from the composer, and never a second drawing surface.
  //   2. the control that opens it present for the WHOLE session, not only while answering — you
  //      reach for paper before you have an answer.
  //   3. `promptId={answering ? taskId : null}` — the one prop that is the whole lifecycle rule:
  //      with a question open the sheet grows a submit control, without one it is scratch paper.
  //   4. `onAnswer(value, "written", Date.now() - startedAt.current)` — one answer path, so
  //      nothing downstream ever learns that written work exists.
  //   5. the `ink` ref ABOVE the prompt-changed effect, and no `setDrawing(false)` inside it.
  //   6. reachability and the submit control as two SEPARATE gates reading one decision.
  //
  // The tests below this one are untouched and still run: they guard the sheet, the reading gate,
  // the review step and the capture hook, none of which were deleted. That is deliberate. A parked
  // feature whose guards are deleted is a feature that quietly rots until nobody can restore it.
  const composer = code("canvas-composer.tsx");
  assert.ok(!/<WrittenWorkSheet/.test(composer), "the composer renders the sheet again");
  assert.ok(!/setDrawing\(true\)/.test(composer), "the door back into the sheet is open again");
  assert.ok(!/written-work-sheet/.test(composer), "the composer imports the sheet again");

  // 🔴 AND THE MACHINERY IS ALL STILL THERE. Calibration: delete any of these files and this
  // reddens, which is the point of parking rather than removing.
  for (const file of ["written-work-sheet.tsx", "written-work-review.tsx", "use-written-work-capture.ts"]) {
    assert.ok(read(file).length > 0, `${file} was deleted rather than parked`);
  }
});

test("🔴 the sheet renders no submit control when nothing is being asked", () => {
  const sheet = code("written-work-sheet.tsx");
  const submit = sheet.match(/\{promptId && \([\s\S]{0,900}?onClick=\{readDrawing\}/);
  assert.ok(submit, "the hand-in control must be ABSENT rather than disabled when there is nothing to answer");
  // Absent, not disabled: a greyed control still advertises that pressing it is an option.
  assert.doesNotMatch(sheet, /disabled=\{!promptId/, "a disabled control is not the same claim as no control");
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
