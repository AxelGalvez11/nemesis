import assert from "node:assert/strict";
import test from "node:test";

import { hashSeed } from "./daily";
import { boardCleared, generateTilesBoard, hasAnyMatch, matchTiles, sharedLayers, tileEmpty } from "./tiles";

test("boards are deterministic per seed with even value counts per layer", () => {
  const first = generateTilesBoard(hashSeed("tiles:2026-08-04"));
  const second = generateTilesBoard(hashSeed("tiles:2026-08-04"));
  assert.deepEqual(first.tiles, second.tiles);
  assert.equal(first.tiles.length, 30);
  for (let layer = 0; layer < 3; layer += 1) {
    const counts = new Map<number, number>();
    for (const tile of first.tiles) counts.set(tile[layer]!, (counts.get(tile[layer]!) ?? 0) + 1);
    for (const [value, count] of counts) {
      assert.ok(value >= 0);
      assert.equal(count % 2, 0, `layer ${layer} value ${value} has odd count`);
    }
  }
});

test("matching removes exactly the shared layers, immutably", () => {
  const tiles = [
    [0, 1, 2],
    [0, 3, 2],
    [1, 1, 1],
  ];
  const result = matchTiles(tiles, 0, 1);
  assert.deepEqual(result.cleared, [0, 2]);
  assert.deepEqual(result.tiles[0], [-1, 1, -1]);
  assert.deepEqual(result.tiles[1], [-1, 3, -1]);
  assert.deepEqual(tiles[0], [0, 1, 2]); // input untouched
  assert.deepEqual(matchTiles(tiles, 0, 2).cleared, [1]);
  assert.deepEqual(matchTiles(tiles, 1, 2).cleared, []);
});

test("a full game can always be played to a cleared board", () => {
  // Greedy simulation: as long as tiles remain, some pair must share a layer
  // (the generator's even-pairs construction guarantees it). 200 seeds.
  for (let seed = 0; seed < 200; seed += 1) {
    let { tiles } = generateTilesBoard(hashSeed(`tiles-sim-${seed}`));
    let safety = 500;
    while (!boardCleared(tiles) && safety > 0) {
      safety -= 1;
      let matched = false;
      outer: for (let first = 0; first < tiles.length; first += 1) {
        if (tileEmpty(tiles[first]!)) continue;
        for (let second = first + 1; second < tiles.length; second += 1) {
          if (sharedLayers(tiles[first]!, tiles[second]!).length > 0) {
            tiles = matchTiles(tiles, first, second).tiles;
            matched = true;
            break outer;
          }
        }
      }
      assert.ok(matched, `seed ${seed}: dead board with tiles remaining`);
    }
    assert.ok(boardCleared(tiles), `seed ${seed}: did not clear`);
    assert.ok(hasAnyMatch(tiles));
  }
});
