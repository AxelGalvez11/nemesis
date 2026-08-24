"use client";

// One way to hand the learner their .pptx, shared by the canvas's Outputs tab and the
// Library. The deck is REBUILT from its stored plan at click time — the file is a
// deterministic function of plan + theme (see deck-pptx.ts), so nothing was ever uploaded
// and there is nothing to fetch. That is also why switching theme is instant: the same plan
// simply comes out wearing different clothes.

import type { DeckPlan } from "./deck-plan";

export async function downloadDeck(plan: DeckPlan, title: string, themeId?: string | null): Promise<void> {
  const { buildDeckPptx } = await import("./deck-pptx");
  const blob = (await buildDeckPptx(plan, { credit: "Made with Nemesis", themeId })) as Blob;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "slides"}.pptx`;
  anchor.click();
  // Revoked on a delay: revoking synchronously races the browser actually starting the
  // download in some engines, and a lost race is a 0-byte file with no error.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
