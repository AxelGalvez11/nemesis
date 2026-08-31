"use client";

// DEV-ONLY PREVIEW — the association drill, driven by the real policy and the real composer.
//
// The point of this harness is that NOTHING here decides pedagogy. It holds the attempt list
// and asks `nextDrillStep` what to do; every rule — grouping, spacing, when the scaffold comes
// away, when the reverse direction opens, when a confusion interrupts — lives in the pure
// module and is exercised exactly as it will be in the canvas.
//
// The set is deliberately two neighbouring drug classes, because that is the case the brief
// gives for confusion detection: answer losartan with Diovan twice and the drill should stop
// and contrast losartan against valsartan. Type the wrong brand twice to see it.

import { useMemo, useState } from "react";

import { CanvasComposer } from "@/components/workspace/learn/canvas-composer";
import {
  AssociationDrillView,
  drillExpected,
  drillPlaceholder,
} from "@/components/workspace/learn/association-drill-view";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { groupKey, isCorrect, nextDrillStep, remainingCount } from "@/lib/learn/association-drill";
import type { AssociationAttempt, AssociationPair } from "@/lib/learn/knowledge-types";

const PAIRS: AssociationPair[] = [
  { id: "p1", left: "lisinopril", right: "Zestril", groupLabel: "ACE inhibitors" },
  { id: "p2", left: "enalapril", right: "Vasotec", groupLabel: "ACE inhibitors" },
  { id: "p3", left: "benazepril", right: "Lotensin", groupLabel: "ACE inhibitors" },
  { id: "p4", left: "losartan", right: "Cozaar", groupLabel: "ARBs" },
  { id: "p5", left: "valsartan", right: "Diovan", groupLabel: "ARBs" },
];

export default function DrillPreviewPage() {
  const [attempts, setAttempts] = useState<AssociationAttempt[]>([]);
  const [encoded, setEncoded] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<{ correct: boolean; expected: string; said: string } | null>(null);

  // The policy decides everything, including which groups still need reading — the harness only
  // remembers WHICH sets have been read and hands that back.
  const step = useMemo(() => nextDrillStep(PAIRS, attempts, encoded), [attempts, encoded]);

  const record = (said: string, admitted: boolean) => {
    if (!step || step.kind === "encode") return;
    const pair = step.pairs[0];
    if (!pair) return;
    const expected = drillExpected(step);
    const correct = !admitted && isCorrect(said, expected);
    setAttempts((current) => [
      ...current,
      {
        pairId: pair.id,
        direction: step.direction,
        said,
        correct,
        ...(admitted ? { admitted: true } : {}),
        at: new Date().toISOString(),
      },
    ]);
    setLastResult({ correct, expected, said });
  };

  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <main
          className="relative h-full min-h-0 bg-(--ui-bg-editor)"
          style={{ ["--canvas-column" as string]: "822px" }}
        >
          <div className="relative h-full overflow-y-auto pt-[72px]">
            {step ? (
              <AssociationDrillView
                lastResult={lastResult}
                onAdmit={() => record("", true)}
                onEncoded={() => setEncoded((current) => [...current, groupKey(step.pairs)])}
                remaining={remainingCount(PAIRS, attempts)}
                step={step}
              />
            ) : (
              <div className="flex min-h-full items-center justify-center">
                <p className="text-[0.9375rem] text-(--ui-text-secondary)">
                  All five produced in both directions.
                </p>
              </div>
            )}
          </div>

          {/* 🔴 The SAME composer the rest of the canvas uses. The drill has no input of its own. */}
          {step && step.kind !== "encode" && (
            <CanvasComposer
              busy={false}
              onAnswer={(text) => record(text, false)}
              onAsk={() => undefined}
          onClarify={() => undefined}
              onClearSelection={() => undefined}
              onFiles={() => undefined}
              onStart={() => undefined}
              selected={[]}
              // The drill IS a question, so the composer's one meaning here is `answer`. Naming it
              // rather than implying it through props is the whole of composer-intent.ts.
              intent={{
                kind: "answer",
                sink: "policy",
                task: {
                  kind: "question",
                  id: step.pairs[0]?.id ?? "",
                  prompt: "",
                  placeholder: drillPlaceholder(step),
                  index: 0,
                  total: 1,
                  answered: false,
                },
              }}
            />
          )}
        </main>
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
