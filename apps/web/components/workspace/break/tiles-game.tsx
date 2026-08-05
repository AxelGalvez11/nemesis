"use client";

// Layer-matching game. Each tile stacks a background color, a ring shape,
// and a center glyph; pick two tiles sharing any layer and the shared layers
// clear from both. The generator guarantees the board always clears (even
// pair counts per value — see lib tiles.ts). All artwork here is original.

import { useState } from "react";

import { useBreakDayState } from "@/components/workspace/break/use-break-day";
import { hashSeed } from "@/lib/workspace/break/daily";
import { boardCleared, generateTilesBoard, matchTiles, tileEmpty, type Tile } from "@/lib/workspace/break/tiles";
import { cn } from "@/lib/utils";

const LAYER_COLORS = ["#f2c94c", "#7fc8a9", "#a9c1ef", "#e8927c", "#c39bd3"];
const RING_COLORS = ["#1f2933", "#7c2d5b", "#155e63", "#8a4f10", "#3b3f8f"];

interface TilesState {
  tiles: Tile[];
  combo: number;
  best: number;
}

function TileArt({ tile }: { tile: Tile }) {
  const [color, ring, glyph] = tile;
  return (
    <svg viewBox="0 0 48 48" className="size-full">
      {color !== undefined && color !== -1 && <rect x={2} y={2} width={44} height={44} rx={10} fill={LAYER_COLORS[color]} />}
      {ring !== undefined && ring !== -1 && (
        <g stroke={RING_COLORS[ring]} strokeWidth={3.4} fill="none">
          {ring === 0 && <circle cx={24} cy={24} r={13} />}
          {ring === 1 && <rect x={11} y={11} width={26} height={26} rx={4} />}
          {ring === 2 && <polygon points="24,9 39,24 24,39 9,24" />}
          {ring === 3 && <polygon points="24,10 37,17.5 37,31 24,38.5 11,31 11,17.5" />}
          {ring === 4 && <polygon points="24,10 38,34 10,34" />}
        </g>
      )}
      {glyph !== undefined && glyph !== -1 && (
        <g fill="#0e0f11">
          {glyph === 0 && <circle cx={24} cy={24} r={4.4} />}
          {glyph === 1 && <path d="M24 18 l6 6 -6 6 -6 -6 z" />}
          {glyph === 2 && <path d="M21.6 18h4.8v4.8H31v4.8h-4.6V32h-4.8v-4.4H17v-4.8h4.6z" />}
          {glyph === 3 && <path d="M24 17l2.1 4.7 5.1.5-3.9 3.4 1.2 5-4.5-2.7-4.5 2.7 1.2-5-3.9-3.4 5.1-.5z" />}
          {glyph === 4 && <path d="M28.5 17.5a7.6 7.6 0 1 0 2 9.4 8.8 8.8 0 1 1-2-9.4z" />}
        </g>
      )}
    </svg>
  );
}

export function TilesGame({ dateKey }: { dateKey: string }) {
  const [saved, update] = useBreakDayState<TilesState>("tiles", dateKey, {
    tiles: generateTilesBoard(hashSeed(`tiles:${dateKey}`)).tiles,
    combo: 0,
    best: 0,
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ nonce: number; indexes: number[]; kind: "match" | "miss" }>({ nonce: 0, indexes: [], kind: "match" });

  const cleared = boardCleared(saved.tiles);
  const remainingCount = saved.tiles.filter((tile) => !tileEmpty(tile)).length;

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
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          Chain <span className="font-bold text-foreground" data-testid="tiles-combo">{saved.combo}</span>
        </span>
        <span>
          Best <span className="font-bold text-foreground">{saved.best}</span>
        </span>
        <span>{remainingCount} tiles left</span>
      </div>
      {cleared ? (
        <p className="break-banner-in pt-2 text-center text-sm font-medium text-emerald-600">
          Board cleared — longest chain {saved.best}. Come back tomorrow for a fresh one.
        </p>
      ) : (
        <div className="grid grid-cols-6 gap-2">
          {saved.tiles.map((tile, index) => {
            const empty = tileEmpty(tile);
            const flashing = flash.indexes.includes(index);
            return (
              <button
                key={`${index}-${flashing ? flash.nonce : "s"}`}
                type="button"
                onClick={() => pick(index)}
                disabled={empty}
                data-testid={`tiles-tile-${index}`}
                className={cn(
                  "size-14 rounded-xl border border-(--ui-stroke-tertiary) bg-white p-1 transition-transform sm:size-16",
                  empty && "invisible",
                  selected === index && "-translate-y-1 ring-2 ring-(--theme-primary)",
                  flashing && flash.kind === "match" && "break-tile-pop",
                  flashing && flash.kind === "miss" && "break-row-shake",
                )}
              >
                <TileArt tile={tile} />
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Pick two tiles that share a color, ring, or symbol. Shared layers clear.</p>
    </div>
  );
}
