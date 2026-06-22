import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideNewsGate } from "./news-gate.ts";

const base = { liveSourcesOn: true };

Deno.test("decideNewsGate: Plus on a drug question → fetch the panel (paid, unlocked)", () => {
  const d = decideNewsGate({ ...base, plan: "plus", entityMentions: ["ozempic"] });
  assertEquals(d, { fetch: true, locked: false, query: "ozempic" });
});

Deno.test("decideNewsGate: Pro on a drug question → fetch the panel (paid, unlocked)", () => {
  const d = decideNewsGate({ ...base, plan: "pro", entityMentions: ["tirzepatide"] });
  assertEquals(d, { fetch: true, locked: false, query: "tirzepatide" });
});

Deno.test("decideNewsGate: Free on a drug question → locked upgrade teaser, never fetches", () => {
  const d = decideNewsGate({ ...base, plan: "free", entityMentions: ["ozempic"] });
  assertEquals(d, { fetch: false, locked: true, query: "ozempic" });
});

Deno.test("decideNewsGate: an unknown/blank plan is treated as unpaid (locked, never fetch)", () => {
  // Safe default: anything not explicitly plus/pro must not get the paid panel.
  assertEquals(decideNewsGate({ ...base, plan: "", entityMentions: ["metformin"] }).fetch, false);
  assertEquals(decideNewsGate({ ...base, plan: "trialing", entityMentions: ["metformin"] }).locked, true);
});

Deno.test("decideNewsGate: paid but NO drug named → nothing to show (no fetch, no teaser)", () => {
  const d = decideNewsGate({ ...base, plan: "pro", entityMentions: [] });
  assertEquals(d, { fetch: false, locked: false, query: "" });
});

Deno.test("decideNewsGate: free + NO drug → no teaser (don't tease a panel a paid user wouldn't see either)", () => {
  const d = decideNewsGate({ ...base, plan: "free", entityMentions: [] });
  assertEquals(d, { fetch: false, locked: false, query: "" });
});

Deno.test("decideNewsGate: whitespace-only mentions are treated as no drug", () => {
  const d = decideNewsGate({ ...base, plan: "pro", entityMentions: ["   ", ""] });
  assertEquals(d, { fetch: false, locked: false, query: "" });
});

Deno.test("decideNewsGate: live sources OFF → news disabled for everyone (no fetch, no teaser)", () => {
  assertEquals(decideNewsGate({ liveSourcesOn: false, plan: "pro", entityMentions: ["ozempic"] }), {
    fetch: false,
    locked: false,
    query: "ozempic",
  });
});

Deno.test("decideNewsGate: multiple drugs join into one news query", () => {
  const d = decideNewsGate({ ...base, plan: "plus", entityMentions: ["ozempic", "wegovy"] });
  assertEquals(d.query, "ozempic wegovy");
  assertEquals(d.fetch, true);
});
