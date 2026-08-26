"use client";

// DEV-ONLY PREVIEW — the quiz card, which had no harness of its own.
//
// 🔴 IT EXISTS BECAUSE THE CARD IS MEASURED AGAINST A REFERENCE. Owner 2026-08-26: *"they should
// both bring up a proper component like in Claude code or like in Claude dot AI did"*, with a
// screenshot. Numbers read off a live Learning-guidance quiz at a 1470px viewport — card radius 8,
// 28px padding, question 22/500 on a 28px line, option rows 46px tall and 8px apart, numbered
// progress — and a spec written from a measurement can only stay honest if somebody can measure it
// back without a signed-in account and a model call.
//
// 🔴 `data-workspace` OR THE GLOBAL BUTTON RULE LIES TO YOU. `globals.css` carries
// `button:where(:not([data-workspace] *)) { background: var(--acid) }`, so every option row would
// render as a filled acid pill here and nowhere else.

import { useState } from "react";

import { CanvasCheck } from "@/components/workspace/learn/canvas-check";
import type { TestRun } from "@/lib/learn/test-run";

const RUN: TestRun = {
  questions: [
    {
      objectiveIdentityKey: "k1:recall",
      prompt: "Which insulin has essentially no pronounced peak, giving a relatively flat 24-hour profile?",
      options: [
        { text: "NPH (isophane)" },
        { text: "Insulin lispro" },
        { text: "Insulin glargine", correct: true },
        { text: "Regular insulin" },
      ],
    },
    {
      objectiveIdentityKey: "k2:explain",
      prompt: "A patient on metformin alone has a blood sugar of 70 mg/dL. Why is severe hypoglycaemia unlikely?",
      options: [
        { text: "It does not stimulate insulin release", correct: true },
        { text: "It is cleared renally" },
        { text: "It blocks glucose reabsorption" },
      ],
    },
    {
      objectiveIdentityKey: "k3:predict",
      prompt: "Which class would you expect to cause genitourinary fungal infections, and why?",
      options: [
        { text: "SGLT2 inhibitors, because glucose ends up in the urine", correct: true },
        { text: "Sulfonylureas, because insulin rises" },
        { text: "DPP-4 inhibitors, because incretins persist" },
        { text: "Biguanides, because lactate accumulates" },
      ],
    },
  ],
} as TestRun;

export default function CheckPreviewPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[822px] flex-col gap-6 px-6 py-16" data-workspace>
      <div>
        <h1 className="text-[length:var(--canvas-text-body)] font-medium text-(--ui-text-primary)">The quiz card</h1>
        <p className="mt-1 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
          One question at a time. A tap answers and advances; the numbers go back. Nothing is marked
          until the last tap, which hands the whole account to the conversation.
        </p>
      </div>

      {open ? (
        <CanvasCheck
          onDismiss={() => setOpen(false)}
          onFinished={(said) => {
            setAccount(said);
            setOpen(false);
          }}
          run={RUN}
        />
      ) : (
        <button
          className="self-start rounded-[8px] px-3 py-1.5 text-[length:var(--canvas-text-small)] ring-1 ring-(--ui-stroke-tertiary)"
          onClick={() => {
            setAccount(null);
            setOpen(true);
          }}
          type="button"
        >
          Run it again
        </button>
      )}

      {account && (
        <pre className="whitespace-pre-wrap rounded-[8px] bg-(--ui-bg-quaternary) p-4 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary)">
          {account}
        </pre>
      )}
    </main>
  );
}
