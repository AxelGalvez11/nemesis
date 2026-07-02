import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeSnapshot } from "./snapshot.ts";

Deno.test("sanitizeSnapshot keeps clean fields and clamps junk", () => {
  assertEquals(
    sanitizeSnapshot({ population: "healthy young adults", sample_size: 34, duration: "10 weeks", design: "randomized controlled trial" }),
    { population: "healthy young adults", sample_size: 34, duration: "10 weeks", design: "randomized controlled trial" },
  );
});

Deno.test("sanitizeSnapshot nulls non-answers and absurd n", () => {
  assertEquals(
    sanitizeSnapshot({ population: "not stated", sample_size: -5, duration: "unknown", design: "" }),
    { population: null, sample_size: null, duration: null, design: null },
  );
  assertEquals(sanitizeSnapshot(null), null);
});
