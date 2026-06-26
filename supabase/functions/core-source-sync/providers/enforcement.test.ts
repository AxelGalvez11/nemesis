import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeEnforcementResult, sanitizeEnforcementQuery } from "./enforcement.ts";

Deno.test("sanitizeEnforcementQuery strips openFDA query-breakout characters", () => {
  assertEquals(sanitizeEnforcementQuery(`semaglutide" OR status:"Ongoing`), "semaglutide OR status: Ongoing");
});

Deno.test("normalizeEnforcementResult maps an openFDA recall row into a citable safety source", async () => {
  const source = await normalizeEnforcementResult({
    recall_number: "D-1234-2026",
    product_description: "Semaglutide injection",
    reason_for_recall: "Temperature excursion",
    status: "Ongoing",
    classification: "Class II",
    report_date: "20260601",
    recalling_firm: "Example Firm",
  }, "semaglutide");

  assertEquals(source?.provider, "fda_safety");
  assertEquals(source?.provider_id, "openfda-enforcement:D-1234-2026");
  assertEquals(source?.title, "FDA enforcement recall: Semaglutide injection");
  assertEquals(source?.effective_at?.startsWith("2026-06-01"), true);
  assertEquals(source?.metadata.query, "semaglutide");
});
