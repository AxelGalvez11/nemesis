// Deno unit tests (repo convention) for the canvas screen's pure param helpers.
// Run: deno test --no-check --unstable-sloppy-imports apps/mobile/src/lib/canvas-screen.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { capabilityFromParam, firstParam } from "./canvas-screen.ts";

Deno.test("firstParam picks the first of a repeated query key", () => {
  assertEquals(firstParam(["a", "b"]), "a");
});

Deno.test("firstParam passes a plain string through", () => {
  assertEquals(firstParam("c1"), "c1");
});

Deno.test("firstParam returns undefined for an absent param", () => {
  assertEquals(firstParam(undefined), undefined);
});

Deno.test("capabilityFromParam accepts a real capability id", () => {
  assertEquals(capabilityFromParam("research"), "research");
});

Deno.test("capabilityFromParam rejects an unknown id rather than trusting the URL", () => {
  assertEquals(capabilityFromParam("not-a-real-capability"), null);
});

Deno.test("capabilityFromParam returns null when the param is absent", () => {
  assertEquals(capabilityFromParam(undefined), null);
});

Deno.test("capabilityFromParam unwraps a repeated query key before validating", () => {
  assertEquals(capabilityFromParam(["search", "research"]), "search");
});
