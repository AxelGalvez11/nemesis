import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planPersistence } from "./plan-persistence.ts";
import { detectWatchDelta, type WatchSource } from "../../../packages/shared/src/watch-detect.ts";
import { detectNewsDelta } from "./watch-cycle.ts";
import { type NewsItem } from "../news/news-source.ts";

const NOW = "2026-06-17T12:00:00.000Z";

// ── source/news builders ──────────────────────────────────────────────────────────────────────
function rct(id: string): WatchSource {
  return {
    provider: "pubmed_oa",
    provider_id: id,
    title: `RCT ${id}`,
    url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    publication_types: ["Randomized Controlled Trial"],
    published_date: "2026-06-10",
  };
}
function article(id: string): WatchSource {
  return { provider: "pubmed_oa", provider_id: id, title: `Paper ${id}`, url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, publication_types: ["Journal Article"], published_date: "2026-06-10" };
}
function retracted(id: string): WatchSource {
  return { provider: "pubmed_oa", provider_id: id, title: `Retracted ${id}`, publication_types: ["Retraction of Publication"] };
}
function openfda(id: string): WatchSource {
  return { provider: "openfda", provider_id: id, title: "Atorvastatin label", url: "https://dailymed.nlm.nih.gov/x", published_date: "2026-02-12" };
}
function ni(url: string, title = "headline"): NewsItem {
  return { title, url, source: "Reuters", published_at: "2026-06-12T10:30:00.000Z" };
}

const emptyNews = detectNewsDelta({ items: [], knownKeys: [], firstRun: false });

function baseState(over: Partial<Parameters<typeof planPersistence>[0]["state"]> = {}) {
  return {
    watchId: "w1",
    userId: "u1",
    firstRun: false,
    priorKnownEvidenceKeys: [] as string[],
    priorKnownNewsKeys: [] as string[],
    ...over,
  };
}

// ── baseline (first run): store everything, emit NOTHING, set baselined_at ──────────────────────
Deno.test("planPersistence baseline: stores all fetched keys, emits zero events, stamps baselined_at", () => {
  const evidence = detectWatchDelta({ fetched: [rct("1"), article("2")], knownKeys: [], firstRun: true });
  const news = detectNewsDelta({ items: [ni("a")], knownKeys: [], firstRun: true });
  const plan = planPersistence({ state: baseState({ firstRun: true }), cycle: { evidence, news }, now: NOW });

  assertEquals(plan.eventsToInsert, []); // SILENT cold-start — no back-catalogue spam
  assertEquals(plan.setBaselinedAt, NOW); // baseline completed
  assertEquals(plan.cursorAdvanceTo, NOW);
  const keys = plan.keysToUpsert.map((k) => `${k.channel}:${k.source_key}`).sort();
  assertEquals(keys, ["evidence:pubmed_oa:1", "evidence:pubmed_oa:2", "news:news:a"]);
  assert(plan.keysToUpsert.every((k) => k.watch_id === "w1"));
});

// ── normal cycle, quiet: a low-tier paper + a news item → feed events, no alerts ────────────────
Deno.test("planPersistence quiet cycle: a low-tier paper is a feed event (is_alert=false), news is feed-only", () => {
  const evidence = detectWatchDelta({ fetched: [article("9")], knownKeys: [], firstRun: false });
  const news = detectNewsDelta({ items: [ni("n1")], knownKeys: [], firstRun: false });
  const plan = planPersistence({ state: baseState(), cycle: { evidence, news }, now: NOW });

  assertEquals(plan.setBaselinedAt, null); // already baselined
  assertEquals(plan.eventsToInsert.length, 2);
  const ev = plan.eventsToInsert.find((e) => e.channel === "evidence")!;
  assertEquals(ev.is_alert, false);
  assertEquals(ev.alert_reason, null);
  assertEquals(ev.source_key, "pubmed_oa:9");
  const nv = plan.eventsToInsert.find((e) => e.channel === "news")!;
  assertEquals(nv.is_alert, false); // THE WALL: news is never a loud alert
  assertEquals(nv.alert_reason, null);
  assertEquals(nv.source_key, "news:n1");
  assertEquals(nv.provider, "Reuters"); // outlet
  assertEquals(nv.published_date, "2026-06-12"); // ISO published_at → date
});

// ── normal cycle, loud: a new RCT and a retraction become alert events ──────────────────────────
Deno.test("planPersistence: a new RCT becomes a loud new_high_tier_study alert with the computed label", () => {
  const evidence = detectWatchDelta({ fetched: [rct("5")], knownKeys: [], firstRun: false });
  const plan = planPersistence({ state: baseState(), cycle: { evidence, news: emptyNews }, now: NOW });
  assertEquals(plan.eventsToInsert.length, 1);
  const e = plan.eventsToInsert[0];
  assertEquals(e.is_alert, true);
  assertEquals(e.alert_reason, "new_high_tier_study");
  assertEquals(e.study_type, "Randomized controlled trial"); // the deterministic label, stored on the event
  assertEquals(e.summary, null); // grounded summary is increment 5
  assertEquals(e.url, "https://pubmed.ncbi.nlm.nih.gov/5/");
});

Deno.test("planPersistence: a retraction becomes a loud retraction alert", () => {
  const evidence = detectWatchDelta({ fetched: [retracted("7")], knownKeys: [], firstRun: false });
  const plan = planPersistence({ state: baseState(), cycle: { evidence, news: emptyNews }, now: NOW });
  assertEquals(plan.eventsToInsert[0].is_alert, true);
  assertEquals(plan.eventsToInsert[0].alert_reason, "retraction");
});

Deno.test("planPersistence: an openFDA label change is a feed event, never an alert (no study-type)", () => {
  const evidence = detectWatchDelta({ fetched: [openfda("spl-1:20260212")], knownKeys: [], firstRun: false });
  const plan = planPersistence({ state: baseState(), cycle: { evidence, news: emptyNews }, now: NOW });
  const e = plan.eventsToInsert[0];
  assertEquals(e.is_alert, false);
  assertEquals(e.alert_reason, null);
  assertEquals(e.study_type, null);
  assertEquals(e.provider, "openfda");
});

// ── minimal upserts: a re-seen key (overlap window) is NOT re-stored, and never re-surfaces ──────
Deno.test("planPersistence upserts ONLY genuinely-new keys; an already-known re-fetch is a no-op", () => {
  // overlap window re-fetches pubmed_oa:1 (already known) alongside a new pubmed_oa:2
  const evidence = detectWatchDelta({ fetched: [rct("1"), article("2")], knownKeys: ["pubmed_oa:1"], firstRun: false });
  const plan = planPersistence({
    state: baseState({ priorKnownEvidenceKeys: ["pubmed_oa:1"] }),
    cycle: { evidence, news: emptyNews },
    now: NOW,
  });
  const evKeys = plan.keysToUpsert.filter((k) => k.channel === "evidence").map((k) => k.source_key);
  assertEquals(evKeys, ["pubmed_oa:2"]); // only the NEW key, not the re-seen one
  assertEquals(plan.eventsToInsert.length, 1); // and only the new source surfaces
  assertEquals(plan.eventsToInsert[0].source_key, "pubmed_oa:2");
});

// ── the cursor always advances on a completed cycle, even when nothing was new ──────────────────
Deno.test("planPersistence advances the cursor even on a completely quiet cycle", () => {
  const evidence = detectWatchDelta({ fetched: [rct("1")], knownKeys: ["pubmed_oa:1"], firstRun: false });
  const plan = planPersistence({
    state: baseState({ priorKnownEvidenceKeys: ["pubmed_oa:1"] }),
    cycle: { evidence, news: emptyNews },
    now: NOW,
  });
  assertEquals(plan.eventsToInsert, []);
  assertEquals(plan.keysToUpsert, []);
  assertEquals(plan.cursorAdvanceTo, NOW); // cursor still advances → window moves forward
});
