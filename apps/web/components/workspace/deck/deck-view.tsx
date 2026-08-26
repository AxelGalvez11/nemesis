"use client";

// The deck, as a page you can read, present and print.
//
// 🔴 THIS IS THE DECK NOW, AND THE .PPTX IS AN EXPORT (owner 2026-08-24). The slides here are
// composed by deck-compose.ts and written by deck-html.ts — the same Scene the PowerPoint file
// is built from — so what the learner reads is never an approximation of what they download.
//
// 🔴 PRINTING IS THE PDF EXPORT. deck-html.ts's stylesheet sizes a slide as exactly one page at
// true size, so the browser's own "Save as PDF" produces the deck. No headless Chrome, no
// render service, no queue: an export path with no infrastructure behind it cannot break at 2am.
//
// Presenting uses the Fullscreen API and arrow keys. Nothing about the deck is stored here; the
// plan comes from the canvas output, and the design is the learner's remembered choice.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { composeSlide, composeReferences } from "@/lib/export/deck-compose";
import { deckDesign } from "@/lib/export/deck-designs";
import { signDeckFigures } from "@/lib/learn/deck-figures";
import { DECK_CSS, SLIDE_PX_H, SLIDE_PX_W, sceneToHtml } from "@/lib/export/deck-html";
import type { DeckPlan } from "@/lib/export/deck-plan";

interface Props {
  plan: DeckPlan;
  designId: string;
  /** Printed in the corner of covers and closings. */
  credit?: string;
  /** The design picker and the .pptx download, supplied by whichever surface mounts this. */
  actions?: ReactNode;
}

export function DeckView({ plan, designId, credit = "Made with Nemesis", actions }: Props) {
  const [slides, setSlides] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const stage = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // Compose on the client: a deck is a pure function of plan + design, so there is nothing to
  // fetch and nothing to cache. Twenty slides take a few milliseconds.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const design = deckDesign(designId);
      // The learner's own figures live in a private bucket, so each render mints its own signed
      // links (deck-figures.ts). A failure leaves the caption and drops the picture.
      const shown = plan.figures.length ? { ...plan, figures: await signDeckFigures(plan.figures) } : plan;
      const scenes = shown.slides.map((slide, i) => composeSlide(design, slide, { credit, index: i + 1, plan: shown }));
      if (shown.references.length) scenes.push(composeReferences(design, shown.references));
      const html: string[] = [];
      for (const [i, scene] of scenes.entries()) html.push(await sceneToHtml(scene, i + 1));
      if (alive) setSlides(html);
    })();
    return () => {
      alive = false;
    };
  }, [plan, designId, credit]);

  // A slide is a fixed 1280x720 box; the view scales it to whatever room it has.
  useEffect(() => {
    const fit = () => {
      const el = stage.current;
      if (!el) return;
      const room = el.getBoundingClientRect();
      setScale(Math.min(room.width / SLIDE_PX_W, room.height / SLIDE_PX_H, presenting ? 4 : 1.6));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [presenting, slides.length]);

  const go = useCallback(
    (delta: number) => setAt((current) => Math.max(0, Math.min(slides.length - 1, current + delta))),
    [slides.length],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        go(-1);
      } else if (event.key === "Escape" && document.fullscreenElement) {
        void document.exitFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  useEffect(() => {
    const onChange = () => setPresenting(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const present = () => {
    const el = stage.current?.parentElement;
    if (!el) return;
    void (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.());
  };

  const current = slides[at] ?? "";

  return (
    // 🔴🔴 THE ROOM IS NEUTRAL, NOT AN ACCENT FILL (owner 2026-08-26: *"opening documents, pdf, or
    // pptx in library does not match chatgpt. the background is green and not white"*).
    //
    // It was `--ui-bg-secondary`, and every `--ui-bg-*` fill is the LEARNER'S CHOSEN ACCENT mixed
    // over a translucent base: measured with the green accent it resolves to
    // `color(srgb 0.174 0.537 0.374 / 0.1723)`, which over the page is rgb(219, 235, 227) — a pale
    // green wash behind the slide. Those fills are for CONTROLS sitting on a page (a hovered row, a
    // chip, an input), where a hint of the accent is the point. A room is not a control.
    //
    // `--ui-bg-editor` is the app's neutral page ground — the same one the document reader resolves
    // `--reader-room` to and the same one the canvas paints — and it measures rgb(253, 253, 253)
    // against the reference's rgb(252, 252, 252). Named directly rather than through
    // `--reader-room`, which is scoped to `.nemesis-reader` and undefined here.
    <div className="flex h-full min-h-0 flex-col bg-(--ui-bg-editor)">
      <style>{DECK_CSS}</style>
      {/* Every slide, stacked, for printing. The screen shows one at a time. */}
      <div aria-hidden="true" className="dk-print-only hidden" dangerouslySetInnerHTML={{ __html: slides.join("") }} />

      <div className="dk-print-hide flex items-center justify-between gap-3 border-b border-(--ui-stroke-tertiary) px-4 py-2">
        <p className="truncate text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">{plan.title}</p>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <button
            className="rounded-lg px-2 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary) disabled:opacity-40"
            disabled={at === 0}
            onClick={() => go(-1)}
            type="button"
          >
            Back
          </button>
          <span className="w-16 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
            {slides.length ? `${at + 1} / ${slides.length}` : "…"}
          </span>
          <button
            className="rounded-lg px-2 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary) disabled:opacity-40"
            disabled={at >= slides.length - 1}
            onClick={() => go(1)}
            type="button"
          >
            Next
          </button>
          <button
            className="ml-2 rounded-lg px-2 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
            onClick={present}
            type="button"
          >
            Present
          </button>
          <button
            className="rounded-lg px-2 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
            onClick={() => window.print()}
            type="button"
          >
            Save as PDF
          </button>
        </div>
      </div>

      <div className="dk-print-hide relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <div className="flex h-full w-full items-center justify-center" ref={stage}>
          <div
            className="shadow-[0_10px_40px_rgba(0,0,0,0.28)]"
            style={{ height: SLIDE_PX_H * scale, width: SLIDE_PX_W * scale }}
          >
            {/* 🔴 THE KEY IS WHAT MAKES THE SLIDE BUILD. React replaces this node whenever the
                slide changes, and a fresh node restarts the CSS animations under `dk-run` — no
                timers, no animation library, nothing to fall out of step. `dk-run` is also the
                ONLY place the hidden start state exists (deck-html.ts), so the printed stack
                above and every other consumer get finished slides. */}
            <div
              className="dk-run"
              dangerouslySetInnerHTML={{ __html: current }}
              key={at}
              style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
            />
          </div>
        </div>
        {/* Clicking the right or left half moves through the deck, as every presenter expects. */}
        <button aria-label="Previous slide" className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize opacity-0" onClick={() => go(-1)} type="button" />
        <button aria-label="Next slide" className="absolute inset-y-0 right-0 w-1/2 cursor-e-resize opacity-0" onClick={() => go(1)} type="button" />
      </div>
    </div>
  );
}
