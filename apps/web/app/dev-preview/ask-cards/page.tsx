"use client";

// DEV-ONLY PREVIEW — the two cards Nemesis puts IN the conversation when it needs something back.
//
// 🔴🔴🔴 THE QUIZ CARD HAD NO PANEL, AND THIS REPO HAS PAID FOR THAT TWICE ALREADY. `visual-cards`
// carries the note in its own source: *a capability with no panel here only ever gets judged from
// its source.* The electron arrows shipped at nearly twice the weight of a bond that way, and
// `highlight` shipped painting every atom in a molecule green that way. `CanvasCheck` is the surface
// a learner is MARKED against and until now there was nowhere to look at it.
//
// 🔴 BOTH CARDS ARE MOUNTED FOR REAL, not mocked up. The clarification runs through
// `readClarifyQuestion`, the same reader that parses a live model reply; the check is a real
// `TestRun`. So what paints here is what paints in a conversation, including the refusals.
//
// 🔴 THEY SHARE ONE SHELL AND THAT IS THE POINT OF SEEING THEM TOGETHER: `canvas-swap mt-5
// rounded-2xl p-4 ring-1`. Two cards that ask the learner for something should not look like two
// different products, and a change to one that does not reach the other shows up here first.

import { useState } from "react";

import { CanvasCheck } from "@/components/workspace/learn/canvas-check";
import { CanvasClarification } from "@/components/workspace/learn/canvas-clarification";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { readClarifyQuestion } from "@/lib/learn/clarify-question";
import type { TestRun } from "@/lib/learn/test-run";

/** A question in the shape a model reply carries it, so the real reader has something to refuse. */
const RAW_CLARIFY = {
  allowOther: true,
  id: "kinetics-scope",
  options: [
    {
      description: "Rate laws, half-lives and the Arrhenius equation, as a first course covers them.",
      id: "rates",
      label: "Reaction rates",
    },
    {
      description: "Catalysis, intermediates and how a mechanism is worked out from data.",
      id: "mechanism",
      label: "Mechanisms",
    },
    {
      description: "Enzyme kinetics: Michaelis-Menten, inhibition, and what the constants mean.",
      id: "enzyme",
      label: "Enzyme kinetics",
    },
  ],
  prompt: "One thing first, so I aim this right. Which part of kinetics are you working on?",
};

/** A real run, in the shape `buildTestRun` produces. */
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

export default function AskCardsPreview() {
  const [answered, setAnswered] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<{ ask?: boolean; check?: boolean }>({});
  const pending = readClarifyQuestion(RAW_CLARIFY);

  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-10 px-6 pt-8 pb-40">
          <header className="flex flex-col gap-1">
            <h1 className="text-[length:var(--canvas-text-body)] font-medium text-(--ui-text-primary)">
              The two cards that ask the learner for something
            </h1>
            <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary)">
              Both mounted for real, at the width they get in a conversation. They share one shell,
              which is why they are worth looking at side by side.
            </p>
          </header>

          <section className="flex flex-col gap-2">
            <p className="text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
              Clarification &middot; Nemesis needs one thing before it can answer
            </p>
            <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-primary)">
              Nemesis said: &ldquo;Happy to go through kinetics with you.&rdquo;
            </p>
            {pending && !dismissed.ask && (
              <CanvasClarification
                onAnswer={setAnswered}
                onDismiss={() => setDismissed((was) => ({ ...was, ask: true }))}
                question={pending}
              />
            )}
            {answered && (
              <p className="mt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary)">
                Answered &ldquo;{answered}&rdquo;. The turn resumes from here.
              </p>
            )}
            {dismissed.ask && (
              <p className="mt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary)">
                Closed. Nothing is guessed on the learner&rsquo;s behalf; the turn is dropped.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
              Check &middot; three questions, one tap each
            </p>
            <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-primary)">
              Nemesis said: &ldquo;Let&rsquo;s see what stuck.&rdquo;
            </p>
            {!dismissed.check && !account && (
              <CanvasCheck
                onDismiss={() => setDismissed((was) => ({ ...was, check: true }))}
                onFinished={setAccount}
                run={RUN}
              />
            )}
            {account && (
              // 🔴 THERE IS NO RESULTS SCREEN, BY OWNER'S ORDER (2026-08-24). What the card hands
              // back is an ACCOUNT in words, which the conversation sends as the learner's turn.
              // Printing it here is the preview standing in for that next turn.
              <pre className="mt-2 whitespace-pre-wrap rounded-xl p-3 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary)">
                {account}
              </pre>
            )}
            {dismissed.check && (
              <p className="mt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary)">
                Closed. Nothing is scored and nothing is kept.
              </p>
            )}
          </section>
        </div>
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
