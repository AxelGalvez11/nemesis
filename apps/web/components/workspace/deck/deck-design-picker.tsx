"use client";

// The design picker that sits beside every slide deck.
//
// 🔴 IT SHOWS THE ACTUAL SLIDE. Each row renders a real cover — composed by deck-compose.ts and
// drawn by deck-svg.ts, the same Scene the .pptx is built from — carrying the deck's own title.
// The previous picker showed a two-tone colour chip, which was honest about the palette and
// silent about the thing that actually differs between designs: the composition. A learner
// choosing between twenty looks should see twenty looks.
//
// Previews are composed when the menu opens, never on mount: a canvas with a deck in its
// outputs should not spend milliseconds drawing twenty slides nobody asked to see.

import { useCallback, useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { composeSlide, type DeckDesign } from "@/lib/export/deck-compose";
import { readDeckDesignChoice, writeDeckDesignChoice } from "@/lib/export/deck-design-choice";
import { DECK_DESIGNS, deckDesign } from "@/lib/export/deck-designs";
import { EMPTY_SLIDE, type DeckPlan } from "@/lib/export/deck-plan";
import { sceneToSvg } from "@/lib/export/deck-svg";

/** Reads the remembered choice after mount — localStorage does not exist during render on the
 *  server, and reading it in a first-render initialiser would mismatch the hydrated markup. */
export function useDeckDesignChoice(deckKey?: string | null): { designId: string; choose: (id: string) => void } {
  const [designId, setDesignId] = useState(() => readDeckDesignChoice(null));
  useEffect(() => setDesignId(readDeckDesignChoice(deckKey)), [deckKey]);
  const choose = useCallback(
    (id: string) => {
      setDesignId(id);
      writeDeckDesignChoice(id, deckKey);
    },
    [deckKey],
  );
  return { choose, designId };
}

/** A cover for this design, carrying the learner's own title. */
function coverScene(design: DeckDesign, title: string) {
  const slide = { ...EMPTY_SLIDE, layout: "cover" as const, subtitle: "A deck built by Nemesis", title };
  const plan: DeckPlan = { figures: [], references: [], slides: [slide], subtitle: slide.subtitle, title };
  return composeSlide(design, slide, { credit: "Nemesis", index: 1, plan });
}

/** The three colours that identify a design at chip size, where a whole slide cannot be read. */
function Chip({ design }: { design: DeckDesign }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-3.5 w-3.5 shrink-0 flex-col overflow-hidden rounded-[3px] border border-(--ui-stroke-tertiary)"
    >
      <span className="block h-1/2 w-full" style={{ background: `#${design.deep}` }} />
      <span className="flex h-1/2 w-full" style={{ background: `#${design.paper}` }}>
        <span className="block h-full w-1/3" style={{ background: `#${design.accent}` }} />
      </span>
    </span>
  );
}

export function DeckDesignPicker({
  designId,
  onPick,
  sampleTitle = "Your deck",
  label = "Design",
}: {
  designId: string;
  onPick: (id: string) => void;
  /** The deck's own title, so a preview shows the learner their own slide. */
  sampleTitle?: string;
  /** Screen-reader name; the trigger stays a chip so it fits narrow panels. */
  label?: string;
}) {
  const current = deckDesign(designId);
  const [open, setOpen] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const made: Record<string, string> = {};
      for (const design of DECK_DESIGNS) {
        made[design.id] = await sceneToSvg(coverScene(design, sampleTitle), 260);
      }
      if (alive) setPreviews(made);
    })();
    return () => {
      alive = false;
    };
  }, [open, sampleTitle]);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${label}: ${current.name}`}
          className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary) data-[state=open]:bg-(--ui-bg-tertiary)"
          type="button"
        >
          <Chip design={current} />
          <span className="max-w-24 truncate">{current.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[26rem] w-80 overflow-y-auto">
        <DropdownMenuRadioGroup onValueChange={onPick} value={current.id}>
          {DECK_DESIGNS.map((design) => (
            <DropdownMenuRadioItem className="items-start py-1.5" key={design.id} value={design.id}>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="block overflow-hidden rounded border border-(--ui-stroke-tertiary)">
                  {previews[design.id] ? (
                    // Our own markup, built from constants in this file — no learner input
                    // reaches it except the deck title, which deck-svg.ts escapes.
                    <span className="block [&>svg]:block [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: previews[design.id] ?? "" }} />
                  ) : (
                    <span className="block aspect-[16/9] w-full" style={{ background: `#${design.deep}` }} />
                  )}
                </span>
                <span className="block truncate text-(--ui-text-primary)">{design.name}</span>
                <span className="block text-[length:var(--canvas-text-meta)] leading-snug text-(--ui-text-quaternary)">
                  {design.blurb}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
