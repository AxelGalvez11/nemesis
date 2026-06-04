// Deno unit test (repo convention) for the one piece of real logic in 6b-1: the
// jsonb -> DTO narrowing. Run: deno test --no-check apps/mobile/src/api/cast.test.ts
// (--no-check: the `import type` from @pharmabro/shared is erased at runtime).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { toDrugOverview } from "./cast.ts";

Deno.test("toDrugOverview: null/undefined body -> null", () => {
  assertEquals(toDrugOverview(null), null);
  assertEquals(toDrugOverview(undefined), null);
});

Deno.test("toDrugOverview: array -> null (a jsonb object is expected)", () => {
  assertEquals(toDrugOverview([1, 2]), null);
});

Deno.test("toDrugOverview: object passes through to the DTO", () => {
  const raw = { id: "abc", canonical_name: "semaglutide", approved_status: "approved" };
  assertEquals(toDrugOverview(raw)?.canonical_name, "semaglutide");
});

Deno.test("toDrugOverview: object missing a mandatory field -> null", () => {
  assertEquals(toDrugOverview({ id: "abc" }), null); // no canonical_name
  assertEquals(toDrugOverview({ canonical_name: "x" }), null); // no id
});
