"use client";

// One way to hand the learner their .pptx, shared by the canvas's Outputs tab and the
// Library. The deck is REBUILT from its stored plan at click time — the file is a
// deterministic function of plan + design (see deck-pptx.ts), so nothing was ever uploaded
// and there is nothing to fetch. That is also why switching design is instant: the same plan
// simply comes out wearing different clothes.

import type { DeckPlan } from "./deck-plan";

/**
 * The plan with every slide's chemistry drawn and filed as a figure.
 *
 * 🔴🔴 A STRUCTURE BECOMES A FIGURE, WHICH IS WHY NOTHING DOWNSTREAM CHANGED. `deck-compose.ts`
 * already knows how to place a picture with a caption beside a slide's points, and `deck-pptx.ts`
 * already knows how to inline one — so a molecule joins `plan.figures` and the slide points at it
 * by number, exactly as a diagram from the learner's own PDF does. A second picture lane would have
 * meant a second layout, a second caption rule and a second thing to get wrong.
 *
 * 🔴 APPENDED AFTER THE LEARNER'S OWN, NEVER MIXED IN. The model chose its `figure` numbers against
 * the list it was shown; inserting ahead of them would silently repoint every one.
 *
 * 🔴 ONE FAILED DRAWING COSTS ONE FRAME. `structurePng` returns null rather than throwing, and a
 * slide whose molecule would not draw keeps its points — the same bargain a figure whose signature
 * expired already makes.
 */
export async function withStructures(plan: DeckPlan): Promise<DeckPlan> {
  const drawn = plan.slides.filter((slide) => slide.structure);
  if (!drawn.length) return plan;
  const { structurePng } = await import("./structure-image");

  const figures = [...plan.figures];
  const slides = [...plan.slides];
  for (const [index, slide] of slides.entries()) {
    const structure = slide.structure;
    if (!structure) continue;
    const data = await structurePng(structure.notation, structure.value);
    if (!data) continue;
    figures.push({
      caption: structure.caption || structure.value,
      path: "",
      // 🔴 THE PROVENANCE PRINTS UNDER THE PICTURE. A resolved molecule says where it came from,
      // which is the visible difference §42 asks for between a looked-up structure and a
      // remembered one. Without a stamp it says nothing rather than claiming anything.
      source: structure.resolvedFrom ? `PubChem: ${structure.resolvedFrom.name}` : "",
      url: data,
    });
    slides[index] = { ...slide, figure: figures.length };
  }
  return { ...plan, figures, slides };
}

export async function downloadDeck(plan: DeckPlan, title: string, designId?: string | null): Promise<void> {
  const { buildDeckPptx } = await import("./deck-pptx");
  // Drawn before the learner's own figures are signed, so both arrive as one list.
  plan = await withStructures(plan);
  // 🔴 THE LEARNER'S FIGURES ARE SIGNED HERE, NOT STORED. The bucket is private and a signature
  // expires within the hour, so the plan carries paths and every render mints its own links —
  // see deck-figures.ts. A deck whose signatures failed still downloads, with captions where the
  // pictures would be.
  const withFigures = plan.figures.length
    ? { ...plan, figures: await (await import("../learn/deck-figures")).signDeckFigures(plan.figures) }
    : plan;
  const blob = (await buildDeckPptx(withFigures, { credit: "Made with Nemesis", designId })) as Blob;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "slides"}.pptx`;
  anchor.click();
  // Revoked on a delay: revoking synchronously races the browser actually starting the
  // download in some engines, and a lost race is a 0-byte file with no error.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
