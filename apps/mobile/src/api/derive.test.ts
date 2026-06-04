// Deno unit tests for the pure Source-Viewer state selector.
// Run: deno test --no-check apps/mobile/src/api/derive.test.ts
//
// WHY this is a unit test and not a Playwright assertion: the live corpus has ZERO
// superseded sources (verified: core_sources WHERE superseded_at IS NOT NULL == 0),
// so is_current is always true and no live source can drive the doc-06 "outdated"
// state. We therefore prove the outdated branch prop-driven, here, rather than
// claiming a real-data outdated path in the gate. (Honesty guard.)
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { answerFreshness, answerKind, sourceViewState } from "./derive.ts";

Deno.test("sourceViewState: null -> not-found", () => {
  assertEquals(sourceViewState(null), "not-found");
});

Deno.test("sourceViewState: current source -> ok", () => {
  assertEquals(sourceViewState({ is_current: true } as never), "ok");
});

Deno.test("sourceViewState: superseded source -> outdated (the prop-driven proof)", () => {
  assertEquals(sourceViewState({ is_current: false } as never), "outdated");
});

// answerKind — the AnswerView render-shape decision. The refused/zero-citation branch
// has no deterministic live trigger (a made-up compound still retrieves neighbors), so
// it is proven here prop-driven rather than via a flaky Playwright LLM call.
Deno.test("answerKind: emergency via template", () => {
  assertEquals(answerKind({ template: "emergency_routing", safety_flags: [], refused_unsupported: false } as never), "emergency");
});

Deno.test("answerKind: emergency via a hard safety flag", () => {
  assertEquals(answerKind({ safety_flags: ["overdose_possible"], refused_unsupported: false } as never), "emergency");
});

Deno.test("answerKind: refused (no hard flag/template) -> refused", () => {
  assertEquals(answerKind({ safety_flags: ["no_sources_found"], refused_unsupported: true } as never), "refused");
});

Deno.test("answerKind: a caution-only flag (insulin) is NOT emergency -> normal", () => {
  assertEquals(answerKind({ safety_flags: ["insulin"], refused_unsupported: false } as never), "normal");
});

Deno.test("answerKind: plain answer -> normal", () => {
  assertEquals(answerKind({ safety_flags: [], refused_unsupported: false } as never), "normal");
});

// answerFreshness — the Ask/outdated cell. Driven by oldest_source_date with `now`
// injected (the live date mix is not a deterministic trigger, so it is proven here).
const NOW = new Date("2026-06-04T00:00:00Z");

Deno.test("answerFreshness: no oldest date -> not stale", () => {
  assertEquals(answerFreshness({ oldest_source_date: null } as never, NOW), { oldestDate: null, stale: false });
});

Deno.test("answerFreshness: a recent source -> not stale", () => {
  assertEquals(answerFreshness({ oldest_source_date: "2025-01-01" } as never, NOW), { oldestDate: "2025-01-01", stale: false });
});

Deno.test("answerFreshness: a source older than 3y -> stale (outdated banner)", () => {
  assertEquals(answerFreshness({ oldest_source_date: "2019-06-04" } as never, NOW), { oldestDate: "2019-06-04", stale: true });
});

Deno.test("answerFreshness: a garbage date -> not stale (no false banner)", () => {
  assertEquals(answerFreshness({ oldest_source_date: "not-a-date" } as never, NOW), { oldestDate: null, stale: false });
});
