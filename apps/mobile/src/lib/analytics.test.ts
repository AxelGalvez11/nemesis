// Deno unit tests (repo convention) for the privacy-enforcing analytics core.
// Run: deno test --no-check apps/mobile/src/lib/analytics.test.ts
//
// The load-bearing tests are the PRIVACY ones: doc-14 forbids sending any health
// detail to analytics. sanitizeProps() is the deterministic guarantee — it gates
// both the KEY (allowlist) and the VALUE (UUID for entity_id, enum for
// intent/grade/plan, slug-token for the rest). A caller passing a drug name or raw
// question text — even on an allowed key — must leak nothing. These lock that.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ALLOWED_PROP_KEYS,
  type AnalyticsSink,
  capture,
  configureAnalytics,
  type EventProps,
  flushAnalytics,
  identify,
  isOptedOut,
  resetAnalyticsSink,
  resetAnalyticsUser,
  sanitizeProps,
  setOptOut,
} from "./analytics.ts";

const UUID = "11111111-1111-1111-1111-111111111111";

function recordingSink(): {
  sink: AnalyticsSink;
  events: Array<{ event: string; props: EventProps }>;
} {
  const events: Array<{ event: string; props: EventProps }> = [];
  return { events, sink: { capture: (event, props) => events.push({ event, props }) } };
}

function reset() {
  resetAnalyticsSink();
  setOptOut(false);
}

// ---------------------------------------------------------------------------
// sanitizeProps — KEY allowlist
// ---------------------------------------------------------------------------

Deno.test("sanitizeProps DROPS health-identifying / free-text keys", () => {
  assertEquals(
    sanitizeProps({
      medications: ["warfarin", "lisinopril"],
      conditions: ["afib"],
      allergies: ["penicillin"],
      question: "can I take ibuprofen with lisinopril",
      query: "ibuprofen lisinopril",
      health_context: "age 60; warfarin",
      email: "a@b.com",
    }),
    {},
  );
});

Deno.test("sanitizeProps KEEPS allowlisted keys with valid values", () => {
  const clean = { entity_id: UUID, intent: "drug_interaction", count: 3, is_guest: true };
  assertEquals(sanitizeProps(clean), clean);
});

Deno.test("sanitizeProps keeps valid allowed keys, drops disallowed ones (mixed)", () => {
  assertEquals(
    sanitizeProps({ entity_id: UUID, medications: ["x"], intent: "dosing", question: "q" }),
    { entity_id: UUID, intent: "dosing" },
  );
});

Deno.test("ALLOWED_PROP_KEYS contains no health/PII-shaped key", () => {
  const forbidden = ["medications", "conditions", "allergies", "question", "query", "health_context", "email", "name"];
  for (const k of ALLOWED_PROP_KEYS) assert(!forbidden.includes(k), `allowlist must not contain ${k}`);
});

Deno.test("sanitizeProps drops __proto__ / constructor keys (no prototype pollution)", () => {
  assertEquals(sanitizeProps({ ["__proto__"]: { admin: true }, ["constructor"]: "leak" } as Record<string, unknown>), {});
});

// ---------------------------------------------------------------------------
// sanitizeProps — VALUE contract (the HIGH-finding fix: content, not just type)
// ---------------------------------------------------------------------------

Deno.test("entity_id must be a UUID — a drug NAME is dropped", () => {
  assertEquals(sanitizeProps({ entity_id: "warfarin" }), {}); // not a UUID
  assertEquals(sanitizeProps({ entity_id: UUID }), { entity_id: UUID });
});

Deno.test("intent must be a known enum — raw question text is dropped", () => {
  assertEquals(sanitizeProps({ intent: "can I take ibuprofen with lisinopril" }), {});
  assertEquals(sanitizeProps({ intent: "drug_interaction" }), { intent: "drug_interaction" });
});

Deno.test("evidence_grade and plan must be known enums", () => {
  assertEquals(sanitizeProps({ evidence_grade: "definitely_curative" }), {});
  assertEquals(sanitizeProps({ evidence_grade: "strong" }), { evidence_grade: "strong" });
  assertEquals(sanitizeProps({ plan: "warfarin 5mg daily" }), {});
  assertEquals(sanitizeProps({ plan: "pro" }), { plan: "pro" });
});

Deno.test("slug-token keys reject free text (spaces) — a health phrase can't ride through", () => {
  assertEquals(sanitizeProps({ source_type: "took 2 warfarin this morning" }), {});
  assertEquals(sanitizeProps({ source_type: "openfda" }), { source_type: "openfda" });
  assertEquals(sanitizeProps({ screen: "this is free text" }), {});
  assertEquals(sanitizeProps({ screen: "drug_page" }), { screen: "drug_page" });
});

Deno.test("numeric keys require a finite number; NaN/Infinity/non-scalar dropped", () => {
  assertEquals(sanitizeProps({ count: 5 }), { count: 5 });
  assertEquals(sanitizeProps({ count: Number.NaN }), {});
  assertEquals(sanitizeProps({ count: Number.POSITIVE_INFINITY }), {});
  assertEquals(sanitizeProps({ count: [1, 2] as unknown as number }), {});
});

Deno.test("null/object values on an allowlisted key are dropped", () => {
  assertEquals(sanitizeProps({ entity_id: null as unknown as string, intent: { x: 1 } as unknown as string }), {});
});

Deno.test("sanitizeProps handles undefined", () => {
  assertEquals(sanitizeProps(undefined), {});
});

// ---------------------------------------------------------------------------
// capture — event-name gate, sink routing, opt-out, never-throws
// ---------------------------------------------------------------------------

Deno.test("capture forwards SANITIZED props to the configured sink", () => {
  reset();
  const { sink, events } = recordingSink();
  configureAnalytics(sink);
  capture("ask_question_submitted", { intent: "dosing", question: "secret", medications: ["x"] });
  assertEquals(events, [{ event: "ask_question_submitted", props: { intent: "dosing" } }]);
  reset();
});

Deno.test("capture DROPS an unknown event name (only the doc-14 taxonomy emits)", () => {
  reset();
  const { sink, events } = recordingSink();
  configureAnalytics(sink);
  capture("totally_made_up_event" as Parameters<typeof capture>[0], { count: 1 });
  assertEquals(events.length, 0);
  reset();
});

Deno.test("capture is a NO-OP when opted out (consent withdrawal)", () => {
  reset();
  const { sink, events } = recordingSink();
  configureAnalytics(sink);
  setOptOut(true);
  capture("answer_viewed", { evidence_grade: "strong" });
  assertEquals(events.length, 0);
  reset();
});

Deno.test("opt-out then opt-in resumes capture", () => {
  reset();
  const { sink, events } = recordingSink();
  configureAnalytics(sink);
  setOptOut(true);
  capture("answer_viewed");
  setOptOut(false);
  capture("answer_viewed");
  assertEquals(events.length, 1);
  reset();
});

Deno.test("isOptedOut reflects setOptOut", () => {
  reset();
  assertEquals(isOptedOut(), false);
  setOptOut(true);
  assertEquals(isOptedOut(), true);
  reset();
});

Deno.test("capture never throws even if the sink throws (analytics must not break the app)", () => {
  reset();
  configureAnalytics({ capture: () => { throw new Error("sink boom"); } });
  capture("search_submitted", { count: 1 }); // must not throw
  reset();
});

Deno.test("default sink is a no-op (inert until an operator wires a provider)", () => {
  reset();
  capture("drug_page_viewed", { entity_id: UUID }); // no sink configured -> no throw
  reset();
});

// ---------------------------------------------------------------------------
// identify / reset / flush
// ---------------------------------------------------------------------------

Deno.test("identify forwards only sanitized props and rejects email-shaped ids", () => {
  reset();
  const calls: Array<{ id: string; props?: EventProps }> = [];
  configureAnalytics({ capture: () => {}, identify: (id, props) => calls.push({ id, props }) });

  identify("user-uuid-1", { plan: "pro", medications: ["x"] });
  assertEquals(calls, [{ id: "user-uuid-1", props: { plan: "pro" } }]);

  identify("alice@example.com", { plan: "pro" }); // email-shaped PII -> rejected
  identify("", { plan: "pro" }); // empty -> rejected
  assertEquals(calls.length, 1);
  reset();
});

Deno.test("identify respects opt-out", () => {
  reset();
  const calls: string[] = [];
  configureAnalytics({ capture: () => {}, identify: (id) => calls.push(id) });
  setOptOut(true);
  identify("user-1");
  assertEquals(calls.length, 0);
  reset();
});

Deno.test("resetAnalyticsUser calls sink.reset and swallows errors", () => {
  reset();
  let resetCalled = false;
  configureAnalytics({ capture: () => {}, reset: () => { resetCalled = true; } });
  resetAnalyticsUser();
  assert(resetCalled);
  configureAnalytics({ capture: () => {}, reset: () => { throw new Error("boom"); } });
  resetAnalyticsUser(); // must not throw
  reset();
});

Deno.test("flushAnalytics awaits sink.flush and swallows errors", async () => {
  reset();
  let flushed = false;
  configureAnalytics({ capture: () => {}, flush: () => { flushed = true; } });
  await flushAnalytics();
  assert(flushed);
  configureAnalytics({ capture: () => {}, flush: () => Promise.reject(new Error("boom")) });
  await flushAnalytics(); // must not reject
  reset();
});
