import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideNewsGate } from "./news-gate.ts";

const base = { liveSourcesOn: true };

Deno.test("decideNewsGate: Plus with a query → fetch the panel (paid, unlocked)", () => {
  assertEquals(decideNewsGate({ ...base, plan: "plus", query: "ozempic" }), {
    fetch: true,
    locked: false,
    query: "ozempic",
  });
});

Deno.test("decideNewsGate: ALL non-free DB plan tiers are paid (not just plus/pro)", () => {
  // resolve_user_plan returns subscriptions.plan, CHECK-constrained to these tiers (migration 0122).
  // professional/enterprise are HIGHER than pro — they must see news, not the upgrade teaser.
  // 🔴 `nemesis` IS THE ONE THAT MATTERS NOW. Every other name here is a record
  // that still exists rather than a plan anyone can buy.
  for (const plan of ["nemesis", "plus", "pro", "max", "student", "professional", "trial", "enterprise"]) {
    const d = decideNewsGate({ ...base, plan, query: "ozempic" });
    assertEquals(d.fetch, true, `${plan} should fetch news`);
    assertEquals(d.locked, false, `${plan} should not be locked`);
  }
  // free is the ONLY tier that sees the teaser.
  assertEquals(decideNewsGate({ ...base, plan: "free", query: "ozempic" }).locked, true);
});

Deno.test("decideNewsGate: Free with a query → locked upgrade teaser, never fetches", () => {
  assertEquals(decideNewsGate({ ...base, plan: "free", query: "metformin" }), {
    fetch: false,
    locked: true,
    query: "metformin",
  });
});

Deno.test("decideNewsGate: news shows on ANY question, not just drug ones (a plain topic query qualifies)", () => {
  // The owner widened scope: the caller passes the drug mentions OR the extracted topic; either way a
  // non-empty query makes the panel eligible.
  const paid = decideNewsGate({ ...base, plan: "pro", query: "ozempic heart failure" });
  assertEquals(paid.fetch, true);
  const free = decideNewsGate({ ...base, plan: "free", query: "intermittent fasting" });
  assertEquals(free.locked, true);
});

Deno.test("decideNewsGate: an unknown/blank plan is treated as unpaid (locked, never fetch)", () => {
  // Safe default: anything not a known paid tier (incl. "", garbage, or a leaked status string) must
  // not get the paid panel — fail CLOSED so the paid feature is never given away by accident.
  assertEquals(decideNewsGate({ ...base, plan: "", query: "metformin" }).fetch, false);
  assertEquals(decideNewsGate({ ...base, plan: "trialing", query: "metformin" }).locked, true);
});

Deno.test("decideNewsGate: an empty query → nothing to show (no fetch, no teaser) for anyone", () => {
  assertEquals(decideNewsGate({ ...base, plan: "pro", query: "" }), { fetch: false, locked: false, query: "" });
  assertEquals(decideNewsGate({ ...base, plan: "free", query: "   " }), { fetch: false, locked: false, query: "" });
});

Deno.test("decideNewsGate: live sources OFF → news disabled for everyone (no fetch, no teaser)", () => {
  assertEquals(decideNewsGate({ liveSourcesOn: false, plan: "pro", query: "ozempic" }), {
    fetch: false,
    locked: false,
    query: "ozempic",
  });
});

Deno.test("decideNewsGate: the query is trimmed", () => {
  assertEquals(decideNewsGate({ ...base, plan: "plus", query: "  ozempic  " }).query, "ozempic");
});
