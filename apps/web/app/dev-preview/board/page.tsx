"use client";

// DEV-ONLY PREVIEW — the spatial Canvas with fixture cards: a root card with an answer, key terms,
// suggestions and a branch beside it, plus a note. Nothing is signed in and nothing saves; the
// real components render exactly as shipped. Measure the board here, never on the real route.

import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { BoardPage } from "@/components/workspace/board/board-page";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import type { BoardAnnotation } from "@/lib/board/board-annotations";
import type { BoardCard, BoardSource, BoardState } from "@/lib/board/board-model";

const ANSWER =
  "Insulin analogues are engineered to change **how quickly** insulin is absorbed after an injection.\n\n" +
  "- [Insulin aspart](#concept \"A rapid-acting analogue that starts working within about 15 minutes of a meal.\") starts in 10 to 20 minutes and peaks in 1 to 3 hours.\n" +
  "- [Insulin glargine](#concept \"A long-acting basal analogue with a nearly flat profile over 24 hours.\") starts in 1 to 2 hours and has no real peak.\n" +
  "- [Insulin degludec](#concept \"An ultra-long-acting basal analogue whose effect lasts beyond 42 hours.\") starts in 30 to 60 minutes and lasts beyond 42 hours.\n\n" +
  "All three are injectable prescription medicines used to manage diabetes mellitus, and the choice between them turns on whether the learner needs mealtime cover or a steady background level.";

function card(partial: Partial<BoardCard> & Pick<BoardCard, "id" | "title" | "position" | "messages">): BoardCard {
  return {
    kind: "conversation",
    parentId: null,
    sourceIds: [],
    contextExcerpt: null,
    inheritedContext: [],
    highlights: [],
    savedImages: [],
    notes: [],
    status: "idle",
    width: 720,
    ...partial,
  };
}

const ROOT = card({
  id: "root",
  title: "Compare insulin aspart, glargine and degludec",
  position: { x: 0, y: 0 },
  height: 640,
  highlights: [{ id: "h1", category: "highlighted-text", kind: "branch", text: "has no real peak", occurrence: 0, savedByUser: false, noteIds: [] }],
  notes: [{ id: "n1", category: "note", contextExcerpt: "lasts beyond 42 hours", contextOccurrence: 0, text: "Check the lecture: does it say 42 or 48?", position: { x: 792, y: 700 } }],
  messages: [
    { id: "u1", role: "user", content: "Compare insulin aspart, glargine and degludec by onset, peak and duration." },
    {
      id: "a1",
      role: "assistant",
      content: ANSWER,
      suggestedQuestions: {
        followUps: ["How does chemical modification change insulin speed?", "Why does glargine precipitate at the injection site?"],
        branches: ["How does degludec form multi-hexamers?"],
        newThreads: ["The history and mechanism of CRISPR-Cas9 gene editing", "Pharmacogenomics and personalized medicine"],
      },
      updatesComposerSuggestions: true,
    },
  ],
});

const BRANCH = card({
  id: "branch",
  title: "Why glargine has no peak",
  parentId: "root",
  contextExcerpt: "has no real peak",
  contextOccurrence: 0,
  position: { x: 880, y: 0 },
  height: 420,
  messages: [
    { id: "u2", role: "user", content: "Why?", contextExcerpt: "has no real peak", contextOccurrence: 0 },
    { id: "a2", role: "assistant", content: "Glargine is soluble at the acidic pH of the vial and **precipitates** at the neutral pH under the skin, so it dissolves back slowly and evenly over the day.", suggestedQuestions: { followUps: ["What is the pH of the glargine vial?"], branches: [], newThreads: [] } },
  ],
});

const STREAMING = card({
  id: "streaming",
  title: "New thread",
  parentId: "root",
  position: { x: 0, y: 900 },
  status: "streaming",
  messages: [
    { id: "u3", role: "user", content: "Which one would a shift worker with irregular meals prefer?" },
    { id: "a3", role: "assistant", content: "", isStreaming: true, pending: true },
  ],
});

// 🔴 A REAL SOURCE, SO THE READING PANEL HAS SOMETHING TO OPEN. Markdown rather than a PDF because
// the harness makes no network calls: this text is the whole document, held in the fixture, and the
// panel renders it through the same `DocumentReader` a filed PDF goes through.
const LECTURE = [
  "# Insulin analogues, lecture 9",
  "",
  "## Why the molecule is changed at all",
  "",
  "Human insulin forms hexamers in the vial. Those hexamers have to come apart before the",
  "hormone can cross into the blood, and that unpacking is what makes plain human insulin slow",
  "to start. Every analogue on this page is an attempt to change how fast that happens.",
  "",
  "## Rapid acting",
  "",
  "Insulin aspart swaps one proline for aspartic acid at position B28. The substituted residue",
  "repels its neighbour, the hexamer falls apart sooner, and absorption starts in 10 to 20",
  "minutes. It is taken with a meal.",
  "",
  "## Long acting",
  "",
  "Insulin glargine is soluble at the acidic pH of the vial and precipitates at the neutral pH",
  "under the skin. The precipitate dissolves back slowly and evenly, which is why glargine has",
  "no real peak.",
  "",
  "Insulin degludec forms long multi-hexamer chains at the injection site. The chains release",
  "single molecules one at a time, and the effect lasts beyond 42 hours.",
].join("\n");

const SOURCE: BoardSource = {
  content: LECTURE,
  id: "src-lecture",
  name: "Lecture 9 insulin analogues.md",
  position: { x: 880, y: 520 },
  previewUrls: [],
  status: "ready",
  type: "document",
  width: 640,
};

// 🔴 A THREAD, NOT A LONE NOTE. What the owner asked for is the CONVERSATION inside the document,
// so the fixture carries a question, Nemesis's answer and a follow-up already answered — which is
// what the card in the panel has to be reviewed as. No model call: these are stored rows.
const ANNOTATIONS: BoardAnnotation[] = [
  {
    anchor: { quote: "precipitates at the neutral pH under the skin", x: 0.42, y: 0.62 },
    author: "learner",
    body: "Why does a lower pH keep it dissolved?",
    createdAt: "2026-09-04T09:00:00.000Z",
    id: "ann-1",
    parentId: null,
    resolvedAt: null,
    sourceId: SOURCE.id,
    unit: 1,
  },
  {
    anchor: {},
    author: "nemesis",
    body:
      "Glargine carries two extra arginines, which shift the pH at which the molecule is least soluble up to about 6.7. In the vial at pH 4 it sits well below that point and stays in solution. Injected into tissue at pH 7.4 it is pushed past it, so the molecule comes out of solution and forms a small depot that redissolves over the day.",
    createdAt: "2026-09-04T09:00:20.000Z",
    id: "ann-1-a",
    parentId: "ann-1",
    resolvedAt: null,
    sourceId: SOURCE.id,
    unit: 1,
  },
  {
    anchor: {},
    author: "learner",
    body: "So is the depot the same thing as a peak?",
    createdAt: "2026-09-04T09:01:00.000Z",
    id: "ann-1-b",
    parentId: "ann-1",
    resolvedAt: null,
    sourceId: SOURCE.id,
    unit: 1,
  },
  {
    anchor: {},
    author: "nemesis",
    body:
      "No. A peak is a moment when a lot of hormone arrives at once. The depot is the opposite: it hands over a little at a time, which is exactly why glargine's curve is flat.",
    createdAt: "2026-09-04T09:01:30.000Z",
    id: "ann-1-c",
    parentId: "ann-1",
    resolvedAt: null,
    sourceId: SOURCE.id,
    unit: 1,
  },
];

const SEED: BoardState = {
  annotations: ANNOTATIONS,
  cards: [ROOT, BRANCH, STREAMING],
  outputs: [],
  selectedSourceIds: [],
  sources: [SOURCE],
  useWebSearch: false,
};

export default function BoardPreview() {
  const empty = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("empty") === "1";
  return (
    <WorkspacePreviewProvider value={{ email: "preview@nemesis.local" }}>
      <WorkspaceShell>
        <BoardPage boardId={null} openSourceId={empty ? undefined : SOURCE.id} seed={empty ? undefined : SEED} toggle />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
