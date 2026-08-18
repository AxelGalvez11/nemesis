// Can we tell afterwards whether any of this worked?
//
// 🔴🔴 ADDING PEDAGOGY WITHOUT BEING ABLE TO EVALUATE IT IS HALF A FEATURE. The north star is not
// accuracy and not minutes: it is DURABLE OR TRANSFERABLE LEARNING PER UNIT OF ACTIVE ATTENTION. So
// every new task form has to leave enough durable provenance that the questions worth asking are
// answerable from evidence rows alone — no analytics join, no inference from the shape of a session.
//
// 🔴 AND NONE OF THESE IS A CAUSAL CLAIM. `completionThenIndependent` counts a SEQUENCE. Learners who
// get completions are not a random sample of learners, so the causal comparison lives in the A/B
// arms; this is the descriptive half, and it is labelled as such.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { LearnerEvidence } from "./learner-evidence";
import { summariseStrategy, RETENTION_DELAY_MS } from "./strategy-outcomes";

const START = Date.parse("2026-08-01T09:00:00.000Z");
const KEY = "recall:v1:aaaa";
const OTHER = "predict:v1:bbbb";

function row(over: Partial<LearnerEvidence> & { id: string; atMs: number }): LearnerEvidence {
  const { atMs, ...rest } = over;
  return {
    demonstrationObtained: true,
    objectiveEvidence: "demonstrated",
    objectiveIdentityKey: KEY,
    occurredAt: new Date(atMs).toISOString(),
    responseLatencyMs: 10_000,
    scaffoldRung: "independent",
    taskForm: "direct",
    teachingStrategy: "llm_teacher",
    verdict: "understood",
    ...rest,
  } as LearnerEvidence;
}

test("🔴 each form's yield and its cost in attention are both readable", () => {
  const rows = [
    row({ atMs: START, id: "a", responseId: "p1", scaffoldRung: "completion", taskForm: "completion" }),
    row({
      atMs: START + 1000,
      id: "b",
      objectiveEvidence: "contradicted",
      responseId: "p2",
      responseLatencyMs: 40_000,
      scaffoldRung: "completion",
      taskForm: "completion",
      verdict: "incorrect",
    }),
    row({ atMs: START + 2000, id: "c", responseId: "p3", taskForm: "transfer" }),
  ];
  const forms = summariseStrategy("llm_teacher", rows).taskForms;

  assert.equal(forms.observed, true);
  assert.equal(forms.byForm.completion.attempts, 2);
  assert.equal(forms.byForm.completion.demonstrations, 1);
  assert.equal(forms.byForm.completion.demonstrationRate, 0.5);
  // 🔴 THE DENOMINATOR OF THE ONLY RATIO THAT MATTERS. A form that produces more demonstrations while
  // costing three times the thinking time is not obviously better, and without this the comparison
  // would silently be "which form gets more right answers".
  assert.equal(forms.byForm.completion.activeAttentionMs, 50_000);
  assert.equal(forms.byForm.transfer.attempts, 1);
  assert.equal(forms.byForm.transfer.activeAttentionMs, 10_000);
  assert.equal(forms.byForm.direct.attempts, 0);
  assert.equal(forms.byForm.direct.demonstrationRate, null, "no attempts is not a zero rate");
});

test("🔴 'nothing recorded a form' is distinguishable from 'every task was direct'", () => {
  // 🔴 THE HISTORICAL ROWS. Everything written before the column existed carries no form, and reading
  // three zeroes as "no completions ever happened" would be exactly the absence-as-evidence mistake
  // the whole evidence model is built to avoid.
  const legacy = [{ ...row({ atMs: START, id: "old", responseId: "p0" }), taskForm: undefined }];
  const forms = summariseStrategy("llm_teacher", legacy).taskForms;
  assert.equal(forms.observed, false);
  assert.equal(forms.byForm.direct.attempts, 0);
});

test("🔴🔴 'did faded examples lead to unaided production?' is answerable from the rows", () => {
  // The question the whole worked-example → completion → independent progression rests on. Nemesis
  // deliberately does not SCRIPT that sequence, so whether the middle step leads anywhere is an
  // empirical question — and this is the pair of numbers that answers it.
  const led = [
    row({ atMs: START, id: "1", responseId: "p1", scaffoldRung: "completion", taskForm: "completion" }),
    row({ atMs: START + RETENTION_DELAY_MS, id: "2", responseId: "p2" }),
  ];
  const didNot = [
    row({ atMs: START, id: "3", objectiveIdentityKey: OTHER, responseId: "p3", scaffoldRung: "completion", taskForm: "completion" }),
    row({
      atMs: START + RETENTION_DELAY_MS,
      id: "4",
      objectiveEvidence: "contradicted",
      objectiveIdentityKey: OTHER,
      responseId: "p4",
      verdict: "incorrect",
    }),
  ];
  const forms = summariseStrategy("llm_teacher", [...led, ...didNot]).taskForms;
  assert.equal(forms.completionsWithLaterUnaidedAttempt, 2, "both objectives got a later unaided attempt");
  assert.equal(forms.completionThenIndependent, 1, "only one of them went on to produce it unaided");

  // 🔴 A COMPLETION WITH NO LATER UNAIDED ATTEMPT COUNTS IN NEITHER. It is an open case, not a
  // failure, and folding it into the denominator would report an unfinished session as a bad one.
  const stillOpen = summariseStrategy("llm_teacher", [led[0]!]).taskForms;
  assert.equal(stillOpen.completionsWithLaterUnaidedAttempt, 0);
  assert.equal(stillOpen.completionThenIndependent, 0);
});

test("🔴 transfer by someone who had already produced it is counted apart from transfer by someone who had not", () => {
  const afterProducing = [
    row({ atMs: START, id: "5", responseId: "p5" }),
    row({ atMs: START + 3 * RETENTION_DELAY_MS, id: "6", responseId: "p6", taskForm: "transfer" }),
  ];
  const cold = [
    row({ atMs: START, id: "7", objectiveIdentityKey: OTHER, responseId: "p7", taskForm: "transfer" }),
  ];
  const forms = summariseStrategy("llm_teacher", [...afterProducing, ...cold]).taskForms;
  assert.equal(forms.byForm.transfer.demonstrations, 2);
  // 🔴 AVERAGING THE TWO WOULD HIDE BOTH. Using a relation in a new case AFTER producing it in the
  // old one is the thing worth having; doing it cold is a different and rarer event.
  assert.equal(forms.transferAfterDirectDemonstration, 1);
});

test("🔴 the north-star ratio is still durable learning over active attention, not accuracy", () => {
  // Unchanged by any of this, and asserted here so the new per-form numbers cannot quietly become
  // the headline. A demonstration only counts as durable when a real delay preceded it.
  const spaced = [
    row({ atMs: START, id: "8", responseId: "p8" }),
    row({ atMs: START + RETENTION_DELAY_MS, id: "9", responseId: "p9", taskForm: "transfer" }),
  ];
  const summary = summariseStrategy("llm_teacher", spaced);
  assert.equal(summary.durableDemonstrations, 1);
  assert.equal(summary.objectivesDurablyDemonstrated, 1);
  assert.ok((summary.durableDemonstrationsPerActiveHour ?? 0) > 0);
  assert.equal(summary.activeAttentionMs, 20_000);
});
