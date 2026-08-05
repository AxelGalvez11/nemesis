import assert from "node:assert/strict";
import test from "node:test";

import { breakDayNumber, dailyIndex, dateKeyLabel, hashSeed, localDateKey, mulberry32, seededShuffle } from "./daily";

test("localDateKey uses local calendar fields, zero-padded", () => {
  const date = new Date(2026, 7, 4, 23, 59); // Aug 4 local, would be Aug 5 UTC in the Americas
  assert.equal(localDateKey(date), "2026-08-04");
  assert.equal(localDateKey(new Date(2026, 0, 9)), "2026-01-09");
});

test("dateKeyLabel renders without UTC drift", () => {
  assert.equal(dateKeyLabel("2026-08-04"), "August 4, 2026");
  assert.equal(dateKeyLabel("garbage"), "garbage");
});

test("day numbers advance one per calendar day and never go below 1", () => {
  assert.equal(breakDayNumber("2026-08-04"), 1);
  assert.equal(breakDayNumber("2026-08-05"), 2);
  assert.equal(breakDayNumber("2026-09-04"), 32);
  assert.equal(breakDayNumber("2026-07-01"), 1);
});

test("daily index is deterministic, in range, and differs across games", () => {
  const wordle = dailyIndex("2026-08-04", "wordle", 25);
  assert.equal(wordle, dailyIndex("2026-08-04", "wordle", 25));
  assert.ok(wordle >= 0 && wordle < 25);
  const spread = new Set(["a", "b", "c", "d", "e"].map((game) => dailyIndex("2026-08-04", game, 1000)));
  assert.ok(spread.size >= 4, "different games should not collapse to one index");
  assert.equal(dailyIndex("2026-08-04", "wordle", 0), 0);
});

test("seeded shuffle is stable for a seed and leaves the input untouched", () => {
  const items = ["a", "b", "c", "d", "e", "f"];
  const first = seededShuffle(items, hashSeed("seed-1"));
  assert.deepEqual(first, seededShuffle(items, hashSeed("seed-1")));
  assert.deepEqual(items, ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual([...first].sort(), [...items].sort());
  assert.notDeepEqual(first, seededShuffle(items, hashSeed("seed-2")));
});

test("mulberry32 stays in [0,1) and repeats per seed", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let index = 0; index < 100; index += 1) {
    const value = a();
    assert.ok(value >= 0 && value < 1);
    assert.equal(value, b());
  }
});
