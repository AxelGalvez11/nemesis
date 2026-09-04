"use client";

// DEV-ONLY PREVIEW — the spatial Canvas with fixture cards: a root card with an answer, key terms,
// suggestions and a branch beside it, plus a note. Nothing is signed in and nothing saves; the
// real components render exactly as shipped. Measure the board here, never on the real route.

import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { BoardPage } from "@/components/workspace/board/board-page";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import type { BoardCard, BoardOutputCard, BoardSource, BoardState } from "@/lib/board/board-model";
import { CHECK_WIDTH, OUTPUT_WIDTH } from "@/lib/board/board-layout";

const ANSWER =
  "Insulin analogues are engineered to change **how quickly** insulin is absorbed after an injection.\n\n" +
  "- [Insulin aspart](#concept \"A rapid-acting analogue that starts working within about 15 minutes of a meal.\") starts in 10 to 20 minutes and peaks in 1 to 3 hours.\n" +
  "- [Insulin glargine](#concept \"A long-acting basal analogue with a nearly flat profile over 24 hours.\") starts in 1 to 2 hours and has no real peak.\n" +
  "- [Insulin degludec](#concept \"An ultra-long-acting basal analogue whose effect lasts beyond 42 hours.\") starts in 30 to 60 minutes and lasts beyond 42 hours.\n\n" +
  "All three are injectable prescription medicines used to manage diabetes mellitus, and the choice between them turns on whether the learner needs mealtime cover or a steady background level.\n\n" +
  // 🔴 A DESIGNED FIGURE, WHICH IS WHAT A COMPARISON WANTS (owner 2026-09-04). Measure it here.
  "```visual\n" +
  JSON.stringify({
    footer: { label: "All three", text: "Injected under the skin for diabetes mellitus" },
    items: [
      { label: "Insulin aspart", lines: ["Rapid acting", "10 to 20 minutes", "1 to 3 hours", "3 to 5 hours"] },
      { label: "Insulin glargine", lines: ["Long acting", "1 to 2 hours", "None, flat profile", "24 hours"] },
      { label: "Insulin degludec", lines: ["Ultra long acting", "30 to 60 minutes", "None", "Beyond 42 hours"] },
    ],
    kind: "comparison",
    rows: ["Class", "Onset", "Peak", "Duration"],
    title: "Onset, peak and duration",
  }) +
  "\n```";

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
  notes: [{ id: "n1", category: "note", contextExcerpt: "lasts beyond 42 hours", contextOccurrence: 0, text: "Check the lecture: does it say 42 or 48?", position: { x: 500, y: 900 } }],
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
    {
      id: "a2",
      role: "assistant",
      // 🔴 A DRAWING IN THE FIXTURE, BECAUSE THE BOARD CAN DRAW NOW (owner 2026-09-04). The card
      // renders through `AssistantMarkdown`, so a ```mermaid fence is a diagram here exactly as it
      // is in the chat. Measure it on this card.
      content:
        "Glargine is soluble at the acidic pH of the vial and **precipitates** at the neutral pH under the skin, so it dissolves back slowly and evenly over the day.\n\n" +
        "```mermaid\nflowchart TD\n  A[\"Vial at pH 4\"] --> B[\"Injected under the skin\"]\n  B --> C[\"Neutral pH 7.4\"]\n  C --> D[\"Precipitates as a depot\"]\n  D --> E[\"Redissolves slowly, no peak\"]\n```",
      suggestedQuestions: { followUps: ["What is the pH of the glargine vial?"], branches: [], newThreads: [] },
    },
  ],
});

const STREAMING = card({
  id: "streaming",
  title: "New thread",
  parentId: "root",
  position: { x: 0, y: 1400 },
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
  height: 560,
};


// 🔴 A REAL TEST CARD, PLAYABLE IN THE PREVIEW. Owner 2026-09-04: *"it still cannot make tests (it
// drops tests in chat)"*. The run is a fixture, so no model call is made; the card is the shipped
// one and the taps behave exactly as they do on a real board.
const CHECK: BoardOutputCard = {
  cardId: ROOT.id,
  createdAt: "2026-09-04T10:00:00.000Z",
  id: "check-1",
  kind: "check",
  position: { x: 0, y: 900 },
  run: {
    questions: [
      {
        objectiveIdentityKey: "chat:0:onset",
        prompt: "A learner injects insulin aspart and eats twenty minutes later. Why does that timing work?",
        options: [
          { text: "Aspart's hexamers come apart sooner, so absorption starts in 10 to 20 minutes", correct: true },
          { text: "Aspart is absorbed through the stomach wall once food arrives", correct: false },
          { text: "Aspart lasts beyond 42 hours, so the timing does not matter", correct: false },
        ],
      },
      {
        objectiveIdentityKey: "chat:1:glargine",
        prompt: "Why does glargine have no real peak?",
        options: [
          { text: "It precipitates under the skin and redissolves slowly and evenly", correct: true },
          { text: "It is given at a much lower dose than the other analogues", correct: false },
          { text: "It binds to albumin and is released when the learner eats", correct: false },
        ],
      },
      {
        objectiveIdentityKey: "chat:2:degludec",
        prompt: "What gives degludec its very long duration?",
        options: [
          { text: "It forms multi-hexamer chains that release single molecules one at a time", correct: true },
          { text: "It is injected into muscle rather than fat", correct: false },
          { text: "It is chemically identical to human insulin", correct: false },
        ],
      },
    ],
  },
  status: "ready",
  topic: "Test me on this",
  width: CHECK_WIDTH,
};

// 🔴 A REAL PDF, SO THE CARD'S READER IS REVIEWED ON A PDF AND NOT ONLY ON MARKDOWN. The harness's
// library fixture `preview-src-conlaw-slides` points at /reader-sample.pdf, and `useBoardReader`
// resolves a source with a `librarySourceId` to its filed original exactly as production does.
const PDF_SOURCE: BoardSource = {
  content: "Constitutional law, slides 1 to 12. The commerce clause and its limits.",
  grounded: {
    excerpts: [{ id: "s2:e1", label: null, text: "The commerce clause and its limits." }],
    id: "s2",
    kind: "pdf",
    librarySourceId: "preview-src-conlaw-slides",
    title: "Constitutional law slides.pdf",
  },
  height: 560,
  id: "src-pdf",
  name: "Constitutional law slides.pdf",
  position: { x: 1600, y: 520 },
  previewUrls: [],
  status: "ready",
  type: "pdf",
  width: 640,
};

// 🔴 A REAL WORD FILE, for the same reason the PDF is here: the card's reader draws a .docx as its
// pages now (`docx-render.ts`), and a card is where the owner reads them (2026-09-04: *"make sure
// any documents can be viewed too"*). Under the PDF, so both formats are in one screen.
const DOCX_SOURCE: BoardSource = {
  content: "Reading a document as a document. One table, no pictures.",
  grounded: {
    excerpts: [{ id: "s3:e1", label: null, text: "Reading a document as a document." }],
    id: "s3",
    kind: "document",
    librarySourceId: "preview-src-brief",
    title: "Reading a document as a document.docx",
  },
  height: 560,
  id: "src-docx",
  name: "Reading a document as a document.docx",
  position: { x: 1600, y: 1150 },
  previewUrls: [],
  status: "ready",
  type: "document",
  width: 640,
};

// 🔴 THE OTHER DELIVERABLE HE NAMED. Owner, 2026-09-04: *"tests and notes retain a box outline
// around them"*. Both are this one component, and the outline turned out to be React Flow styling
// our node because it was registered under its own built-in type name (`board-surface.tsx`), so the
// review needs a made note on the board as well as a test.
const NOTE_OUTPUT: BoardOutputCard = {
  cardId: ROOT.id,
  createdAt: "2026-09-04T10:05:00.000Z",
  id: "note-out",
  kind: "note",
  output: {
    createdAt: "2026-09-04T10:05:00.000Z",
    id: "out-note-1",
    kind: "note",
    markdown: "# The three analogues\n\nAspart starts in 10 to 20 minutes.",
    notePath: "Notes/The three analogues.md",
    title: "The three analogues",
  },
  position: { x: 500, y: 1160 },
  status: "ready",
  topic: "Make me a note on the three analogues",
  width: OUTPUT_WIDTH,
};

const SEED: BoardState = {
  cards: [ROOT, BRANCH, STREAMING],
  outputs: [CHECK, NOTE_OUTPUT],
  selectedSourceIds: [],
  sources: [SOURCE, PDF_SOURCE, DOCX_SOURCE],
  // 🔴 THE HARNESS OPENS ON EVERYTHING. Without a viewport the board lands at 0,0 and half the
  // fixture (the PDF card, the test) is off screen, so a review measures what happened to be
  // visible. Zoomed out enough to hold every card at once.
  viewport: { x: 24, y: 24, zoom: 0.55 },
  useWebSearch: false,
};

// 🔴 AN OLD BOARD, AS SAVED BY THE DESIGN BEFORE DOCUMENTS WERE READERS: `?old=1`. The owner's own
// canvas on 2026-09-04 held three documents in one column at 217, 172 and 325 tall, 8px apart, and
// the first was drawn across the second's title once each opened as a reader. `makeRoomForDocuments`
// (board-layout.ts) is what this scene reviews: every document opens at a readable height and the
// column is still a column. The thread under them is there to be pushed too.
const OLD_SEED: BoardState = {
  cards: [card({ id: "old-thread", title: "Which of these is long acting?", parentId: null, position: { x: 0, y: 470 }, height: 320, messages: [{ id: "u1", role: "user", content: "Which of these is long acting?" }, { id: "a1", role: "assistant", content: "Glargine and degludec." }] })],
  outputs: [],
  selectedSourceIds: [],
  sources: [
    { ...SOURCE, height: 217, id: "old-deck", name: "Status asthmaticus.md", position: { x: 0, y: 0 } },
    { ...SOURCE, height: 172, id: "old-list", name: "Top drugs list.md", position: { x: 0, y: 225 } },
    { ...PDF_SOURCE, height: 325, id: "old-pdf", position: { x: 0, y: 405 } },
  ],
  viewport: { x: 24, y: 24, zoom: 0.4 },
  useWebSearch: false,
};

export default function BoardPreview() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const empty = params?.get("empty") === "1";
  const old = params?.get("old") === "1";
  return (
    <WorkspacePreviewProvider value={{ email: "preview@nemesis.local" }}>
      <WorkspaceShell>
        <BoardPage boardId={null} seed={empty ? undefined : old ? OLD_SEED : SEED} toggle />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
