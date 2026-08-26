"use client";

// A deck, read beside the conversation that asked for it.
//
// 🔴🔴 SLIDES WERE THE ONE ARTIFACT THAT STILL NAVIGATED AWAY. Owner, 2026-08-25: *"the artifacts
// like documents, presentations, and pdf etc. should open as a right sidebar can have the canvas
// chat in the left."* Documents, PDFs and spreadsheets moved into the panel; a deck row was still
// an `<a href="/deck?c=…">`, so checking what Nemesis had made meant leaving the canvas that made
// it and coming back.
//
// 🔴 IT IS A READING VIEW, NOT THE DECK EDITOR. The full page keeps what a narrow panel cannot
// hold — twenty designs, the picker, the real .pptx geometry — and this links out to it rather than
// reimplementing it badly at 38rem. What belongs here is the question a panel is opened to answer:
// what is ON these slides.
//
// 🔴 RENDERED FROM THE STORED PLAN, like everything else in this lane. The .pptx is a deterministic
// function of plan + design, so nothing was uploaded and there is nothing to fetch: the same plan
// the download builds from is the plan on screen.

import { Codicon } from "@/components/desktop-ui/codicon";
import type { DeckPlan } from "@/lib/export/deck-plan";

export function DeckPreview({ canvasId, outputId, plan }: { canvasId: string; outputId: string; plan: DeckPlan }) {
  return (
    <div className="grid gap-3">
      <a
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) no-underline transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
        href={`/deck?c=${canvasId}&o=${encodeURIComponent(outputId)}`}
      >
        <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="link-external" size="0.8rem" />
        Open the full deck to change its design or download it
      </a>
      {plan.slides.map((slide, index) => (
        // 🔴 KEYED ON POSITION, WHICH IS CORRECT HERE AND USUALLY IS NOT: the list comes from one
        // stored plan and is never reordered, filtered or inserted into, so position IS identity.
        // Two slides may legitimately share a title.
        <section
          className="grid gap-1.5 rounded-xl px-3.5 py-3 ring-1 ring-(--ui-stroke-tertiary)"
          key={index}
        >
          <p className="m-0 flex items-baseline gap-2">
            <span className="shrink-0 text-[length:var(--canvas-text-meta)] tabular-nums text-(--ui-text-quaternary)">
              {index + 1}
            </span>
            <span className="text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary)">
              {slide.title || "Untitled slide"}
            </span>
          </p>
          {slide.subtitle && (
            <p className="m-0 pl-5 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">{slide.subtitle}</p>
          )}
          {slide.takeaway && (
            // The "so what" line. Quiet and italic so it reads as the slide's conclusion rather
            // than as another bullet.
            <p className="m-0 pl-5 text-[length:var(--canvas-text-small)] italic text-(--ui-text-tertiary)">{slide.takeaway}</p>
          )}
          {slide.statValue && (
            <p className="m-0 pl-5 text-[length:var(--canvas-text-lead)] font-semibold text-(--ui-text-primary)">
              {slide.statValue} <span className="text-[length:var(--canvas-text-small)] font-normal text-(--ui-text-secondary)">{slide.statLabel}</span>
            </p>
          )}
          {[...slide.points, ...slide.rightPoints].map((point, at) => (
            <p className="m-0 flex gap-2 pl-5 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)" key={at}>
              <span className="shrink-0 text-(--ui-text-quaternary)">•</span>
              <span>{point}</span>
            </p>
          ))}
          {slide.figure > 0 && (
            // 🔴 SAYS A PICTURE IS THERE RATHER THAN DRAWING IT. The figures are signed at download
            // time and their links expire within the hour; rendering them here would mean minting a
            // second set of signatures for a preview, and a panel of broken images when they lapse.
            <p className="m-0 flex items-center gap-1.5 pl-5 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
              <Codicon name="device-camera" size="0.7rem" />
              Figure {slide.figure}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
