// Tests for the pure compare assembler. Run: deno test supabase/functions/compare/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildComparison, type CompareSideInput } from "./build.ts";
import type { SourceRef } from "../../../packages/shared/src/search.ts";

function src(id: string): SourceRef {
  return { source_id: id, provider: "openfda", title: null, url: null, license: null, retrieved_at: null };
}

function side(p: Partial<CompareSideInput> = {}): CompareSideInput {
  return {
    id: "L",
    name: "Left",
    approved_status: "approved",
    mechanism_summary: "mech-L",
    evidence: { score: "strong", rationale: "r-L" },
    indications: "uses-L",
    boxed_warning: null,
    key_warnings: "warn-L",
    trial_count: 3,
    latest_trial_status: "COMPLETED",
    price_points: 2,
    sources: [src("s1")],
    ...p,
  };
}

Deno.test("buildComparison pairs every section left/right", () => {
  const c = buildComparison(
    side(),
    side({ id: "R", name: "Right", approved_status: "investigational", mechanism_summary: "mech-R",
      evidence: { score: "weak", rationale: "r-R" }, indications: "uses-R", key_warnings: "warn-R",
      trial_count: 7, latest_trial_status: "RECRUITING", price_points: 0, sources: [src("s2")] }),
  );
  assertEquals(c.left, { id: "L", name: "Left", approved_status: "approved" });
  assertEquals(c.right, { id: "R", name: "Right", approved_status: "investigational" });
  assertEquals(c.sections.mechanism, { left: "mech-L", right: "mech-R" });
  assertEquals(c.sections.approved_uses, { left: "uses-L", right: "uses-R" });
  assertEquals(c.sections.evidence_strength.left, { score: "strong", rationale: "r-L" });
  assertEquals(c.sections.evidence_strength.right, { score: "weak", rationale: "r-R" });
  assertEquals(c.sections.trial_status.left, { count: 3, latest_status: "COMPLETED" });
  assertEquals(c.sections.trial_status.right, { count: 7, latest_status: "RECRUITING" });
  assertEquals(c.sections.safety.left, { boxed_warning: null, key_warnings: "warn-L" });
  assertEquals(c.sections.cost_access.right, { approved_status: "investigational", price_points: 0 });
});

Deno.test("buildComparison unions + dedupes sources (left-first, by source_id)", () => {
  const c = buildComparison(
    side({ sources: [src("s1"), src("s2")] }),
    side({ id: "R", sources: [src("s2"), src("s3")] }), // s2 shared
  );
  assertEquals(c.sources.map((s) => s.source_id), ["s1", "s2", "s3"]);
});

Deno.test("buildComparison carries nulls through (missing evidence/mechanism)", () => {
  const c = buildComparison(
    side({ evidence: null, mechanism_summary: null, indications: null }),
    side({ id: "R", boxed_warning: "BOXED", latest_trial_status: null }),
  );
  assertEquals(c.sections.evidence_strength.left, null);
  assertEquals(c.sections.mechanism.left, null);
  assertEquals(c.sections.approved_uses.left, null);
  assertEquals(c.sections.safety.right.boxed_warning, "BOXED");
  assertEquals(c.sections.trial_status.right.latest_status, null);
});

Deno.test("buildComparison handles empty sources on both sides", () => {
  const c = buildComparison(side({ sources: [] }), side({ id: "R", sources: [] }));
  assertEquals(c.sources, []);
});
