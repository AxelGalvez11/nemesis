// Tests for the deterministic evidence-grade ceiling — the post-generation override
// that lets the §9 countable-evidence tier lower (never raise) the LLM's self-grade.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyGradeCeiling, fetchStoredEvidenceGrade } from "./evidence-grade.ts";

// Minimal Response stub so the I/O fallback paths can be exercised without a network.
function resp(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}
const SB = "https://example.supabase.co";
const KEY = "service-key";

Deno.test("deterministic tier weaker than LLM grade → lowers to deterministic", () => {
  assertEquals(applyGradeCeiling("strong", "weak"), "weak");
  assertEquals(applyGradeCeiling("very_strong", "moderate"), "moderate");
  assertEquals(applyGradeCeiling("moderate", "very_weak"), "very_weak");
});

Deno.test("deterministic tier stronger than LLM grade → keeps LLM (never inflates)", () => {
  assertEquals(applyGradeCeiling("weak", "strong"), "weak");
  assertEquals(applyGradeCeiling("very_weak", "very_strong"), "very_weak");
  assertEquals(applyGradeCeiling("moderate", "strong"), "moderate");
});

Deno.test("equal tiers → unchanged", () => {
  assertEquals(applyGradeCeiling("moderate", "moderate"), "moderate");
  assertEquals(applyGradeCeiling("strong", "strong"), "strong");
});

Deno.test("no stored tier (null) → keeps LLM grade (graceful fallback)", () => {
  assertEquals(applyGradeCeiling("strong", null), "strong");
  assertEquals(applyGradeCeiling("unknown", null), "unknown");
  assertEquals(applyGradeCeiling("not_applicable", null), "not_applicable");
});

Deno.test("stored 'unknown' is off the ladder → never lowers a real grade (first ship)", () => {
  // §9 emits 'unknown' only when it finds zero gradeable evidence, and its own RANK
  // treats unknown as the floor. We deliberately DON'T lower on it yet: until the
  // pubmed_articles projection is confirmed mature, an 'unknown' could be a false
  // negative, and floor-lowering a correct answer would degrade it. Tighten later.
  assertEquals(applyGradeCeiling("strong", "unknown"), "strong");
  assertEquals(applyGradeCeiling("very_weak", "unknown"), "very_weak");
});

Deno.test("LLM 'unknown' / 'not_applicable' off the ladder → never raised by a stored tier", () => {
  assertEquals(applyGradeCeiling("unknown", "strong"), "unknown");
  assertEquals(applyGradeCeiling("unknown", "weak"), "unknown");
  assertEquals(applyGradeCeiling("not_applicable", "very_strong"), "not_applicable");
});

Deno.test("full ladder sweep — result is always min(llm, deterministic) for on-ladder pairs", () => {
  const ladder = ["very_weak", "weak", "moderate", "strong", "very_strong"] as const;
  for (let i = 0; i < ladder.length; i++) {
    for (let j = 0; j < ladder.length; j++) {
      const expected = ladder[Math.min(i, j)];
      assertEquals(applyGradeCeiling(ladder[i], ladder[j]), expected,
        `ceiling(${ladder[i]}, ${ladder[j]}) should be ${expected}`);
    }
  }
});

// ---- fetchStoredEvidenceGrade: every failure mode must return null (graceful) ----

Deno.test("fetch: a stored drug-level row returns its tier", async () => {
  const grade = await fetchStoredEvidenceGrade("uuid-1", SB, KEY,
    () => Promise.resolve(resp(true, [{ score: "moderate" }])));
  assertEquals(grade, "moderate");
});

Deno.test("fetch: no row (empty result) → null", async () => {
  const grade = await fetchStoredEvidenceGrade("uuid-1", SB, KEY,
    () => Promise.resolve(resp(true, [])));
  assertEquals(grade, null);
});

Deno.test("fetch: non-ok HTTP status → null", async () => {
  const grade = await fetchStoredEvidenceGrade("uuid-1", SB, KEY,
    () => Promise.resolve(resp(false, [])));
  assertEquals(grade, null);
});

Deno.test("fetch: network throw → null (never propagates)", async () => {
  const grade = await fetchStoredEvidenceGrade("uuid-1", SB, KEY,
    () => Promise.reject(new Error("boom")));
  assertEquals(grade, null);
});

Deno.test("fetch: emits a correctly-scoped PostgREST query (drug-level, claim_text IS NULL)", async () => {
  let seen = "";
  await fetchStoredEvidenceGrade("abc-123", SB, KEY, (input) => {
    seen = String(input);
    return Promise.resolve(resp(true, [{ score: "strong" }]));
  });
  const u = new URL(seen);
  assertEquals(u.searchParams.get("entity_id"), "eq.abc-123");
  assertEquals(u.searchParams.get("entity_type"), "eq.drug");
  assertEquals(u.searchParams.get("claim_text"), "is.null");
  assertEquals(u.searchParams.get("limit"), "1");
});
