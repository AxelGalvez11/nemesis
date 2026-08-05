// Layer-matching game (Break page). Every tile stacks one value per layer
// (a color, a ring, a glyph). Click two tiles: every layer where they agree
// clears from both; empty tiles vanish; clear the board, keep the combo
// alive. Boards are generated per day with a guarantee: each value appears
// an EVEN number of times and never twice on one tile, so removals always
// happen in pairs and a match always exists until the board is empty —
// no deadlocks, ever (the test proves it by simulation).

import { mulberry32 } from "./daily";

export const TILE_LAYERS = 3;

/** A tile is one value index per layer; -1 = that layer already cleared. */
export type Tile = number[];

export interface TilesBoard {
  tiles: Tile[];
  /** Distinct value count per layer (render palettes are sized to this). */
  valueCounts: number[];
}

export function generateTilesBoard(seed: number, tileCount = 30, valuesPerLayer = 5): TilesBoard {
  const random = mulberry32(seed);
  const tiles: Tile[] = Array.from({ length: tileCount }, () => new Array(TILE_LAYERS).fill(-1));
  for (let layer = 0; layer < TILE_LAYERS; layer += 1) {
    // Deal values in identical pairs onto distinct random tiles: even counts
    // by construction, same-tile duplicates impossible.
    const slots = Array.from({ length: tileCount }, (_, index) => index);
    for (let swap = slots.length - 1; swap > 0; swap -= 1) {
      const pick = Math.floor(random() * (swap + 1));
      [slots[swap], slots[pick]] = [slots[pick]!, slots[swap]!];
    }
    for (let pair = 0; pair < tileCount / 2; pair += 1) {
      const value = pair % valuesPerLayer;
      tiles[slots[pair * 2]!]![layer] = value;
      tiles[slots[pair * 2 + 1]!]![layer] = value;
    }
  }
  return { tiles, valueCounts: new Array(TILE_LAYERS).fill(valuesPerLayer) };
}

export const tileEmpty = (tile: Tile): boolean => tile.every((value) => value === -1);

export function sharedLayers(a: Tile, b: Tile): number[] {
  const shared: number[] = [];
  for (let layer = 0; layer < TILE_LAYERS; layer += 1) {
    if (a[layer] !== -1 && a[layer] === b[layer]) shared.push(layer);
  }
  return shared;
}

export interface TilesMatchResult {
  tiles: Tile[];
  /** Layers that cleared; empty means the pick broke the combo. */
  cleared: number[];
}

/** Immutable match step: clear shared layers between two tile indexes. */
export function matchTiles(tiles: readonly Tile[], first: number, second: number): TilesMatchResult {
  const shared = sharedLayers(tiles[first]!, tiles[second]!);
  if (shared.length === 0) return { tiles: [...tiles], cleared: [] };
  const next = tiles.map((tile, index) => {
    if (index !== first && index !== second) return tile;
    return tile.map((value, layer) => (shared.includes(layer) ? -1 : value));
  });
  return { tiles: next, cleared: shared };
}

export const boardCleared = (tiles: readonly Tile[]): boolean => tiles.every(tileEmpty);

/** Every tile that would clear something against `from` — the legal moves.
 *  The board dims everything else while a tile is picked, so a player can
 *  SEE the move instead of discovering it by trial and shake. `from` itself
 *  is never included. */
export function matchableWith(tiles: readonly Tile[], from: number): number[] {
  const source = tiles[from];
  if (!source || tileEmpty(source)) return [];
  const matches: number[] = [];
  tiles.forEach((tile, index) => {
    if (index === from || tileEmpty(tile)) return;
    if (sharedLayers(source, tile).length > 0) matches.push(index);
  });
  return matches;
}

/** True while at least one clearing move exists (the generator guarantees
 *  this never goes false before the board is empty; the tests check it). */
export function hasAnyMatch(tiles: readonly Tile[]): boolean {
  for (let first = 0; first < tiles.length; first += 1) {
    if (tileEmpty(tiles[first]!)) continue;
    for (let second = first + 1; second < tiles.length; second += 1) {
      if (sharedLayers(tiles[first]!, tiles[second]!).length > 0) return true;
    }
  }
  return boardCleared(tiles);
}
