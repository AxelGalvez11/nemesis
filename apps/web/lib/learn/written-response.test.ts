import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { WrittenMark, WrittenWork } from "@/lib/handwriting/written-work";

import { isAdmissionOfNotKnowing, isEchoOfTheCue } from "./response-admission";
import {
  CONFIDENT_ENOUGH_TO_JUDGE,
  renderWriting,
  writingAsConfirmed,
  writingAsRead,
  writtenSubmissionGate,
} from "./written-response";

// ── fixtures ──────────────────────────────────────────────────────────────────

function mark(text: string, over: Partial<WrittenMark> = {}): WrittenMark {
  return { confidence: 0.95, kind: "line", legible: true, struckThrough: false, text, ...over };
}

function work(over: Partial<WrittenWork> = {}): WrittenWork {
  return {
    abstained: false,
    abstentionReason: null,
    finalAnswerIndex: null,
    legibility: 0.95,
    marks: [mark("2x + 6 = 14"), mark("2x = 8"), mark("x = 4")],
    model: "m",
    relations: [],
    ...over,
  };
}

// ── the gate: nothing to correct means nothing is submitted ───────────────────

test("🔴 an abstained reading is blocked, and carries the model's own reason", () => {
  const gate = writtenSubmissionGate(work({ abstained: true, abstentionReason: "the photo is too dark", marks: [] }));
  assert.equal(gate.kind, "blocked");
  assert.match(gate.kind === "blocked" ? gate.reason : "", /too dark/);
});

test("🔴 a page whose every mark came back unreadable is blocked, not submitted as an empty answer", () => {
  const gate = writtenSubmissionGate(
    work({ legibility: 0.9, marks: [mark("four lines of working", { legible: false })] }),
  );
  assert.equal(gate.kind, "blocked", "an unread page of working is not a blank page");
});

test("🔴 a page with only crossed-out work is blocked — nothing is being claimed", () => {
  const gate = writtenSubmissionGate(work({ marks: [mark("x = 6", { struckThrough: true })] }));
  assert.equal(gate.kind, "blocked");
});

test("a reading with no marks at all is blocked", () => {
  assert.equal(writtenSubmissionGate(work({ marks: [] })).kind, "blocked");
});

// ── the gate: every doubt resolves toward asking the learner ──────────────────

test("🔴 an unread mark alongside readable ones asks for confirmation", () => {
  const gate = writtenSubmissionGate(
    work({ marks: [mark("2x + 6 = 14"), mark("one line under it", { legible: false }), mark("x = 4")] }),
  );
  assert.equal(gate.kind, "confirm", "a hole in our reading looks exactly like an omission by the learner");
});

test("🔴 an unreported overall legibility asks rather than proceeds", () => {
  assert.equal(writtenSubmissionGate(work({ legibility: null })).kind, "confirm", "silence about certainty is not certainty");
});

test("🔴 an unreported per-mark confidence asks rather than proceeds", () => {
  assert.equal(
    writtenSubmissionGate(work({ marks: [mark("2x = 8"), mark("x = 4", { confidence: null })] })).kind,
    "confirm",
  );
});

test("🔴 a legibility below the floor asks", () => {
  assert.equal(writtenSubmissionGate(work({ legibility: CONFIDENT_ENOUGH_TO_JUDGE - 0.01 })).kind, "confirm");
});

test("🔴 one shaky mark among confident ones asks", () => {
  assert.equal(
    writtenSubmissionGate(work({ marks: [mark("2x = 8"), mark("x = 4", { confidence: 0.4 })] })).kind,
    "confirm",
    "one misread character turns a correct answer into a wrong one",
  );
});

test("🔴 a shaky reading of a CROSSED-OUT mark still asks", () => {
  assert.equal(
    writtenSubmissionGate(
      work({ marks: [mark("2x = 8"), mark("x = 6", { confidence: 0.3, struckThrough: true }), mark("x = 4")] }),
    ).kind,
    "confirm",
    "a misread retraction is still a misreading, and the judge is shown retractions",
  );
});

test("a reading that is confident throughout is ready", () => {
  assert.equal(writtenSubmissionGate(work()).kind, "ready");
});

test("🔴 NO reading below the confidence floor is ever ready, at any point on the scale", () => {
  // The single most important property in this file: uncertain handwriting can never reach a judge
  // without the learner seeing it first. Swept rather than spot-checked, because a threshold
  // written with the wrong comparison passes every spot check on one side of it.
  for (let value = 0; value <= 1.0001; value += 0.05) {
    const level = Math.round(value * 100) / 100;
    const gate = writtenSubmissionGate(work({ legibility: level, marks: [mark("x = 4", { confidence: level })] }));
    if (level < CONFIDENT_ENOUGH_TO_JUDGE) {
      assert.notEqual(gate.kind, "ready", `confidence ${level} must not be submittable unseen`);
    } else {
      assert.equal(gate.kind, "ready", `confidence ${level} is above the floor and should not need a confirmation`);
    }
  }
});

// ── the learner's own reading ─────────────────────────────────────────────────

test("a correction replaces the text and drops the reading confidence with it", () => {
  const confirmed = writingAsConfirmed(work({ marks: [mark("x = 4", { confidence: 0.4 })] }), {
    finalAnswerIndex: null,
    marks: ["x = 9"],
  });
  assert.equal(confirmed.marks[0]?.text, "x = 9");
  assert.equal(
    confirmed.marks[0]?.confidence,
    null,
    "a learner's own sentence must not be filed as a machine reading of maximum certainty",
  );
  assert.equal(confirmed.confirmed, true);
});

test("an unchanged mark is kept exactly as observed", () => {
  const original = work({ marks: [mark("x = 4")] });
  const confirmed = writingAsConfirmed(original, { finalAnswerIndex: null, marks: ["x = 4"] });
  assert.deepEqual(confirmed.marks[0], original.marks[0]);
});

test("🔴 blanking a mark that WAS read deletes it; blanking one that was NOT read leaves the gap", () => {
  const confirmed = writingAsConfirmed(
    work({ marks: [mark("x = 4"), mark("a smudge"), mark("two lines below", { legible: false })] }),
    { finalAnswerIndex: null, marks: ["x = 4", "", ""] },
  );
  assert.deepEqual(confirmed.marks.map((m) => m.text), ["x = 4", "two lines below"]);
  assert.equal(confirmed.marks[1]?.legible, false, "leaving a gap alone must not turn it into content");
});

test("filling in an unread mark makes it readable content", () => {
  const confirmed = writingAsConfirmed(work({ marks: [mark("two lines below", { legible: false })] }), {
    finalAnswerIndex: null,
    marks: ["3x = 12"],
  });
  assert.equal(confirmed.marks[0]?.legible, true);
  assert.equal(confirmed.marks[0]?.text, "3x = 12");
});

test("🔴 the chosen final answer follows its mark through deletions above it", () => {
  const confirmed = writingAsConfirmed(work({ marks: [mark("noise"), mark("2x = 8"), mark("x = 4")] }), {
    finalAnswerIndex: 2,
    marks: ["", "2x = 8", "x = 4"],
  });
  assert.equal(confirmed.finalAnswerIndex, 1, "a stale index marks the wrong line as someone's conclusion");
  assert.equal(confirmed.marks[confirmed.finalAnswerIndex ?? -1]?.text, "x = 4");
});

test("a final answer the learner deleted is no final answer", () => {
  const confirmed = writingAsConfirmed(work({ marks: [mark("2x = 8"), mark("x = 4")] }), {
    finalAnswerIndex: 1,
    marks: ["2x = 8", ""],
  });
  assert.equal(confirmed.finalAnswerIndex, null);
});

test("a reading submitted without a correction step is not marked confirmed", () => {
  assert.equal(writingAsRead(work()).confirmed, false);
});

// ── the render: plain when plain, which keeps two non-attempt rules alive ─────

test("🔴 one readable line renders as exactly that line and nothing else", () => {
  const rendered = renderWriting(writingAsRead(work({ marks: [mark("x = 4")] })));
  assert.equal(rendered, "x = 4");
});

test("🔴 a handwritten 'I don't know' is still recognised as an admission, not judged as an attempt", () => {
  // Without plain-when-plain this renders as "Their work, in the order it reads:\n1. idk", which
  // leaves plenty substantive after the admission phrase is stripped, so isAdmissionOfNotKnowing
  // returns false, so it goes to the judge, comes back `incorrect`, and a person who told us they
  // did not know is recorded as having got it wrong. That is absence of evidence stored as
  // negative evidence, through a door the rule was not watching.
  for (const said of ["idk", "I don't know", "no idea"]) {
    const rendered = renderWriting(writingAsRead(work({ marks: [mark(said)] })));
    assert.equal(isAdmissionOfNotKnowing(rendered), true, `"${said}" written by hand must still read as an admission`);
  }
});

test("🔴 a handwritten answer that only echoes the cue is still recognised as an echo", () => {
  const rendered = renderWriting(writingAsRead(work({ marks: [mark("losartan")] })));
  assert.equal(
    isEchoOfTheCue({ cue: "losartan", expectedAnswer: "Cozaar", response: rendered }),
    true,
  );
});

test("a plain single line survives the confirmation step as a plain single line", () => {
  const confirmed = writingAsConfirmed(work({ marks: [mark("idk", { confidence: 0.3 })] }), {
    finalAnswerIndex: null,
    marks: ["idk"],
  });
  assert.equal(renderWriting(confirmed), "idk");
  assert.equal(isAdmissionOfNotKnowing(renderWriting(confirmed)), true);
});

test("more than one mark is never rendered plain", () => {
  const rendered = renderWriting(writingAsRead(work({ marks: [mark("2x = 8"), mark("x = 4")] })));
  assert.match(rendered, /Their work, in the order it reads/);
});

// ── the render: the distinctions the evaluator needs ──────────────────────────

test("🔴 the steps are numbered in the order they were written", () => {
  const rendered = renderWriting(writingAsRead(work()));
  assert.match(rendered, /1\. 2x \+ 6 = 14/);
  assert.match(rendered, /2\. 2x = 8/);
  assert.match(rendered, /3\. x = 4/);
  assert.ok(
    rendered.indexOf("2x + 6 = 14") < rendered.indexOf("2x = 8"),
    "order is the signal that separates a slipped digit from a wrong method",
  );
});

test("🔴 crossed-out work is kept, marked as retracted, and not numbered as a step", () => {
  const rendered = renderWriting(
    writingAsRead(work({ marks: [mark("2x = 8"), mark("x = 6", { struckThrough: true }), mark("x = 4")] })),
  );
  assert.match(rendered, /\[they crossed this out\] x = 6/);
  assert.doesNotMatch(rendered, /2\. x = 6/, "a retracted line must not be handed over as a step they stand behind");
  assert.match(rendered, /2\. x = 4/, "the numbering counts what they are claiming");
});

test("🔴 an unread part is reported as a gap in our reading, never as something they wrote", () => {
  const rendered = renderWriting(
    writingAsRead(work({ marks: [mark("2x = 8"), mark("one line under it", { legible: false }), mark("x = 4")] })),
  );
  assert.match(rendered, /could not read one part of this page: one line under it/);
  assert.doesNotMatch(
    rendered,
    /^\s*\d+\. one line under it/m,
    "a description of a gap printed as a numbered step puts words in the learner's mouth",
  );
});

test("the conclusion is stated apart from the working", () => {
  const rendered = renderWriting(writingAsRead(work({ finalAnswerIndex: 2 })));
  assert.match(rendered, /They marked this as their final answer: x = 4/);
});

test("🔴 a page that reaches no conclusion says so — that is what a partial derivation looks like", () => {
  const rendered = renderWriting(writingAsRead(work({ finalAnswerIndex: null })));
  assert.match(rendered, /did not mark anything on the page as a final answer/);
});

test("a confirmed reading tells the judge a person stood behind the text; an unconfirmed one does not", () => {
  const confirmed = writingAsConfirmed(work(), { finalAnswerIndex: 2, marks: ["2x + 6 = 14", "2x = 8", "x = 4"] });
  assert.match(renderWriting(confirmed), /checked this reading themselves/);
  assert.doesNotMatch(renderWriting(writingAsRead(work())), /checked this reading themselves/);
});

test("layout observations are carried through", () => {
  const rendered = renderWriting(
    writingAsRead(work({ relations: ["the arrow runs from the left circle to the box"] })),
  );
  assert.match(rendered, /How it is laid out: the arrow runs from the left circle to the box/);
});

// ── field-agnostic: the same render serves any discipline ─────────────────────

test("a labelled drawing renders with its parts named by shape, not by subject", () => {
  // A free-body diagram, a cell, a circuit and a map are the same shape of page: a drawing, some
  // labels attached to it, and arrows between things.
  const rendered = renderWriting(
    writingAsRead(
      work({
        finalAnswerIndex: null,
        marks: [
          mark("a rectangle resting on a horizontal line", { kind: "figure" }),
          mark("normal force", { kind: "label" }),
          mark("an arrow pointing up from the top face", { kind: "connector" }),
          mark("check this one", { kind: "annotation" }),
        ],
        relations: ["the upward arrow starts at the rectangle"],
      }),
    ),
  );
  assert.match(rendered, /1\. drawing: a rectangle resting on a horizontal line/);
  assert.match(rendered, /2\. label: normal force/);
  assert.match(rendered, /3\. arrow or line: an arrow pointing up from the top face/);
  assert.match(rendered, /4\. note: check this one/);
});

test("an ordinary line of working carries no kind prefix", () => {
  const rendered = renderWriting(writingAsRead(work()));
  assert.doesNotMatch(rendered, /1\. line: /, "tagging every step of an ordinary derivation is noise");
});

/** Source with every comment removed, so these two guards read the CODE rather than the prose that
 *  explains it. Same shape as canvas-learner-copy.test.ts's own stripper, and for the same reason:
 *  a file documenting why subject-matter words are banned necessarily contains one. */
function strippedSource(name: string): string {
  return readFileSync(join(import.meta.dirname, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*(?:[?:][^\S\n]*)?\/\/.*$/gm, "");
}

test("🔴 no code in this module names a subject, a discipline, or a notation", () => {
  // The one thing that would quietly turn this into a maths mode: a keyword list. The motivating
  // examples live in the comments, which is why they are stripped first, but no rule below may
  // branch on what field the page came from.
  const source = strippedSource("written-response.ts");
  assert.ok(source.length > 500, "the stripper ate the module, so this guard would be reading nothing");
  assert.doesNotMatch(
    source,
    /\b(equation|algebra|arithmetic|chemistry|physics|biology|molecule|reaction|statute|calculus|integral)\b/i,
    "a rule that only makes sense for one field is wrong here",
  );
});

test("🔴 no learner-facing string in this module carries an em dash", () => {
  // lib/learn/ is outside canvas-learner-copy.test.ts's scan, and this module's gate reasons and
  // rendered labels are printed verbatim.
  const offenders = (strippedSource("written-response.ts").match(/"[^"\n]*"/g) ?? []).filter((value) =>
    /—|–|&mdash;|&ndash;/.test(value),
  );
  assert.deepEqual(offenders, [], `an em dash is in a learner-facing string:\n  ${offenders.join("\n  ")}`);
});
