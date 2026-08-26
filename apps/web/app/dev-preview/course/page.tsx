"use client";

// DEV-ONLY PREVIEW — the Course capability in the real composer: the + menu row, the inline
// chip, and what a submission actually carries.
//
// 🔴 THE POINT IS THE COMPOSITION, NOT THE FLOW. No model is called and no canvas exists; what
// this proves is the part a unit test cannot see and the owner reviews by eye (2026-08-23,
// screenshots of the reference composer): the chip sits INSIDE the input row — icon and name in
// the accent, the text flowing after them — and it clears the moment a submission consumes it.
// The submission log below the header shows the other half: the words and the declaration arrive
// in the SAME call, which is the argument-drop fix made visible.

import { useState } from "react";

import { CanvasComposer } from "@/components/workspace/learn/canvas-composer";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import type { ComposerCapability } from "@/lib/learn/composer-capability";
import { composerIntent } from "@/lib/learn/composer-intent";

export default function CoursePreviewPage() {
  const [capability, setCapability] = useState<ComposerCapability | null>(null);
  const [sent, setSent] = useState<readonly string[]>([]);

  // A fresh canvas with nothing attached — the exact surface the Course capability exists for.
  const intent = composerIntent({
    awaitingAnswer: false,
    canvasState: "empty",
    policyHasContent: false,
    sink: { kind: "none" },
  });

  const record = (text: string, chosen: ComposerCapability | null) =>
    setSent((rows) => [...rows, `“${text}” — capability: ${chosen ?? "none"}`]);

  // 🔴 THE REAL SHELL, NOT A BARE PAGE — same wrapper as `dev-preview/clarify`, same reason:
  // outside `[data-workspace]` this app's stylesheet repaints every button blue.
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <main
          className="relative h-full min-h-0 bg-(--ui-bg-editor)"
          style={{ ["--canvas-column" as string]: "822px" }}
        >
          <div className="relative h-full overflow-y-auto pt-[72px]">
            <div className="mx-auto flex w-full max-w-[822px] flex-col gap-4 px-6 pt-4 pb-40">
              <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                Press + and choose Course. The chip appears in the input row; send clears it.
              </p>
              {sent.map((row, at) => (
                <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-primary)" key={at}>
                  {row}
                </p>
              ))}
            </div>
          </div>

          <CanvasComposer
            busy={false}
            capabilities={["course", "research"]}
            capability={capability}
            intent={intent}
            onAnswer={() => undefined}
            onAsk={record}
            onCapability={setCapability}
            onClarify={() => undefined}
            onClearSelection={() => undefined}
            onFiles={() => undefined}
            onStart={record}
            selected={[]}
          />
        </main>
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
