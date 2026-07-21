import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deckRetention } from "./study-progress.ts";

Deno.test("deckRetention: an empty deck has no ratio (never render a fake 0%)", () => {
  assertEquals(deckRetention([]), null);
});

Deno.test("deckRetention: unreviewed cards give no ratio either", () => {
  assertEquals(deckRetention([{ lapses: 0, repetitions: 0 }, { lapses: 0, repetitions: 0 }]), null);
});

Deno.test("deckRetention: sums reviews and lapses across the deck", () => {
  // 10 reviews with 2 fails + 5 clean reviews = 13 correct of 15.
  const cards = [
    { lapses: 2, repetitions: 10 },
    { lapses: 0, repetitions: 5 },
    { lapses: 0, repetitions: 0 }, // new card contributes nothing
  ];
  assertEquals(deckRetention(cards), 13 / 15);
});

Deno.test("deckRetention: a card failed every time is 0, not negative", () => {
  assertEquals(deckRetention([{ lapses: 3, repetitions: 3 }]), 0);
});

Deno.test("deckRetention: clamps rows that break the lapses<=reps invariant", () => {
  // Imported/hand-edited rows could carry more lapses than reviews; clamp to 0.
  assertEquals(deckRetention([{ lapses: 9, repetitions: 4 }]), 0);
});

Deno.test("deckRetention: perfect deck reads 1", () => {
  assertEquals(deckRetention([{ lapses: 0, repetitions: 7 }]), 1);
});
