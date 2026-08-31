"use client";

// The card a freshly written practice test arrives on.
//
// 🔴 THE CONVERSATION IS WHERE RESULTS LIVE (owner 2026-08-31, choosing this over reviving a
// Tests page): when the model decides a paper is the right move and makes one, the paper lands
// HERE, under the sentence that announced it, and the sitting opens fullscreen from this card.
// Nothing is filed onto a page the sidebar does not reach.
//
// 🔴 A CARD, ON A SURFACE THAT BANS CARDS, for ConfirmCard's reason: this is a doorway to a
// different activity, not another line of the answer, and it must not read as prose.
//
// 🔴 SAME ONE-ANSWER LIFETIME AS THE CONFIRMATION CARD. It rides the aside, so the next turn
// replaces it together with the sentence it belongs to. The paper itself is durable (a study
// artifact); only the doorway is transient — ask and the model can hand it back.

import { useState } from "react";

import { TakeTestDialog } from "@/components/workspace/study/study-artifact-dialogs";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";
import type { ProducedTest } from "@/lib/learn/canvas-tools";

export function TestReadyCard({ produced }: { produced: ProducedTest }) {
  const study = useCloudStudy();
  const [open, setOpen] = useState(false);
  // The tool's write triggers a store refresh; until it lands the button waits
  // rather than opening a dialog over an artifact that is not there yet.
  const artifact = study.artifacts.find((row) => row.id === produced.artifactId) ?? null;

  return (
    <>
      <div
        aria-label="A practice test is ready"
        className="mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-3"
        role="group"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="m-0 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{produced.title}</p>
          <p className="m-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
            {artifact ? "Ready when you are. It grades as you go." : "Filing it…"}
          </p>
        </div>
        <button
          className="flex h-[30px] shrink-0 items-center justify-center rounded-[6px] bg-(--ui-text-primary) px-3 text-[length:var(--canvas-text-meta)] font-medium text-(--ui-bg-editor) transition-opacity hover:opacity-85 disabled:opacity-50"
          disabled={!artifact}
          onClick={() => setOpen(true)}
          type="button"
        >
          Sit it
        </button>
      </div>
      {open && artifact && <TakeTestDialog artifact={artifact} onClose={() => setOpen(false)} />}
    </>
  );
}
