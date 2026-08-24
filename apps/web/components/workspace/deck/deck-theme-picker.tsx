"use client";

// The twenty-look picker that sits beside every slide deck.
//
// It shows the deck's own colours rather than a colour name: a two-tone chip made from the
// theme's real cover art and its real page colour, which is what the learner will actually
// see when the file opens. Picking rebuilds nothing here — the choice is remembered and the
// next download wears it (see deck-theme-choice.ts).

import { useCallback, useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
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

function Swatch({ theme, size = 14 }: { theme: DeckTheme; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 overflow-hidden rounded-[3px] border border-(--ui-stroke-tertiary)"
      style={{ height: size, width: size }}
    >
      <span className="block h-1/2 w-full" style={{ background: `#${theme.cover.art.base}` }} />
      <span className="flex h-1/2 w-full items-center" style={{ background: `#${theme.body.bg}` }}>
        <span className="ml-[2px] block h-[3px] w-[3px] rounded-full" style={{ background: `#${theme.accent}` }} />
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${label}: ${current.name}`}
          className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary) data-[state=open]:bg-(--ui-bg-tertiary)"
          type="button"
        >
          <Swatch theme={current} />
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
                <Swatch size={18} theme={theme} />
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
