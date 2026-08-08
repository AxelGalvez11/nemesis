// Seeded canvases for the /dev-preview/learn harness.
//
// Deliberately a realistic lecture rather than lorem ipsum: the citations resolve, the
// concepts are the ones the questions test, and one question is written so a wrong answer
// produces a diagnosis that names a real idea. That is what makes the harness able to check
// behaviour rather than just layout.
//
// Field note: cardiac physiology here only because it is the brief's own worked example. The
// canvas assumes nothing about discipline — the same seed shape would hold for a case, a
// proof, or a statute.

import { emptyCanvas, type CanvasSource, type LearningCanvas } from "./canvas-model";

export type PreviewSeed = "empty" | "lesson" | "recall" | "test" | "diagnose" | "complete" | "retest";

const NOW = "2026-08-06T12:00:00.000Z";

const SOURCE: CanvasSource = {
  id: "s1",
  title: "Cardiac action potentials (lecture 7).pdf",
  kind: "pdf",
  excerpts: [
    {
      id: "s1:e1",
      label: "Slide 3",
      text: "Cardiac myocytes maintain a resting membrane potential near -90 mV, held there by the sodium-potassium ATPase and a high resting potassium conductance.",
    },
    {
      id: "s1:e2",
      label: "Slide 5",
      text: "Phase 0 in ventricular myocytes is the rapid upstroke produced by opening of fast voltage-gated sodium channels; sodium enters down its electrochemical gradient and the cell depolarises within a millisecond.",
    },
    {
      id: "s1:e3",
      label: "Slide 9",
      text: "Nodal cells have no fast sodium current. Their phase 0 is carried by L-type calcium channels, which open more slowly, so the upstroke is markedly less steep than in ventricular tissue.",
    },
    {
      id: "s1:e4",
      label: "Slide 11",
      text: "Phase 4 in nodal cells is not flat. A funny current (If), carried by HCN channels and activated by hyperpolarisation, drifts the membrane potential upward until threshold is reached. This spontaneous depolarisation is what makes nodal tissue automatic.",
    },
    {
      id: "s1:e5",
      label: "Slide 14",
      text: "The effective refractory period is the interval during which no stimulus, however strong, can produce a propagated action potential, because the fast sodium channels have not yet recovered from inactivation.",
    },
  ],
};

const CONCEPTS = [
  { id: "k1", label: "Resting potential and ion gradients" },
  { id: "k2", label: "Ventricular phase 0" },
  { id: "k3", label: "Nodal phase 0 and calcium channels" },
  { id: "k4", label: "Nodal phase 4 spontaneous depolarisation" },
  { id: "k5", label: "Effective refractory period" },
];

export function lessonSeed(): LearningCanvas {
  return {
    ...emptyCanvas("preview-canvas", NOW),
    title: "Cardiac action potentials",
    state: "learn",
    level: "basics_known",
    sources: [SOURCE],
    concepts: CONCEPTS,
    blocks: [
      { id: "b1", type: "heading", content: "Cardiac action potentials" },
      {
        id: "b2",
        type: "concept",
        content:
          "Heart cells change their membrane voltage by controlling which ions are allowed to cross the membrane, and when. Everything about the phases follows from that one idea.",
        conceptIds: ["k1"],
        sourceRefs: [{ sourceId: "s1", excerptId: "s1:e1" }],
      },
      {
        id: "b3",
        type: "paragraph",
        content:
          "At rest a ventricular myocyte sits near -90 mV. The sodium-potassium pump keeps the gradients loaded and a high resting potassium conductance keeps the membrane near the potassium equilibrium potential.",
        conceptIds: ["k1"],
        sourceRefs: [{ sourceId: "s1", excerptId: "s1:e1" }],
      },
      { id: "b4", type: "heading", content: "Ventricular cells" },
      {
        id: "b5",
        type: "paragraph",
        content:
          "Phase 0 is the upstroke. Fast voltage-gated sodium channels open, sodium rushes in down its electrochemical gradient, and the cell depolarises within about a millisecond. The speed is the point: it is what lets the ventricle contract as a unit.",
        conceptIds: ["k2"],
        sourceRefs: [{ sourceId: "s1", excerptId: "s1:e2" }],
      },
      {
        id: "b6",
        type: "example",
        content:
          "This is why a drug that blocks fast sodium channels slows conduction through ventricular muscle but leaves the sinus node's rate largely alone.",
        conceptIds: ["k2", "k3"],
        sourceRefs: [{ sourceId: "s1", excerptId: "s1:e2" }],
      },
      { id: "b7", type: "heading", content: "Nodal cells" },
      {
        id: "b8",
        type: "paragraph",
        content:
          "Nodal cells have no fast sodium current at all. Their phase 0 is carried by L-type calcium channels, which open more slowly, so the upstroke is far less steep than in ventricular tissue.",
        conceptIds: ["k3"],
        sourceRefs: [{ sourceId: "s1", excerptId: "s1:e3" }],
      },
      {
        id: "b9",
        type: "paragraph",
        content:
          "Phase 4 in a nodal cell is not flat. The funny current, carried by HCN channels and switched on by hyperpolarisation, drifts the membrane upward until it reaches threshold. Nothing has to tell the cell to fire — that drift is the heartbeat's own clock.",
        conceptIds: ["k4"],
        sourceRefs: [{ sourceId: "s1", excerptId: "s1:e4" }],
      },
      { id: "b10", type: "heading", content: "Why this matters" },
      {
        id: "b11",
        type: "callout",
        content:
          "During the effective refractory period no stimulus, however strong, can produce a propagated beat, because the fast sodium channels have not yet recovered from inactivation. That is the heart's protection against tetanus.",
        conceptIds: ["k5"],
        sourceRefs: [{ sourceId: "s1", excerptId: "s1:e5" }],
      },
    ],
  };
}

const RECALL = [
  {
    id: "r1",
    front: "Which ion carries phase 0 in a ventricular myocyte?",
    back: "Sodium. Fast voltage-gated sodium channels open and produce the rapid upstroke.",
    conceptId: "k2",
    sourceRefs: [{ sourceId: "s1", excerptId: "s1:e2" }],
  },
  {
    id: "r2",
    front: "What carries phase 0 in a nodal cell instead?",
    back: "L-type calcium current — there is no fast sodium current in nodal tissue.",
    conceptId: "k3",
    sourceRefs: [{ sourceId: "s1", excerptId: "s1:e3" }],
  },
  {
    id: "r3",
    front: "What makes nodal tissue fire without being told to?",
    back: "The funny current (If) drifts phase 4 upward to threshold.",
    conceptId: "k4",
    sourceRefs: [{ sourceId: "s1", excerptId: "s1:e4" }],
  },
];

const QUESTIONS = [
  {
    id: "q1",
    q: "A ventricular myocyte is exposed to a drug that blocks fast sodium channels. What happens to phase 0?",
    options: [
      "The upstroke becomes markedly slower",
      "The upstroke becomes steeper",
      "Phase 0 is unaffected",
      "The resting potential rises to -50 mV",
    ],
    answer: 0,
    why: "Phase 0 in ventricular tissue is the fast sodium current, so blocking it flattens the upstroke. The resting potential is set by potassium conductance, not by these channels.",
    conceptId: "k2",
    sourceRefs: [{ sourceId: "s1", excerptId: "s1:e2" }],
  },
  {
    id: "q2",
    q: "A sinus node cell is studied in isolation and fires rhythmically with no input. Which current explains this?",
    options: [
      "The funny current during phase 4",
      "The fast sodium current during phase 0",
      "The delayed rectifier during phase 3",
      "The sodium-potassium ATPase",
    ],
    answer: 0,
    why: "Automaticity comes from the funny current drifting phase 4 to threshold. The fast sodium current is absent in nodal tissue altogether.",
    conceptId: "k4",
    sourceRefs: [{ sourceId: "s1", excerptId: "s1:e4" }],
  },
  {
    id: "q3",
    q: "A stimulus twice the usual threshold is delivered shortly after a ventricular beat and produces nothing. What best explains it?",
    options: [
      "The fast sodium channels have not recovered from inactivation",
      "The stimulus was below threshold",
      "The calcium channels are still open",
      "The cell has depolarised past its equilibrium potential",
    ],
    answer: 0,
    why: "During the effective refractory period the sodium channels are inactivated, so no stimulus of any size propagates. Stimulus strength is not the limiting factor.",
    conceptId: "k5",
    sourceRefs: [{ sourceId: "s1", excerptId: "s1:e5" }],
  },
];

/** The state after a test that went partly wrong — one right, two wrong — so the diagnosis has
 *  something real to name and the targeted rewrite has a genuine target. */
export function diagnoseSeed(): LearningCanvas {
  return {
    ...lessonSeed(),
    state: "diagnose",
    recall: RECALL,
    recallResults: [{ cardId: "r1", conceptId: "k2", grade: "good" }],
    questions: QUESTIONS,
    answers: [
      { questionId: "q1", picked: 0, correct: true },
      { questionId: "q2", picked: 1, correct: false },
      { questionId: "q3", picked: 1, correct: false },
    ],
    weakConceptIds: ["k4", "k5"],
    activeMs: 11 * 60_000,
  };
}

/** "retest" is served by canvas-preview-fixture-retest.ts, which has to run the real
 *  clear-evidence function and so cannot live in this literal. */
export const PREVIEW_CANVASES: Partial<Record<PreviewSeed, () => LearningCanvas>> = {
  // The blank canvas, for checking both documented ways in (§6): drop material, or type
  // a topic. The topic-first path used to read a ref React had not written yet.
  empty: () => emptyCanvas("preview-canvas-empty", NOW),
  lesson: lessonSeed,
  recall: () => ({ ...lessonSeed(), state: "recall", recall: RECALL }),
  test: () => ({ ...lessonSeed(), state: "test", questions: QUESTIONS, answers: [] }),
  diagnose: diagnoseSeed,
  complete: () => ({
    ...diagnoseSeed(),
    state: "complete",
    weakConceptIds: [],
    correctedConceptIds: ["k4", "k5"],
    answers: QUESTIONS.map((question) => ({ questionId: question.id, picked: question.answer, correct: true })),
    activeMs: 14 * 60_000,
  }),
};
