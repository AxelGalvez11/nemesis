"use client";

// The twenty-look picker that sits beside every slide deck.
//
// It shows looks, not colour names: each row carries a thumbnail of the theme's REAL cover
// art, painted by the same engine that paints the slide (deck-art.ts) at a sixtieth of the
// size, beside a band of the page colour and the accent. Nothing here is a drawing of the
// theme — a hand-made approximation would drift the first time a colour changed.
//
// The thumbnails are painted when the menu opens, never on mount: a canvas with a deck in its
// outputs should not spend milliseconds painting twenty images nobody asked to see. Picking
// rebuilds nothing — the choice is remembered and the next download wears it
// (see deck-theme-choice.ts).

import { useCallback, useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { deckArtThumb } from "@/lib/export/deck-art";
import { readDeckThemeChoice, writeDeckThemeChoice } from "@/lib/export/deck-theme-choice";
import { DECK_THEMES, deckTheme, type DeckTheme } from "@/lib/export/deck-themes";

/** Reads the remembered choice after mount — localStorage does not exist during render on the
 *  server, and reading it in a first-render initialiser would mismatch the hydrated markup. */
export function useDeckThemeChoice(deckKey?: string | null): { themeId: string; choose: (id: string) => void } {
  const [themeId, setThemeId] = useState(() => readDeckThemeChoice(null));
  useEffect(() => setThemeId(readDeckThemeChoice(deckKey)), [deckKey]);
  const choose = useCallback(
    (id: string) => {
      setThemeId(id);
      writeDeckThemeChoice(id, deckKey);
    },
    [deckKey],
  );
  return { choose, themeId };
}

function Swatch({ theme, art, width = 14 }: { theme: DeckTheme; art?: string; width?: number }) {
  const height = Math.round((width * 9) / 16);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 flex-col overflow-hidden rounded-[3px] border border-(--ui-stroke-tertiary)"
      style={{ width }}
    >
      {/* The cover, real when it has been painted and the flat base colour until then, so the
          row never changes size as thumbnails arrive. */}
      <span
        className="block bg-cover"
        style={{ backgroundColor: `#${theme.cover.art.base}`, backgroundImage: art ? `url(${art})` : undefined, height }}
      />
      <span className="flex items-center" style={{ background: `#${theme.body.bg}`, height: Math.max(4, height / 2) }}>
        <span className="ml-[2px] block size-[3px] rounded-full" style={{ background: `#${theme.accent}` }} />
      </span>
    </span>
  );
}

export function DeckThemePicker({
  themeId,
  onPick,
  label = "Theme",
}: {
  themeId: string;
  onPick: (id: string) => void;
  /** Screen-reader name; the trigger itself stays a chip so it fits narrow panels. */
  label?: string;
}) {
  const current = deckTheme(themeId);
  const [open, setOpen] = useState(false);
  const [art, setArt] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void Promise.all(
      DECK_THEMES.map(async (theme) => [theme.id, await deckArtThumb(theme.cover.art)] as const),
    ).then((pairs) => {
      if (alive) setArt(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${label}: ${current.name}`}
          className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary) data-[state=open]:bg-(--ui-bg-tertiary)"
          type="button"
        >
          <Swatch art={art[current.id]} theme={current} />
          <span className="max-w-24 truncate">{current.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuRadioGroup onValueChange={onPick} value={current.id}>
          {DECK_THEMES.map((theme) => (
            // items-start + a taller row because each option carries a line of description;
            // the check indicator the menu appends rides ml-auto, so the label must grow.
            <DropdownMenuRadioItem className="items-start py-1.5" key={theme.id} value={theme.id}>
              <span className="flex min-w-0 flex-1 items-start gap-2">
                <Swatch art={art[theme.id]} theme={theme} width={40} />
                <span className="min-w-0">
                  <span className="block truncate text-(--ui-text-primary)">{theme.name}</span>
                  <span className="block text-[length:var(--canvas-text-meta)] leading-snug text-(--ui-text-quaternary)">
                    {theme.blurb}
                  </span>
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
