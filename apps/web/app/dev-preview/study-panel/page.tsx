"use client";

// DEV-ONLY PREVIEW — the two study surfaces, docked beside a conversation.
//
// 🔴🔴 THE RULE THIS BOARD EXISTS FOR: *a capability with no panel here only ever gets judged from
// its source.* This repo has paid for that twice — electron arrows shipped at nearly twice the
// weight of a bond, and `highlight` shipped painting every atom in a molecule green — and both were
// argued as correct from a diff. The check and the review are now DOCKED rather than full screen
// (owner, 2026-08-30), which is a geometry change, and a geometry change is exactly the class of
// thing that reads fine in code and wrong on screen.
//
// 🔴 BOTH ARE MOUNTED FOR REAL. `StudyPanel` is the shipped panel, `CanvasCheck` is the shipped
// check running a real `TestRun`, and `ReviewSession surface="bare"` is the shipped review screen
// with its dialog dropped. Nothing here is a mock-up, so what paints here paints in a canvas.
//
// 🔴 THE CONVERSATION BEHIND IT IS FAKE ON PURPOSE, and it is the point of the board rather than
// scenery: the whole argument for docking is that the thread stays readable next to the thing you
// are being asked about. A board that showed the panel alone could not show that.

import { useState } from "react";

import { CanvasCheck, CheckCard } from "@/components/workspace/learn/canvas-check";
import { StudyPanel } from "@/components/workspace/learn/study-panel";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { DeckReview } from "@/components/workspace/study/deck-review";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import type { TestRun } from "@/lib/learn/test-run";

const NOW = "2026-08-30T09:00:00.000Z";

const RUN: TestRun = {
  questions: [
    {
      objectiveIdentityKey: "obj-rate-order",
      options: [
        { correct: false, ground: { kind: "neighbouring_class" }, text: "It doubles" },
        { correct: true, text: "It quadruples" },
        { correct: false, ground: { kind: "neighbouring_class" }, text: "It stays the same" },
        { correct: false, ground: { belief: "Rate is inversely proportional to concentration", kind: "held_misconception" }, text: "It halves" },
      ],
      prompt: "In a second-order reaction, what happens to the rate when you double the concentration?",
    },
    {
      objectiveIdentityKey: "obj-catalyst",
      options: [
        { correct: true, text: "It lowers the activation energy" },
        { correct: false, ground: { belief: "A catalyst changes where the equilibrium sits", kind: "held_misconception" }, text: "It makes the products more stable" },
        { correct: false, ground: { kind: "neighbouring_class" }, text: "It shifts the equilibrium toward products" },
        { correct: false, ground: { belief: "A catalyst works by heating the mixture", kind: "held_misconception" }, text: "It raises the temperature of the mixture" },
      ],
      prompt: "What does a catalyst actually change?",
    },
    {
      objectiveIdentityKey: "obj-half-life",
      options: [
        { correct: false, ground: { kind: "neighbouring_class" }, text: "It doubles" },
        { correct: false, ground: { belief: "Rate is inversely proportional to concentration", kind: "held_misconception" }, text: "It halves" },
        { correct: true, text: "It does not change" },
        { correct: false, ground: { kind: "neighbouring_class" }, text: "It depends on the starting concentration" },
      ],
      prompt: "For a first-order reaction, what happens to the half-life as the reaction proceeds?",
    },
  ],
};

/** 🔴 THE STORE'S OWN PREVIEW DECK, NOT A LOCAL ONE. `DeckReview` loads through `useCloudStudy`,
 *  and in the preview lane that returns a fixed in-memory collection. A deck built here would
 *  render and then fail to grade, which is the half of the screen most worth checking.
 *  `preview-mechanics` is an engineering deck, chosen because this product is field-agnostic and a
 *  board that only ever shows one subject quietly teaches the wrong thing about the product. */
const PREVIEW_DECK_ID = "preview-mechanics";

/** A stand-in for the turn that made the thing, so the panel has something to sit beside. */
function Thread({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4 px-6 pt-10 pb-40">
      <p className="m-0 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)">
        A second-order reaction depends on concentration twice over, so doubling what you put in does
        not double the rate: it quadruples it. That single fact is what most of the exam questions on
        this topic are testing, dressed up four different ways.
      </p>
      <p className="m-0 text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)">
        The half-life behaves differently for each order, and that is the second thing worth holding
        on to. First order is the odd one out: its half-life never changes.
      </p>
      {children}
      <p className="m-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
        This paragraph is here so you can see whether the thread is still readable with the panel
        open, which is the whole argument for docking rather than covering.
      </p>
    </div>
  );
}

export default function StudyPanelPreview() {
  const [showing, setShowing] = useState<"check" | "deck">("check");
  const [open, setOpen] = useState(true);
  const [account, setAccount] = useState<string | null>(null);

  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <Thread>
          <div className="flex gap-2">
            {(["check", "deck"] as const).map((which) => (
              <button
                className="rounded-full bg-transparent px-3 py-1 text-[length:var(--canvas-text-meta)] ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) aria-pressed:bg-(--ui-action) aria-pressed:text-(--ui-action-glyph)"
                aria-pressed={showing === which}
                key={which}
                onClick={() => {
                  setShowing(which);
                  setOpen(true);
                }}
                type="button"
              >
                {which === "check" ? "Check" : "Flashcards"}
              </button>
            ))}
          </div>
          <CheckCard onOpen={() => setOpen(true)} open={open} run={RUN} />
          {account && (
            <pre className="m-0 whitespace-pre-wrap rounded-xl p-3 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary)">
              {account}
            </pre>
          )}
        </Thread>

        {/* 🔴 THE DECK GOES THROUGH ITS REAL DOOR. `DeckReview` owns the panel for flashcards, so
            wrapping a review in `StudyPanel` here would be checking a copy of the shipped path. */}
        {showing === "deck" && <DeckReview deckId={PREVIEW_DECK_ID} onClose={() => setShowing("check")} />}
        <StudyPanel
          crumb="Check"
          onClose={() => setOpen(false)}
          open={open && showing === "check"}
          title="Reaction kinetics"
        >
          <div className="px-4 py-3">
            <CanvasCheck onDismiss={() => setOpen(false)} onFinished={setAccount} run={RUN} />
          </div>
        </StudyPanel>
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
