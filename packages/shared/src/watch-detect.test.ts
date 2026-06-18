import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyAlertReason,
  detectWatchDelta,
  sourceKey,
  type WatchSource,
} from "./watch-detect.ts";

/** Concise WatchSource fixture. */
function src(provider: string, id: string, extra: Partial<WatchSource> = {}): WatchSource {
  return { provider, provider_id: id, ...extra };
}

const RCT = ["Randomized Controlled Trial", "Journal Article"];
const META = ["Meta-Analysis", "Journal Article"];
const SR = ["Systematic Review"];
const PLAIN = ["Journal Article"];
const RETRACTED = ["Retracted Publication", "Journal Article"];
const RETRACTION_NOTICE = ["Retraction of Publication"];

Deno.test("sourceKey is the canonical provider:provider_id dedupe key", () => {
  assertEquals(sourceKey({ provider: "pubmed_oa", provider_id: "27633186" }), "pubmed_oa:27633186");
  assertEquals(sourceKey({ provider: "clinicaltrials", provider_id: "NCT0123" }), "clinicaltrials:NCT0123");
});

Deno.test("baseline (firstRun) is SILENT: stores every key, emits nothing", () => {
  const fetched = [src("pubmed_oa", "1", { publication_types: RCT }), src("clinicaltrials", "NCT9")];
  const d = detectWatchDelta({ fetched, knownKeys: [], firstRun: true });
  assert(d.baseline);
  assertEquals(d.newSources, []); // nothing surfaced on the cold-start baseline
  assertEquals(d.alerts, []); // even a high-tier RCT does NOT alert on baseline
  // …but both keys are remembered, so they are never re-alerted later.
  assertEquals([...d.knownKeysAfter].sort(), ["clinicaltrials:NCT9", "pubmed_oa:1"]);
});

Deno.test("baseline flag is explicit, NOT inferred from an empty known-set", () => {
  // A topic that returned 0 sources on run 1 (genuinely nothing yet), then 1 on run 2:
  // run 2 has an empty known-set but is NOT a first run → the new source MUST surface.
  const d = detectWatchDelta({
    fetched: [src("pubmed_oa", "42", { publication_types: RCT })],
    knownKeys: [],
    firstRun: false,
  });
  assert(!d.baseline);
  assertEquals(d.newSources.map((s) => s.provider_id), ["42"]);
  assertEquals(d.alerts.length, 1); // a new RCT → loud alert
});

Deno.test("second run surfaces only genuinely new sources; known ones are excluded", () => {
  const d = detectWatchDelta({
    fetched: [src("pubmed_oa", "1"), src("pubmed_oa", "2")],
    knownKeys: ["pubmed_oa:1"],
    firstRun: false,
  });
  assertEquals(d.newSources.map((s) => s.provider_id), ["2"]);
});

Deno.test("known-set ACCUMULATES across cycles (history preserved, dated fetch is small)", () => {
  const d = detectWatchDelta({
    fetched: [src("pubmed_oa", "3")],
    knownKeys: ["pubmed_oa:1", "pubmed_oa:2"],
    firstRun: false,
  });
  // The dated query only returned the recent "3"; the prior history must NOT be dropped.
  assertEquals([...d.knownKeysAfter].sort(), ["pubmed_oa:1", "pubmed_oa:2", "pubmed_oa:3"]);
});

Deno.test("a fetched source equal to one already known is counted once (first-wins dedupe)", () => {
  const d = detectWatchDelta({
    fetched: [src("pubmed_oa", "1"), src("pubmed_oa", "1")], // duplicate within the cycle
    knownKeys: [],
    firstRun: false,
  });
  assertEquals(d.newSources.length, 1);
  assertEquals(d.knownKeysAfter.length, 1);
});

Deno.test("a quiet cycle (everything already known) is silent", () => {
  const d = detectWatchDelta({
    fetched: [src("pubmed_oa", "1"), src("clinicaltrials", "NCT9")],
    knownKeys: ["pubmed_oa:1", "clinicaltrials:NCT9"],
    firstRun: false,
  });
  assertEquals(d.newSources, []);
  assertEquals(d.alerts, []);
  assertEquals([...d.knownKeysAfter].sort(), ["clinicaltrials:NCT9", "pubmed_oa:1"]);
});

Deno.test("high-tier new studies (meta / SR / RCT / late-phase trial) fire a loud alert", () => {
  const fetched = [
    src("pubmed_oa", "m", { publication_types: META }),
    src("pubmed_oa", "s", { publication_types: SR }),
    src("pubmed_oa", "r", { publication_types: RCT }),
    src("clinicaltrials", "p3", { study_type: "INTERVENTIONAL", trial_phase: "PHASE3" }),
  ];
  const d = detectWatchDelta({ fetched, knownKeys: [], firstRun: false });
  assertEquals(d.alerts.length, 4);
  assert(d.alerts.every((a) => a.reason === "new_high_tier_study"));
  // every alert is a subset of newSources
  assert(d.alerts.every((a) => d.newSources.includes(a.source)));
});

Deno.test("low-tier new sources appear in the feed but do NOT alert", () => {
  const fetched = [
    src("pubmed_oa", "plain", { publication_types: PLAIN }),
    src("clinicaltrials", "p1", { study_type: "INTERVENTIONAL", trial_phase: "PHASE1" }),
    src("openalex", "obs", { study_type: "OBSERVATIONAL" }),
  ];
  const d = detectWatchDelta({ fetched, knownKeys: [], firstRun: false });
  assertEquals(d.newSources.length, 3); // all three are "what's new"
  assertEquals(d.alerts, []); // none move the conclusion
});

Deno.test("a retraction fires an alert and outranks the high-tier reason", () => {
  const fetched = [
    src("pubmed_oa", "retr", { publication_types: RETRACTED }), // was also an RCT-tier paper, now retracted
    src("pubmed_oa", "notice", { publication_types: RETRACTION_NOTICE }),
  ];
  const d = detectWatchDelta({ fetched, knownKeys: [], firstRun: false });
  assertEquals(d.alerts.length, 2);
  assert(d.alerts.every((a) => a.reason === "retraction"));
});

Deno.test("classifyAlertReason: per-source classification matches the four-trigger design", () => {
  assertEquals(classifyAlertReason(src("p", "1", { publication_types: RCT })), "new_high_tier_study");
  assertEquals(classifyAlertReason(src("p", "1", { publication_types: META })), "new_high_tier_study");
  assertEquals(
    classifyAlertReason(src("p", "1", { study_type: "INTERVENTIONAL", trial_phase: "PHASE4" })),
    "new_high_tier_study",
  );
  // early-phase / observational / plain are not conclusion-movers
  assertEquals(
    classifyAlertReason(src("p", "1", { study_type: "INTERVENTIONAL", trial_phase: "PHASE2" })),
    null,
  );
  assertEquals(classifyAlertReason(src("p", "1", { study_type: "OBSERVATIONAL" })), null);
  assertEquals(classifyAlertReason(src("p", "1", { publication_types: PLAIN })), null);
  assertEquals(classifyAlertReason(src("p", "1", {})), null);
  // retraction wins
  assertEquals(classifyAlertReason(src("p", "1", { publication_types: RETRACTED })), "retraction");
});
