// eval/lib/metrics.test.ts
import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dcgAtK, mrr, ndcgAtK, recallAtK } from "./metrics.ts";

Deno.test("recallAtK counts gold hits in top-k over gold size", () => {
  const ranked = ["a", "b", "c", "d"];
  const gold = new Set(["a", "c"]);
  assertEquals(recallAtK(ranked, gold, 2), 0.5); // top2=[a,b] → {a} hit / 2 gold
  assertEquals(recallAtK(ranked, gold, 4), 1.0); // {a,c} / 2
  assertEquals(recallAtK(ranked, gold, 1), 0.5); // {a} / 2
});

Deno.test("recallAtK returns 0 for empty gold (unanswerable)", () => {
  assertEquals(recallAtK(["a"], new Set<string>(), 10), 0);
});

Deno.test("mrr is reciprocal rank of first gold hit, 0 if none", () => {
  assertEquals(mrr(["a", "b", "c"], new Set(["a"])), 1.0);
  assertAlmostEquals(mrr(["a", "b", "c"], new Set(["c"])), 1 / 3, 1e-9);
  assertEquals(mrr(["a", "b"], new Set(["z"])), 0);
});

Deno.test("ndcgAtK normalizes DCG against the ideal ranking", () => {
  const ranked = ["a", "b"]; // a relevant @1, b not
  const gold = new Set(["a", "c"]); // 2 relevant total
  // DCG@2 = 1/log2(2) = 1 ; IDCG@2 = 1/log2(2)+1/log2(3) = 1 + 0.63093 = 1.63093
  assertAlmostEquals(ndcgAtK(ranked, gold, 2), 1 / 1.6309297535714573, 1e-6);
  // perfect ranking → 1.0
  assertAlmostEquals(ndcgAtK(["a", "c"], gold, 2), 1.0, 1e-9);
});

Deno.test("dcgAtK sums 1/log2(i+2) for gold hits in top-k", () => {
  assertAlmostEquals(dcgAtK(["a", "b"], new Set(["a", "b"]), 2), 1 + 1 / Math.log2(3), 1e-9);
});
