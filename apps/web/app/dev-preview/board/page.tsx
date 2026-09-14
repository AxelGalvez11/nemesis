"use client";

// DEV-ONLY PREVIEW — the spatial Canvas with fixture cards: a root card with an answer, key terms,
// suggestions and a branch beside it, plus a note. Nothing is signed in and nothing saves; the
// real components render exactly as shipped. Measure the board here, never on the real route.

import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { BoardPage } from "@/components/workspace/board/board-page";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import type { BoardCard, BoardState } from "@/lib/board/board-model";

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

const STUDY_GUIDE =
  "# Insulin analogues: onset, peak, duration\n\n" +
  "## Rapid-acting\n\n" +
  "Insulin aspart starts in 10 to 20 minutes and peaks in 1 to 3 hours. It is taken with meals.\n\n" +
  "## Long-acting\n\n" +
  "Insulin glargine starts in 1 to 2 hours and has no real peak, because it precipitates at the neutral pH under the skin and dissolves back slowly.\n\n" +
  "## Ultra-long-acting\n\n" +
  "Insulin degludec starts in 30 to 60 minutes and lasts beyond 42 hours.\n\n" +
  "| Analogue | Onset | Peak | Duration |\n|---|---|---|---|\n| Aspart | 10 to 20 min | 1 to 3 h | 3 to 5 h |\n| Glargine | 1 to 2 h | none | about 24 h |\n| Degludec | 30 to 60 min | none | over 42 h |";

/** A finished deliverable beside the root card: a document made from the thread, ready to open. */
const OUTPUT = card({
  id: "output",
  kind: "output",
  parentId: "root",
  title: "Insulin analogues: onset, peak, duration",
  position: { x: 880, y: 520 },
  width: 320,
  outputKind: "document",
  outputStatus: "ready",
  output: { createdAt: "2026-09-03T10:00:00.000Z", id: "o1", kind: "document", markdown: STUDY_GUIDE, title: "Insulin analogues: onset, peak, duration" },
  messages: [],
});

/** A deliverable still being made (`?making=1`): the busy face, which a real make shows for the
 *  seconds a maker takes and which the fixture would otherwise never hold still for. */
const MAKING = card({
  id: "making",
  kind: "output",
  parentId: "branch",
  title: "Making flashcards",
  position: { x: 1680, y: 0 },
  width: 320,
  status: "streaming",
  outputKind: "flashcards",
  outputStatus: "making",
  messages: [],
});

const SEED: BoardState = { cards: [ROOT, BRANCH, STREAMING, OUTPUT], sources: [], selectedSourceIds: [], useWebSearch: true };

export default function BoardPreview() {
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const empty = search?.get("empty") === "1";
  const making = search?.get("making") === "1";
  const seed = empty ? undefined : making ? { ...SEED, cards: [...SEED.cards, MAKING] } : SEED;
  return (
    <WorkspacePreviewProvider value={{ email: "preview@nemesis.local" }}>
      <WorkspaceShell>
        <BoardPage boardId={null} seed={seed} toggle />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
