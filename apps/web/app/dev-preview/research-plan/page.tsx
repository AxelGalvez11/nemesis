"use client";

// The Deep research plan card, on its own, so it can be looked at without a live run.
//
// The real one appears after a declared Deep research submission has been planned: one model call,
// no searches, nothing spent. Everything metered waits behind Start.

import { useState } from "react";

import { ResearchPlanCard } from "@/components/workspace/learn/research-plan-card";

const PLAN = [
  "What are the three categories of activity Congress may regulate under the commerce power?",
  "What did United States v. Lopez decide, and on what reasoning?",
  "What did United States v. Morrison add to the Lopez test?",
  "How have lower courts applied the substantial effects test since 2000?",
  "Where do commentators disagree about the limits of the doctrine?",
];

export default function ResearchPlanPreview() {
  const [state, setState] = useState<"idle" | "starting" | "started" | "cancelled">("idle");

  return (
    // 🔴 `data-workspace` OR THE GLOBAL BUTTON RULE LIES TO YOU. globals.css carries
    // `button:where(:not([data-workspace] *)) { background: var(--acid) }`, so on a bare preview
    // page every button renders as the same filled pill — which is exactly what this preview showed
    // me first time, and I nearly "fixed" a card that was fine. The real canvas is inside the
    // stamp; the preview has to be too, or it is not previewing the same thing.
    <main data-workspace className="mx-auto grid min-h-dvh max-w-(--canvas-column) content-start gap-6 px-6 py-16">
      <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
        The plan a declared Deep research submission shows before it spends anything. Start runs it;
        Cancel throws it away, and nothing was spent either way.
      </p>
      {state === "started" ? (
        <p className="text-(--ui-text-primary)">Started. In the real canvas the run begins here and the card goes.</p>
      ) : state === "cancelled" ? (
        <p className="text-(--ui-text-primary)">Cancelled. Nothing was spent.</p>
      ) : (
        <ResearchPlanCard
          onCancel={() => setState("cancelled")}
          onStart={() => {
            setState("starting");
            window.setTimeout(() => setState("started"), 600);
          }}
          question="How has the commerce power narrowed since 1995?"
          starting={state === "starting"}
          subQuestions={PLAN}
        />
      )}
    </main>
  );
}
