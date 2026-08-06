// Deno unit tests (repo convention) for the phone's Chill day store.
// Run: deno test --no-check apps/mobile/src/lib/chill-day.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  chillEntryKey,
  emptyChillStore,
  parseChillStore,
  putChillEntry,
  putChillPick,
  readChillEntry,
  readChillPick,
  type ChillStore,
} from "./chill-day.ts";

const TODAY = "2026-08-06";
const YESTERDAY = "2026-08-05";

Deno.test("a store stamped with another day is dropped whole", () => {
  const stale: ChillStore = {
    day: YESTERDAY,
    entries: { "wordle.2026-08-05": { guesses: ["crane"] } },
    picks: { wordle: 2 },
  };
  assertEquals(parseChillStore(stale, TODAY), emptyChillStore(TODAY));
});

Deno.test("today's store survives a read intact", () => {
  const live: ChillStore = { day: TODAY, entries: { "wordle.2026-08-06": { guesses: ["crane"] } }, picks: { wordle: 1 } };
  assertEquals(parseChillStore(live, TODAY), live);
});

Deno.test("garbage on disk reads as an empty day rather than throwing", () => {
  for (const raw of [null, undefined, "", 7, [], { day: TODAY, entries: "nope", picks: 4 }]) {
    assertEquals(parseChillStore(raw, TODAY).day, TODAY);
    assertEquals(parseChillStore(raw, TODAY).entries, {});
  }
});

Deno.test("a pick that is not a real puzzle index reads as the daily", () => {
  const raw = { day: TODAY, entries: {}, picks: { wordle: Number.NaN, bee: -1, mini: "2", tiles: 1.5, sudoku: 3 } };
  const store = parseChillStore(raw, TODAY);
  assertEquals(readChillPick(store, "wordle"), 0);
  assertEquals(readChillPick(store, "bee"), 0);
  assertEquals(readChillPick(store, "mini"), 0);
  assertEquals(readChillPick(store, "tiles"), 0);
  assertEquals(readChillPick(store, "sudoku"), 3);
});

Deno.test("every puzzle number of the same game saves separately", () => {
  // The daily and an extra share a game and a day; only the puzzle key differs,
  // which is the whole reason entries are keyed by it.
  let store = emptyChillStore(TODAY);
  store = putChillEntry(store, "wordle", TODAY, { guesses: ["crane"] });
  store = putChillEntry(store, "wordle", `${TODAY}#1`, { guesses: ["stone", "notes"] });
  assertEquals(readChillEntry(store, "wordle", TODAY), { guesses: ["crane"] });
  assertEquals(readChillEntry(store, "wordle", `${TODAY}#1`), { guesses: ["stone", "notes"] });
  assertEquals(chillEntryKey("wordle", TODAY), "wordle.2026-08-06");
});

Deno.test("writing one game never disturbs another, or the store it came from", () => {
  const before = putChillEntry(emptyChillStore(TODAY), "bee", TODAY, { found: ["honey"] });
  const after = putChillEntry(before, "sudoku", TODAY, { entries: { "0-0": 4 } });
  assertEquals(readChillEntry(before, "sudoku", TODAY), null, "the original store is untouched");
  assertEquals(readChillEntry(after, "bee", TODAY), { found: ["honey"] });
});

Deno.test("going back to the daily clears the pick instead of storing a zero", () => {
  const picked = putChillPick(emptyChillStore(TODAY), "mini", 2);
  assertEquals(picked.picks, { mini: 2 });
  assertEquals(putChillPick(picked, "mini", 0).picks, {});
});

Deno.test("a missing entry reads as null, not undefined", () => {
  assertEquals(readChillEntry(emptyChillStore(TODAY), "tiles", TODAY), null);
});
