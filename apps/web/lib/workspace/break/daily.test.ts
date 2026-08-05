import assert from "node:assert/strict";
import test from "node:test";

import { breakDayNumber, dailyIndex, dateKeyLabel, extraKey, extraWalkIndex, hashSeed, localDateKey, mulberry32, seededShuffle } from "./daily";

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

test("extraKey is byte-identical to dateKey at n=0 and suffixed for n>0", () => {
  assert.equal(extraKey("2026-08-04", 0), "2026-08-04");
  assert.equal(extraKey("2026-08-04", 1), "2026-08-04#1");
  assert.equal(extraKey("2026-08-04", 7), "2026-08-04#7");
  // Negative n (shouldn't happen, but a defensive caller might pass one)
  // must still collapse onto the daily rather than mint a bogus key.
  assert.equal(extraKey("2026-08-04", -1), "2026-08-04");
});

test("extraKey gives every puzzle number its own distinct suffix (storage-key isolation)", () => {
  const dateKey = "2026-08-04";
  const keys = Array.from({ length: 20 }, (_, n) => extraKey(dateKey, n));
  assert.equal(new Set(keys).size, keys.length, "every puzzle number must get a distinct key");
  for (let n = 1; n < keys.length; n += 1) {
    assert.notEqual(keys[n], dateKey, `n=${n} must not collide with the daily key`);
  }
});

test("extras hash to picks that vary across n, not just today's single daily pick", () => {
  const dateKey = "2026-08-04";
  const spreadEvenOnASmallBank = new Set(
    Array.from({ length: 10 }, (_, n) => dailyIndex(extraKey(dateKey, n), "bee", 12)),
  );
  assert.ok(spreadEvenOnASmallBank.size > 1, "ten extras should not all collapse onto one index");
});

test("extraWalkIndex n=0 matches the plain day-number walk exactly", () => {
  const length = 350;
  for (const dateKey of ["2026-08-04", "2026-08-05", "2026-09-04"]) {
    assert.equal(extraWalkIndex(dateKey, 0, length), (breakDayNumber(dateKey) - 1) % length);
  }
});

test("extraWalkIndex visits every index exactly once before it ever repeats (coprime step)", () => {
  const dateKey = "2026-08-04";
  const length = 350; // representative bank size; the real Wordle bank is checked in break-content.test.ts
  const daily = extraWalkIndex(dateKey, 0, length);
  const seen = new Set([daily]);
  for (let n = 1; n < length; n += 1) {
    const index = extraWalkIndex(dateKey, n, length);
    assert.notEqual(index, daily, `n=${n} repeated the daily index before a full cycle`);
    seen.add(index);
  }
  assert.equal(seen.size, length, "a 137-step walk should visit every index exactly once per cycle");
});

test("extraWalkIndex guards a zero-length list instead of dividing by zero", () => {
  assert.equal(extraWalkIndex("2026-08-04", 3, 0), 0);
});
