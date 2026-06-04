// Deno unit tests for the pure Source-Viewer state selector.
// Run: deno test --no-check apps/mobile/src/api/derive.test.ts
//
// WHY this is a unit test and not a Playwright assertion: the live corpus has ZERO
// superseded sources (verified: core_sources WHERE superseded_at IS NOT NULL == 0),
// so is_current is always true and no live source can drive the doc-06 "outdated"
// state. We therefore prove the outdated branch prop-driven, here, rather than
// claiming a real-data outdated path in the gate. (Honesty guard.)
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sourceViewState } from "./derive.ts";

Deno.test("sourceViewState: null -> not-found", () => {
  assertEquals(sourceViewState(null), "not-found");
});

Deno.test("sourceViewState: current source -> ok", () => {
  assertEquals(sourceViewState({ is_current: true } as never), "ok");
});

Deno.test("sourceViewState: superseded source -> outdated (the prop-driven proof)", () => {
  assertEquals(sourceViewState({ is_current: false } as never), "outdated");
});
