import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deckMastery } from "./study-progress.ts";

Deno.test("deckMastery: an empty deck has no ratio (never render a fake 0%)", () => {
  assertEquals(deckMastery([]), { total: 0, matureCount: 0, ratio: null });
});

Deno.test("deckMastery: brand-new cards (repetitions 0) are never mature", () => {
  const result = deckMastery([
    { repetitions: 0, intervalDays: 0 },
    { repetitions: 0, intervalDays: 40 },
  ]);
  assertEquals(result, { total: 2, matureCount: 0, ratio: 0 });
});

Deno.test("deckMastery: a reviewed card below the 21-day boundary is still learning, not mature", () => {
  const result = deckMastery([{ repetitions: 3, intervalDays: 20 }]);
  assertEquals(result, { total: 1, matureCount: 0, ratio: 0 });
});

Deno.test("deckMastery: exactly 21 days counts as mature (inclusive boundary)", () => {
  const result = deckMastery([{ repetitions: 1, intervalDays: 21 }]);
  assertEquals(result, { total: 1, matureCount: 1, ratio: 1 });
});

Deno.test("deckMastery: a suspended-looking but repetitions>0 card past 21 days still counts (no suspended field here)", () => {
  const result = deckMastery([{ repetitions: 2, intervalDays: 21 }]);
  assertEquals(result.matureCount, 1);
});

Deno.test("deckMastery: mixed deck computes the correct ratio", () => {
  const cards = [
    { repetitions: 0, intervalDays: 0 }, // new
    { repetitions: 2, intervalDays: 10 }, // learning
    { repetitions: 5, intervalDays: 45 }, // mature
    { repetitions: 8, intervalDays: 100 }, // mature
  ];
  const result = deckMastery(cards);
  assertEquals(result.total, 4);
  assertEquals(result.matureCount, 2);
  assertEquals(result.ratio, 0.5);
});
