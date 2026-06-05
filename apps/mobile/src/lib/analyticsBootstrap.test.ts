// Deno unit tests for the analytics bootstrap. Run: deno test --no-check apps/mobile/src/lib/analyticsBootstrap.test.ts
//
// The PostHog-connected path can't be unit-tested here (the native SDK isn't
// installed — the operator runs `expo install`). These lock the parts that ARE
// deterministic: consent is restored at boot, no key stays no-op, and a missing
// SDK degrades to no-op without throwing.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bootstrapAnalytics, resetBootGuardForTests } from "./analyticsBootstrap.ts";
import { type ConsentStore } from "./analyticsConsent.ts";
import { capture, configureAnalytics, isOptedOut, resetAnalyticsSink, setOptOut } from "./analytics.ts";

function memStore(initial: Record<string, string> = {}): ConsentStore {
  const data = { ...initial };
  return {
    getItemAsync: (k) => Promise.resolve(k in data ? data[k] : null),
    setItemAsync: (k, v) => {
      data[k] = v;
      return Promise.resolve();
    },
  };
}

Deno.test("bootstrap restores the persisted opt-out before any sink is wired", async () => {
  resetBootGuardForTests();
  setOptOut(false);
  resetAnalyticsSink();
  await bootstrapAnalytics(memStore({ analytics_opt_out: "true" }), {});
  assert(isOptedOut());
  setOptOut(false);
});

Deno.test("bootstrap with NO key leaves analytics as the inert no-op (no throw)", async () => {
  resetBootGuardForTests();
  setOptOut(false);
  resetAnalyticsSink();
  // record into a sink to prove no real sink was wired by bootstrap
  const events: string[] = [];
  configureAnalytics({ capture: (e) => events.push(e) });
  await bootstrapAnalytics(memStore(), { posthogKey: undefined });
  // bootstrap didn't replace our recording sink (it returned early), so capture still routes to it
  capture("drug_page_viewed", { entity_id: "11111111-1111-1111-1111-111111111111" });
  assertEquals(events, ["drug_page_viewed"]);
  resetAnalyticsSink();
});

Deno.test("bootstrap with a key but the SDK absent degrades to no-op (no throw)", async () => {
  resetBootGuardForTests();
  setOptOut(false);
  resetAnalyticsSink();
  // posthog-react-native isn't installed in the test env → the dynamic import
  // throws → bootstrap swallows it and leaves the no-op sink. Must not reject.
  await bootstrapAnalytics(memStore(), { posthogKey: "phc_test", posthogHost: "https://us.i.posthog.com" });
  capture("answer_viewed", { evidence_grade: "strong" }); // no sink → no throw
  resetAnalyticsSink();
});
