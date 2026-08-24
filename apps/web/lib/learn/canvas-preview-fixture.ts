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

import {
  emptyCanvas,
  type CanvasFreeQuestion,
  type CanvasResponse,
  type CanvasSource,
  type LearningCanvas,
} from "./canvas-model";

export type PreviewSeed =
  | "empty"
  /** Material attached, nothing started. The state that used to be a whole screen. */
  | "attached"
  | "lesson"
  | "recall"
  | "test"
  | "judged"
  | "taught"
  | "choicetest"
  | "diagnose"
  | "complete"
  | "retest"
  /** A canvas stored at the deleted level picker — the one legacy shape that must not strand. */
  | "orient";

const NOW = "2026-08-06T12:00:00.000Z";

/**
 * The saddle z = x² − y² on a 21×21 grid over [−2, 2]², exactly as the §45 surface pass would stamp
 * it. Module-scope arithmetic: deterministic, no request, no clock.
 */
const SADDLE_GRID: number[][] = Array.from({ length: 21 }, (_, row) => {
  const y = -2 + (4 * row) / 20;
  return Array.from({ length: 21 }, (_, col) => {
    const x = -2 + (4 * col) / 20;
    return Math.round((x * x - y * y) * 1000) / 1000;
  });
});

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
        terms: [{ term: "myocyte", conceptId: "k1" }, { term: "potassium equilibrium potential", conceptId: "k1" }],
        sourceRefs: [{ sourceId: "s1", excerptId: "s1:e1" }],
      },
      { id: "b4", type: "heading", content: "Ventricular cells" },
      {
        id: "b5",
        type: "paragraph",
        content:
          "Phase 0 is the upstroke. Fast voltage-gated sodium channels open, sodium rushes in down its electrochemical gradient, and the cell depolarises within about a millisecond. The speed is the point: it is what lets the ventricle contract as a unit.",
        conceptIds: ["k2"],
        terms: [{ term: "electrochemical gradient", conceptId: "k2" }, { term: "depolarises", conceptId: "k2" }],
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
        terms: [{ term: "hyperpolarisation", conceptId: "k4" }, { term: "HCN channels", conceptId: "k4" }],
        sourceRefs: [{ sourceId: "s1", excerptId: "s1:e4" }],
      },
      {
        id: "b9f",
        type: "paragraph",
        content:
          "Seeing where the nodes sit in the whole organ makes the conduction story concrete: the sinus node fires, the atria contract, and the signal funnels through the AV node before the ventricles answer.",
        conceptIds: ["k3"],
        // 🔴 A RESOLVED FIGURE, EXACTLY AS THE REFERENCE LANE STAMPS ONE (§42 rung three). The
        // asset is a real registry row: its licence normalises, its host is on the allow list, and
        // the credit line below the picture is the harness's proof the licence actually renders.
        visual: {
          asset: {
            assetPath: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Diagram_of_the_human_heart_%28cropped%29.svg/1280px-Diagram_of_the_human_heart_%28cropped%29.svg.png",
            caption: "The human heart with chambers, valves and great vessels labelled.",
            licence: {
              attribution: "Wapcaplet",
              licence: "CC-BY-SA-3.0",
              source: "Wikimedia Commons",
              url: "https://commons.wikimedia.org/wiki/File:Diagram_of_the_human_heart_(cropped).svg",
            },
            provenance: "reference_image",
          },
          kind: "figure",
          learningGoal: "Place the conduction system inside the anatomy it drives",
          subject: "human heart anatomy labelled diagram",
        },
      },
      {
        id: "b9g",
        type: "paragraph",
        content:
          "The funny current has a shape you can hold: HCN1 is a four-fold channel whose voltage sensors answer to hyperpolarisation instead of depolarisation. Turn the structure and the symmetry is the first thing you see.",
        conceptIds: ["k4"],
        // 🔴 A RESOLVED MACROMOLECULE, AS THE RCSB LANE STAMPS ONE. 5U6O is the real human HCN1
        // entry; the harness draws it through the same Mol* path a lesson would.
        visual: {
          accession: "5U6O",
          kind: "macromolecule",
          learningGoal: "See the four-fold symmetry of the channel behind the funny current",
          resolvedFrom: { id: "5U6O", name: "HCN1 channel", provider: "rcsb" },
          title: "Structure of the human HCN1 hyperpolarization-activated cyclic nucleotide-gated ion channel",
        },
      },
      { id: "b9h", type: "heading", content: "The same Canvas, other courses" },
      {
        id: "b9i",
        type: "paragraph",
        content:
          "An electric circuits course draws its first schematic in week one: a source, a series resistor, and a parallel pair. The equivalent resistance printed under the drawing was recomputed from the tree before anything rendered.",
        conceptIds: ["k5"],
        // 🔴 THE §44 CIRCUIT SHAPE, WITH ITS CLAIM VERIFIED. 100 + (200·200)/(200+200) = 200 Ω —
        // the harness proves the checked line renders under the diagram.
        visual: {
          elements: {
            arrangement: "series",
            parts: [
              { component: "resistor", label: "R1", ohms: 100, value: "100 Ω" },
              {
                arrangement: "parallel",
                parts: [
                  { component: "resistor", label: "R2", ohms: 200, value: "200 Ω" },
                  { component: "resistor", label: "R3", ohms: 200, value: "200 Ω" },
                ],
              },
            ],
          },
          equivalentOhms: 200,
          kind: "circuit",
          learningGoal: "Read series and parallel structure off a schematic",
          supply: { label: "12 V" },
        },
      },
      {
        id: "b9j",
        type: "paragraph",
        content:
          "A music theory course needs the staff itself: here is a four-bar phrase in G major, engraved from the ABC notation kept under the drawing.",
        conceptIds: ["k5"],
        // 🔴 THE §44 SCORE SHAPE. The engraving is computed client-side by the trusted library from
        // exactly this string; the harness proves both themes can read the ink.
        visual: {
          abc: "X:1\nT:Phrase in G\nM:4/4\nL:1/4\nK:G\nD G A B|d2 B G|A B A F|G4|",
          kind: "score",
          learningGoal: "Follow a phrase on the staff, not just by ear",
        },
      },
      {
        id: "b9k",
        type: "paragraph",
        content:
          "And multivariable calculus finally gets its third axis: the saddle z equals x squared minus y squared, computed on a grid by the server and turned by hand in the viewer.",
        conceptIds: ["k5"],
        // 🔴 THE §44 SURFACE SHAPE, GRID INCLUDED, exactly as the §45 compute pass stamps one. The
        // grid is generated below at module scope — pure arithmetic, deterministic, no request.
        visual: {
          expression: "x^2 - y^2",
          grid: SADDLE_GRID,
          kind: "surface",
          learningGoal: "See how the surface rises along x and falls along y",
          xFrom: -2,
          xTo: 2,
          yFrom: -2,
          yTo: 2,
          zLabel: "z",
        },
      },
      {
        id: "b9l",
        type: "paragraph",
        content:
          "Organic chemistry's first mechanism, drawn the way the course draws it: hydroxide attacks the carbon while bromide leaves, and the curly arrows show where each electron pair moves.",
        conceptIds: ["k5"],
        // 🔴 THE §42 MECHANISM LANE: arrows in the highlight index space, over dot-separated
        // species sharing one frame. O is heavy atom 0, C is 1, Br is 2.
        visual: {
          arrows: [
            { from: 0, to: 1 },
            { from: 1, to: 2 },
          ],
          carbons: "all",
          kind: "structure",
          learningGoal: "Follow both electron pairs through the substitution",
          notation: "smiles",
          value: "[OH-].CBr",
        },
      },
      {
        id: "b9m",
        type: "paragraph",
        content:
          "And anatomy gets the body itself: the five cervical vertebrae picked out inside the whole skeleton, turned by hand. Ask for any named bone and the atlas frames it.",
        conceptIds: ["k5"],
        // 🔴 THE ANATOMY LANE, STAMPED AS THE RESOLVER STAMPS IT: the atlas's own node names, a
        // same-origin mesh path, and the ghost-everything-else highlight the viewer owes them.
        visual: {
          kind: "anatomy",
          learningGoal: "Place the cervical vertebrae inside the whole skeleton",
          resolved: {
            assetPath: "/anatomy/overview-skeleton.glb",
            region: "overview-skeleton",
            regionTitle: "Skeleton",
            structures: [
              "Cervical vertebrae (C3)",
              "Cervical vertebrae (C4)",
              "Cervical vertebrae (C5)",
              "Cervical vertebrae (C6)",
              "Cervical vertebrae (C7)",
            ],
          },
          structure: "cervical vertebrae",
        },
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
    format: "choice" as const,
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
    format: "choice" as const,
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
    format: "choice" as const,
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

/** The default retrieval format (§18), so the answer box, the microphone and the judged reply
 *  can be looked at without an account or a model call.
 *
 *  Kept field-agnostic on purpose: the surrounding fixture is a physiology lecture, so these
 *  prompts stay in the same material, but every `kind` here is structural and the same shapes
 *  would carry a contract-law canvas or a statics canvas without a word of this file changing. */
const FREE_QUESTIONS: CanvasFreeQuestion[] = [
  {
    id: "f1",
    format: "free",
    task: "mechanism",
    q: "Walk through what happens during phase 0 of a ventricular action potential.",
    expectedEvidence: {
      acceptableClaims: [
        "fast sodium channels open",
        "sodium enters down its gradient",
        "the membrane potential rises sharply",
      ],
    },
    why: "Fast sodium channels open, sodium rushes in down its electrochemical gradient, and the membrane depolarises rapidly — the upstroke.",
    conceptId: "k1",
    sourceRefs: [{ sourceId: "s1", excerptId: "s1:e1" }],
  },
  {
    id: "f2",
    format: "free",
    task: "explain",
    q: "Why can a nodal cell fire without any input reaching it?",
    expectedEvidence: {
      acceptableClaims: [
        "it depolarises on its own during phase 4",
        "the funny current carries it to threshold",
      ],
    },
    why: "Nodal cells drift upward during phase 4 under the funny current until they reach threshold, so they reach it unaided.",
    conceptId: "k4",
  },
];

/** The prompt the teaching loop asks AFTER it has taught the missing piece. Same shape as any
 *  generated question, because it goes through the same parser — a follow-up the judge cannot
 *  read would make the loop degrade to unanswerable questions after one turn. */
const FOLLOW_UP: CanvasFreeQuestion = {
  id: "f1b",
  format: "free",
  task: "explain",
  q: "So why is the channel opening enough on its own — what makes the sodium actually move?",
  expectedEvidence: {
    acceptableClaims: [
      "sodium follows its electrochemical gradient",
      "the gradient is already loaded before the channel opens",
    ],
  },
  why: "The gradient is maintained by the pump beforehand, so opening the channel is all that is needed for sodium to move inward.",
  conceptId: "k1",
};

/** One answered-and-judged prompt, so the reply the learner actually sees — what they got right,
 *  the belief behind the error, the targeted correction — can be checked without a model. */
const JUDGED_RESPONSES: CanvasResponse[] = [
  {
    questionId: "f1",
    text: "the sodium channels open and sodium goes in really fast so the voltage shoots up",
    via: "spoken",
    tookMs: 14_200,
    evaluation: {
      verdict: "partial",
      confidence: 0.8,
      demonstrated: ["names the channels", "has the shape of the upstroke"],
      missing: ["Did not say why sodium moves inward"],
      misconceptions: [],
      errorType: "conceptual",
      feedback:
        "You have the sequence. The piece to add is the reason sodium moves: it follows its own electrochemical gradient, which is why the channels opening is enough on its own.",
    },
    action: "clarify_missing",
    taught:
      "The part you did not say is why sodium moves at all. The sodium-potassium pump has already loaded the gradient before anything opens, so sodium is sitting at a much higher concentration outside than in. Opening the channel does not push it — it simply stops holding it back.",
    followUpQuestionId: "f1b",
  },
  {
    questionId: "f2",
    text: "because it drifts up on its own in phase 4 until it hits threshold, the funny current does it",
    via: "typed",
    tookMs: 9_800,
    evaluation: {
      verdict: "understood",
      confidence: 0.9,
      demonstrated: ["spontaneous phase 4 drift", "the funny current reaching threshold"],
      missing: [],
      misconceptions: [],
      feedback: "That's the whole mechanism, including the part most people leave out.",
    },
  },
];

/** "retest" is served by canvas-preview-fixture-retest.ts, which has to run the real
 *  clear-evidence function and so cannot live in this literal. */
export const PREVIEW_CANVASES: Partial<Record<PreviewSeed, () => LearningCanvas>> = {
  // The blank canvas, for checking both documented ways in (§6): drop material, or type
  // a topic. The topic-first path used to read a ref React had not written yet.
  empty: () => emptyCanvas("preview-canvas-empty", NOW),
  // 🔴 THE STATE THAT USED TO BE A WHOLE SCREEN. `sources_attached` painted "1 source attached"
  // above a "Help me learn this" button; UX brief §1 deletes it, and what replaces it is an
  // attachment chip above the persistent composer with no second control anywhere. Seeded so that
  // replacement is actually LOOKED AT — it had no preview state of its own before, which is why
  // the screen it replaced went unexamined for as long as it did.
  attached: () => ({
    ...emptyCanvas("preview-canvas-attached", NOW),
    sources: [SOURCE],
    state: "sources_attached",
  }),
  // 🔴 A CANVAS STORED AT THE DELETED LEVEL PICKER. `orient` was only ever escapable by choosing
  // one of four labels, and that screen is gone — so this shape has no forward path of its own and
  // is the one that would strand on a blank page for ever if the resume path regressed. Seeded
  // with a source and NOTHING produced, which is exactly the state such a row is stored in.
  orient: () => ({
    ...emptyCanvas("preview-canvas-orient", NOW),
    sources: [SOURCE],
    state: "orient",
    title: "Cardiac action potentials",
  }),
  lesson: lessonSeed,
  recall: () => ({ ...lessonSeed(), state: "recall", recall: RECALL }),
  // Multiple choice is still reachable, because it still exists for exam simulation — but it is
  // no longer what "test" means.
  test: () => ({ ...lessonSeed(), state: "test", questions: FREE_QUESTIONS, answers: [], responses: [] }),
  judged: () => ({
    ...lessonSeed(),
    state: "test",
    questions: FREE_QUESTIONS,
    answers: [],
    responses: JUDGED_RESPONSES,
  }),
  // What the teaching loop leaves behind: the gap taught, and a follow-up inserted right after
  // the prompt it follows up.
  taught: () => ({
    ...lessonSeed(),
    state: "test",
    questions: [FREE_QUESTIONS[0] as CanvasFreeQuestion, FOLLOW_UP, FREE_QUESTIONS[1] as CanvasFreeQuestion],
    answers: [],
    responses: [JUDGED_RESPONSES[0] as CanvasResponse],
  }),
  choicetest: () => ({ ...lessonSeed(), state: "test", questions: QUESTIONS, answers: [], responses: [] }),
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
