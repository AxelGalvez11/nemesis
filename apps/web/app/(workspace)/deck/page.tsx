"use client";

// A deck, open. `/deck?c=<canvas>&o=<output>`
//
// 🔴 THE ROUTE IS THE DECK (owner 2026-08-24: HTML is the deck, .pptx is an export). Nothing is
// stored to render this: the canvas holds the PLAN, the learner's remembered choice holds the
// DESIGN, and the slides are composed in the browser. That is also why switching design is
// instant here — it recomposes, it does not re-fetch.
//
// Deliberately NOT a share link yet: this page reads the canvas through the learner's own
// session, so it shows a deck to the person who owns it and nobody else. Sharing a deck with
// someone who has no Nemesis account is a privacy decision about a student's material, and the
// owner has that call to make before any link is handed out.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { DeckDesignPicker, useDeckDesignChoice } from "@/components/workspace/deck/deck-design-picker";
import { DeckView } from "@/components/workspace/deck/deck-view";
import type { DeckPlan } from "@/lib/export/deck-plan";
import type { CanvasOutput } from "@/lib/learn/canvas-model";
import { loadCanvas } from "@/lib/learn/canvas-store";

export default function DeckPage() {
  const params = useSearchParams();
  const router = useRouter();
  const canvasId = params.get("c") ?? "";
  const outputId = params.get("o") ?? "";
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [output, setOutput] = useState<CanvasOutput | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const { choose, designId } = useDeckDesignChoice(output?.assetId ?? output?.id ?? null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!canvasId || !outputId) {
      setState("missing");
      return () => {
        alive = false;
      };
    }
    void (async () => {
      const canvas = await loadCanvas(userId, canvasId);
      const found = canvas?.outputs?.find((entry) => entry.id === outputId || entry.assetId === outputId);
      if (!alive) return;
      setOutput(found ?? null);
      setState(found?.deck ? "ready" : "missing");
    })();
    return () => {
      alive = false;
    };
  }, [canvasId, outputId, userId]);

  if (state !== "ready" || !output?.deck) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
          {state === "loading" ? "Opening your deck…" : "That deck is not here. It may have been deleted."}
        </p>
      </div>
    );
  }

  const plan: DeckPlan = output.deck;
  return (
    <DeckView
      actions={
        <>
          <DeckDesignPicker designId={designId} onPick={choose} sampleTitle={output.title} />
          <button
            className="rounded-lg px-2 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary) disabled:opacity-50"
            disabled={building}
            onClick={() =>
              void (async () => {
                setBuilding(true);
                try {
                  const { downloadDeck } = await import("@/lib/export/deck-download");
                  await downloadDeck(plan, output.title, designId);
                } finally {
                  setBuilding(false);
                }
              })()
            }
            type="button"
          >
            {building ? "Building…" : "Download .pptx"}
          </button>
        </>
      }
      crumb="Library"
      designId={designId}
      // 🔴 BACK IF THERE IS A BACK, THE LIBRARY OTHERWISE. A deck is reached from the shelf, from a
      // canvas, and from a pasted URL; `router.back()` alone does nothing at all on the third,
      // which is the failure mode of every control that changes state and paints nothing.
      onClose={() => (window.history.length > 1 ? router.back() : router.push("/library"))}
      plan={plan}
    />
  );
}
