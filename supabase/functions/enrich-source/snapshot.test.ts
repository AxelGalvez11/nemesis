import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveWithin, sanitizeSnapshot } from "./snapshot.ts";

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

// ── resolveWithin: the LLM-call timeout wrapper (F4) ──

Deno.test("resolveWithin passes through a value that settles before the deadline", async () => {
  assertEquals(await resolveWithin(Promise.resolve("snapshot"), 1000), "snapshot");
});

Deno.test("resolveWithin resolves null when the promise outlives the deadline", async () => {
  // A bare never-settling promise (no timers attached) — the wrapper's own timer fires.
  assertEquals(await resolveWithin(new Promise<string>(() => {}), 5), null);
});

Deno.test("resolveWithin maps a rejection to null (never throws)", async () => {
  assertEquals(await resolveWithin(Promise.reject(new Error("llm down")), 1000), null);
});
