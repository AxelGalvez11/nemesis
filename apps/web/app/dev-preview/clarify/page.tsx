"use client";

// DEV-ONLY PREVIEW — the clarification card, driven by the real parser and the real composer.
//
// 🔴 NOTHING HERE DECIDES WHEN TO ASK. The question below is a hand-written envelope fed through
// `readClarifyQuestion`, the same function that reads DeepSeek's reply, so what paints is what a
// real model reply would paint — including the refusals. Change `RAW` to a one-option question or
// a blank prompt and the card correctly disappears.
//
// 🔴 THE COMPOSER IS HERE BECAUSE IT IS PART OF THE ANSWER SURFACE, NOT DECORATION. `composerIntent`
// routes a typed submission to the pending question, so the box at the bottom and the Other row
// inside the card reach the same handler. A preview with only the card would hide the half of this
// feature that was most likely to be wrong.

import { useState } from "react";

import { CanvasClarification } from "@/components/workspace/learn/canvas-clarification";
import { CanvasComposer } from "@/components/workspace/learn/canvas-composer";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { readClarifyAnswer, readClarifyQuestion } from "@/lib/learn/clarify-question";
import { composerIntent } from "@/lib/learn/composer-intent";

const RAW = {
  allowOther: true,
  id: "biology-scope",
  options: [
    {
      description: "Cells, genetics, evolution and ecology, the way a first year covers them.",
      id: "general",
      label: "General biology",
    },
    {
      description: "DNA, proteins and how a cell actually runs, in mechanism-level detail.",
      id: "cell",
      label: "Cell and molecular",
    },
    {
      description: "Anatomy and physiology, organised around the body's systems.",
      id: "human",
      label: "Human biology",
    },
  ],
  prompt: "Which kind of biology course do you want?",
};

export default function ClarifyPreviewPage() {
  const question = readClarifyQuestion(RAW);
  const [answered, setAnswered] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pending = question && !answered && !dismissed ? question : null;

  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "sources_attached",
    policyHasContent: false,
    sink: pending ? { kind: "clarify", question: pending } : { kind: "none" },
  });

  const record = (text: string) => {
    if (!question) return;
    const answer = readClarifyAnswer(question, text);
    if (!answer) return;
    setAnswered(
      answer.kind === "option"
        ? `option "${answer.label}" (${answer.optionId})`
        : `written "${answer.text}"`,
    );
  };

  // 🔴 THE REAL SHELL, NOT A BARE PAGE — the same wrapper `dev-preview/drill` uses. Outside
  // `[data-workspace]` this app's stylesheet repaints every button blue, so a preview without it
  // shows a card nobody will ever see and hides the one that ships.
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <main
          className="relative h-full min-h-0 bg-(--ui-bg-editor)"
          style={{ ["--canvas-column" as string]: "680px" }}
        >
          <div className="relative h-full overflow-y-auto pt-[72px]">
            {/* 🔴 `pb-40` IS THE COMPOSER'S HEIGHT, THE SAME NUMBER THE REAL CANVAS USES. Without
                it the card's own Submit sits underneath the composer, which is precisely the defect
                this preview caught. */}
            <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-6 pt-4 pb-40">
      <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
        Nemesis said: “One thing first, so I build the right course.”
      </p>

      {pending && (
        <CanvasClarification
          onAnswer={record}
          onDismiss={() => setDismissed(true)}
          question={pending}
        />
      )}

      {answered && (
        <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-primary)">
          Answered: {answered}. The turn would resume here.
        </p>
      )}
      {dismissed && !answered && (
        <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">
          Dismissed. The turn is dropped, not guessed at.
        </p>
      )}

      <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
        Composer intent right now: <code>{intent.kind}</code> — this is the value that decides
        whether typing below answers the question or starts a new canvas.
      </p>

            </div>
          </div>

          <CanvasComposer
            busy={false}
            intent={intent}
            onAnswer={() => undefined}
            onAsk={() => undefined}
            onClarify={record}
            onClearSelection={() => undefined}
            onFiles={() => undefined}
            onStart={() => undefined}
            selected={[]}
          />
        </main>
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
