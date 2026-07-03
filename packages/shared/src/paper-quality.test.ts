// TDD for the deterministic per-paper journal-quality tier (WS-1). The tier is
// computed here, by pure functions, and is NEVER touched by the LLM — the same
// "deterministic + auditable" guarantee as evidence-scoring.ts. These tests ARE
// the spec: every band boundary plus the positive-only (never-downgrade) rule
// and the conservative "unranked" default. Run: deno test packages/shared/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  journalTier,
  computePaperQuality,
  Q1_CITEDNESS,
  Q2_CITEDNESS,
  Q3_CITEDNESS,
  type JournalTier,
  type PaperQualityInputs,
} from "./paper-quality.ts";

// Conservative baseline: no venue metric, not DOAJ, not OA. Each test overrides
// only the fields under test, so an assertion reads as "these inputs → tier".
function inputs(p: Partial<PaperQualityInputs> = {}): PaperQualityInputs {
  return {
    mean_citedness_2yr: null,
    h_index: null,
    is_in_doaj: false,
    is_oa: false,
    ...p,
  };
}

// ── The documented thresholds are what the tests pin (not magic literals). ──
Deno.test("thresholds are the documented 8/3/1 ladder", () => {
  assertEquals([Q1_CITEDNESS, Q2_CITEDNESS, Q3_CITEDNESS], [8.0, 3.0, 1.0]);
});

// ── Band boundaries (the blueprint §7 worked examples). ──
Deno.test("journalTier: band boundaries bucket on mean_citedness_2yr", () => {
  const cases: Array<[number | null, JournalTier]> = [
    [8.0, "q1"], // exactly the q1 floor
    [12.4, "q1"], // well above
    [7.99, "q2"], // just below q1
    [3.0, "q2"], // exactly the q2 floor
    [2.99, "q3"], // just below q2
    [1.0, "q3"], // exactly the q3 floor
    [0.99, "q4"], // just below q3
    [0.5, "q4"], // low but > 0
    [0.0001, "q4"], // any positive impact is at least q4
    [0, "unranked"], // no measurable 2yr impact → conservative default
    [null, "unranked"], // metric absent → NEVER a guessed tier
  ];
  for (const [m, expected] of cases) {
    assertEquals(journalTier(inputs({ mean_citedness_2yr: m })), expected, `mean=${m}`);
  }
});

Deno.test("journalTier: negative / NaN citedness degrades to unranked (never a false tier)", () => {
  assertEquals(journalTier(inputs({ mean_citedness_2yr: -1 })), "unranked");
  assertEquals(journalTier(inputs({ mean_citedness_2yr: Number.NaN })), "unranked");
});

// ── Positive-only doctrine: DOAJ / OA NEVER move the citedness tier. ──
Deno.test("journalTier: is_in_doaj does NOT raise or lower the tier (positive-only)", () => {
  // A low-citedness DOAJ journal stays q4 — the DOAJ flag is display-only.
  assertEquals(journalTier(inputs({ mean_citedness_2yr: 0.5, is_in_doaj: true })), "q4");
  // A DOAJ journal with NO metric stays unranked — DOAJ never manufactures a tier.
  assertEquals(journalTier(inputs({ mean_citedness_2yr: null, is_in_doaj: true })), "unranked");
});

Deno.test("journalTier: is_oa does NOT change the tier (informational only)", () => {
  assertEquals(journalTier(inputs({ mean_citedness_2yr: 0.5, is_oa: true })), "q4");
  assertEquals(journalTier(inputs({ mean_citedness_2yr: 10, is_oa: true })), "q1");
});

Deno.test("journalTier: h_index is not in the v1 ladder (carried, not decided on)", () => {
  // High h_index cannot promote a null-metric venue off "unranked".
  assertEquals(journalTier(inputs({ mean_citedness_2yr: null, h_index: 400 })), "unranked");
});

// ── computePaperQuality passes the modifiers through verbatim. ──
Deno.test("computePaperQuality: tiers + passes mean_citedness/is_in_doaj/is_oa through verbatim", () => {
  assertEquals(
    computePaperQuality(inputs({ mean_citedness_2yr: 0.5, is_in_doaj: true, is_oa: true })),
    { tier: "q4", mean_citedness_2yr: 0.5, is_in_doaj: true, is_oa: true },
  );
});

Deno.test("computePaperQuality: null metric → unranked, modifiers preserved", () => {
  assertEquals(
    computePaperQuality(inputs({ mean_citedness_2yr: null, is_in_doaj: false, is_oa: false })),
    { tier: "unranked", mean_citedness_2yr: null, is_in_doaj: false, is_oa: false },
  );
});

Deno.test("computePaperQuality: q1 venue preserves is_in_doaj:false and is_oa:true", () => {
  assertEquals(
    computePaperQuality(inputs({ mean_citedness_2yr: 9.2, is_in_doaj: false, is_oa: true })),
    { tier: "q1", mean_citedness_2yr: 9.2, is_in_doaj: false, is_oa: true },
  );
});
