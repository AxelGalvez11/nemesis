"use client";

// Layer-matching game. Each tile stacks a background color, a ring shape,
// and a center glyph; pick two tiles sharing any layer and the shared layers
// clear from both. The generator guarantees the board always clears (even
// pair counts per value — see lib tiles.ts). All artwork here is original.
//
// Owner 2026-08-05 called this one out as the least polished of the eight.
// Three things were wrong and all three are fixed here:
//  1. Every tile sat on a hardcoded `bg-white` card. Dark mode is the app's
//     default, so the board was 30 glaring white haloes on black. The colour
//     block IS the tile now, and a tile whose colour layer has cleared falls
//     back to a neutral token surface that works on both themes.
//  2. Ring shapes were stroked in their own dark palette — invisible once
//     the colour underneath cleared, and visually noisy while it hadn't.
//     Shape alone already identifies a ring value (five distinct shapes), so
//     rings and glyphs are now drawn in one ink at two weights.
//  3. Nothing told you what was legal: you found matches by trial, and a
//     wrong pick cost you the chain. Picking a tile now dims every tile it
//     can't clear against, which is the whole game made visible.

import { useMemo, useState } from "react";

import { useBreakDayState } from "@/components/workspace/break/use-break-day";
import { Button } from "@/components/ui/button";
import {
  boardCleared,
  generateTilesBoard,
  hashSeed,
  matchableWith,
  matchTiles,
  TILE_LAYERS,
  tileEmpty,
  type Tile,
} from "@nemesis/shared";
import { cn } from "@/lib/utils";

/** Pale fills, so one fixed dark ink reads on every one of them in both
 *  themes (these are the game's language, like Wordle's judge colours). */
const LAYER_COLORS = ["#f2c94c", "#7fc8a9", "#a9c1ef", "#e8927c", "#c39bd3"];
/** Ink for a tile that still has its colour layer. */
const INK_ON_COLOR = "#141518";

interface TilesState {
  tiles: Tile[];
  combo: number;
  best: number;
}

function TileArt({ tile, ink }: { tile: Tile; ink: string }) {
  const [, ring, glyph] = tile;
  return (
    <svg viewBox="0 0 48 48" className="size-full">
      {ring !== undefined && ring !== -1 && (
        <g stroke={ink} strokeOpacity={0.55} strokeWidth={2.8} fill="none">
          {ring === 0 && <circle cx={24} cy={24} r={14.5} />}
          {ring === 1 && <rect x={9.5} y={9.5} width={29} height={29} rx={5} />}
          {ring === 2 && <polygon points="24,7.5 40.5,24 24,40.5 7.5,24" />}
          {ring === 3 && <polygon points="24,8 38.5,16.5 38.5,31.5 24,40 9.5,31.5 9.5,16.5" />}
          {ring === 4 && <polygon points="24,8.5 39.5,35.5 8.5,35.5" />}
        </g>
      )}
      {glyph !== undefined && glyph !== -1 && (
        <g fill={ink}>
          {glyph === 0 && <circle cx={24} cy={25} r={4.6} />}
          {glyph === 1 && <path d="M24 19 l6 6 -6 6 -6 -6 z" />}
          {glyph === 2 && <path d="M21.6 19h4.8v4.8H31v4.8h-4.6V33h-4.8v-4.4H17v-4.8h4.6z" />}
          {glyph === 3 && <path d="M24 18l2.1 4.7 5.1.5-3.9 3.4 1.2 5-4.5-2.7-4.5 2.7 1.2-5-3.9-3.4 5.1-.5z" />}
          {glyph === 4 && <path d="M28.5 18.5a7.6 7.6 0 1 0 2 9.4 8.8 8.8 0 1 1-2-9.4z" />}
        </g>
      )}
    </svg>
  );
}

export function TilesGame({
  dateKey,
  puzzleKey,
  onPlayAnother,
}: {
  dateKey: string;
  /** Board seed AND storage identity — the plain dateKey for the daily
   *  (n=0), extraKey(dateKey, n) for an extra. Tiles has no separate
   *  content bank to pick from, so this one string drives both. */
  puzzleKey: string;
  onPlayAnother: () => void;
}) {
  const [saved, update] = useBreakDayState<TilesState>(
    "tiles",
    dateKey,
    {
      tiles: generateTilesBoard(hashSeed(`tiles:${puzzleKey}`)).tiles,
      combo: 0,
      best: 0,
    },
    puzzleKey,
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ nonce: number; indexes: number[]; kind: "match" | "miss" }>({ nonce: 0, indexes: [], kind: "match" });

  const cleared = boardCleared(saved.tiles);
  const remainingCount = saved.tiles.filter((tile) => !tileEmpty(tile)).length;
  // Progress counts LAYERS, not empty tiles. A match usually strips one layer
  // off two tiles and empties neither, so a tile-based bar sits at zero
  // through the whole opening and reads as "nothing is happening".
  const layerTotal = saved.tiles.length * TILE_LAYERS;
  const layersCleared = saved.tiles.reduce(
    (total, tile) => total + tile.filter((value) => value === -1).length,
    0,
  );
  // Legal moves for the current pick. Recomputed from the board rather than
  // tracked alongside it, so it can never disagree with what a click does.
  const legal = useMemo(
    () => (selected === null ? null : new Set(matchableWith(saved.tiles, selected))),
    [saved.tiles, selected],
  );

  const pick = (index: number) => {
    if (cleared || tileEmpty(saved.tiles[index]!)) return;
    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    const result = matchTiles(saved.tiles, selected, index);
    if (result.cleared.length === 0) {
      setFlash((now) => ({ nonce: now.nonce + 1, indexes: [selected, index], kind: "miss" }));
      setSelected(null);
      update((previous) => ({ ...previous, combo: 0 }));
      return;
    }
    setFlash((now) => ({ nonce: now.nonce + 1, indexes: [selected, index], kind: "match" }));
    const keepSelection = !tileEmpty(result.tiles[index]!) ? index : null;
    setSelected(keepSelection);
    update((previous) => {
      const combo = previous.combo + 1;
      return { tiles: result.tiles, combo, best: Math.max(previous.best, combo) };
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4" data-testid="tiles-board">
      <div className="flex w-full max-w-[26rem] items-center gap-2">
        <Stat label="Chain" value={saved.combo} testId="tiles-combo" emphasis />
        <Stat label="Best" value={saved.best} />
        <div className="ml-auto flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground" data-testid="tiles-remaining">
            {remainingCount} tiles left
          </span>
          <span className="h-1 w-24 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)]">
            <span
              className="block h-full rounded-full bg-[color-mix(in_srgb,var(--ui-base)_55%,transparent)] transition-[width] duration-300"
              style={{ width: `${(layersCleared / layerTotal) * 100}%` }}
            />
          </span>
        </div>
      </div>

      {cleared ? (
        // "Come back tomorrow" (the pre-extras copy) would now contradict
        // the button right below it, so this line drops that clause —
        // flagged as a deliberate copy change, not swept to the other games.
        <div className="flex flex-col items-center gap-2 pt-6">
          <p className="break-banner-in text-center text-sm font-medium text-emerald-600">
            Board cleared — longest chain {saved.best}.
          </p>
          <Button variant="outline" size="sm" className="rounded-full px-4" onClick={onPlayAnother} data-testid="tiles-play-another">
            Play another
          </Button>
        </div>
      ) : (
        <div className="grid w-full max-w-[26rem] grid-cols-6 gap-1.5">
          {saved.tiles.map((tile, index) => {
            const empty = tileEmpty(tile);
            const flashing = flash.indexes.includes(index);
            const color = tile[0];
            const hasColor = color !== undefined && color !== -1;
            const isSelected = selected === index;
            // Dim only while a pick is live, and never dim the pick itself.
            const dimmed = legal !== null && !isSelected && !legal.has(index);
            return (
              <button
                key={`${index}-${flashing ? flash.nonce : "s"}`}
                type="button"
                onClick={() => pick(index)}
                disabled={empty}
                data-testid={`tiles-tile-${index}`}
                data-matchable={legal !== null && legal.has(index) ? "true" : undefined}
                className={cn(
                  "aspect-square rounded-xl p-1.5 transition-[opacity,transform,box-shadow] duration-150",
                  // A cleared colour layer leaves a live tile with nothing to
                  // stand on — a neutral token surface keeps it visible (and
                  // theme-correct) without pretending it still has a colour.
                  !hasColor && "bg-[color-mix(in_srgb,var(--ui-base)_8%,transparent)]",
                  empty && "invisible",
                  isSelected && "-translate-y-1 shadow-[0_0_0_2px_var(--ui-text-primary)]",
                  // Faded, not hidden: you still need to read the board to
                  // plan the next pick.
                  dimmed && "opacity-[0.35]",
                  flashing && flash.kind === "match" && "break-tile-pop",
                  flashing && flash.kind === "miss" && "break-row-shake",
                )}
                style={hasColor ? { background: LAYER_COLORS[color] } : undefined}
              >
                <TileArt tile={tile} ink={hasColor ? INK_ON_COLOR : "var(--ui-text-primary)"} />
              </button>
            );
          })}
        </div>
      )}
      <p className="max-w-[26rem] text-center text-xs text-muted-foreground">
        {selected === null
          ? "Pick two tiles that share a colour, ring shape, or symbol — every layer they share clears from both."
          : "Lit tiles share a layer with your pick. Anything faded clears nothing and breaks the chain."}
      </p>
    </div>
  );
}

function Stat({ label, value, testId, emphasis }: { label: string; value: number; testId?: string; emphasis?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--ui-base)_6%,transparent)] px-2.5 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {/* Keyed on the value so each increment replays the pop — the chain is
          the only number here worth noticing. */}
      <span
        key={emphasis ? value : undefined}
        className={cn("text-sm font-bold tabular-nums text-foreground", emphasis && value > 0 && "break-chip-in")}
        data-testid={testId}
      >
        {value}
      </span>
    </span>
  );
}
