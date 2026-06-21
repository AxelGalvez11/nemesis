import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectNewsDelta,
  liveCandidateToWatchSource,
  runWatchCycle,
} from "./watch-cycle.ts";
import type { NewsItem } from "../news/news-source.ts";

function news(url: string, title = "headline"): NewsItem {
  return { title, url, source: "Outlet", published_at: null };
}

Deno.test("liveCandidateToWatchSource lifts study-type metadata onto the WatchSource shape", () => {
  const ws = liveCandidateToWatchSource({
    provider: "pubmed_oa",
    provider_id: "27633186",
    title: "A trial",
    url: "https://pubmed.ncbi.nlm.nih.gov/27633186",
    source: {
      metadata: {
        publication_types: ["Randomized Controlled Trial", "Journal Article"],
        study_type: "INTERVENTIONAL",
        phases: ["PHASE2", "PHASE3"], // last wins, mirroring the live-evidence adapter
      },
      effective_at: "2026-06-16T00:00:00.000Z",
    },
  });
  assertEquals(ws.provider, "pubmed_oa");
  assertEquals(ws.provider_id, "27633186");
  assertEquals(ws.publication_types, ["Randomized Controlled Trial", "Journal Article"]);
  assertEquals(ws.study_type, "INTERVENTIONAL");
  assertEquals(ws.trial_phase, "PHASE3");
  assertEquals(ws.published_date, "2026-06-16");
});

Deno.test("liveCandidateToWatchSource tolerates missing metadata", () => {
  const ws = liveCandidateToWatchSource({ provider: "openalex", provider_id: "W42" });
  assertEquals(ws.provider, "openalex");
  assertEquals(ws.provider_id, "W42");
  assertEquals(ws.publication_types, undefined);
  assertEquals(ws.study_type, undefined);
  assertEquals(ws.trial_phase, undefined);
});

Deno.test("detectNewsDelta baselines silently on the first run", () => {
  const d = detectNewsDelta({ items: [news("a"), news("b")], knownKeys: [], firstRun: true });
  assert(d.baseline);
  assertEquals(d.newItems, []);
  assertEquals([...d.knownKeysAfter].sort(), ["news:a", "news:b"]);
});

Deno.test("detectNewsDelta surfaces only new items and accumulates the seen-set", () => {
  const d = detectNewsDelta({ items: [news("a"), news("c")], knownKeys: ["news:a", "news:b"], firstRun: false });
  assertEquals(d.newItems.map((i) => i.url), ["c"]);
  assertEquals([...d.knownKeysAfter].sort(), ["news:a", "news:b", "news:c"]);
});

Deno.test("detectNewsDelta dedupes repeated URLs within a cycle", () => {
  const d = detectNewsDelta({ items: [news("a"), news("a")], knownKeys: [], firstRun: false });
  assertEquals(d.newItems.length, 1);
});

Deno.test("runWatchCycle composes the evidence detector + the news diff in one pass", () => {
  const rct = liveCandidateToWatchSource({
    provider: "pubmed_oa",
    provider_id: "1",
    source: { metadata: { publication_types: ["Randomized Controlled Trial"] } },
  });
  const out = runWatchCycle({
    evidenceSources: [rct],
    newsItems: [news("n1")],
    knownEvidenceKeys: [],
    knownNewsKeys: [],
    firstRun: false,
  });
  assertEquals(out.evidence.newSources.length, 1);
  assertEquals(out.evidence.alerts.length, 1); // a new RCT → loud evidence alert
  assertEquals(out.evidence.alerts[0].reason, "new_high_tier_study");
  assertEquals(out.news.newItems.length, 1); // news surfaces in its own (feed-only) channel
});

Deno.test("runWatchCycle baselines BOTH channels silently on a brand-new watch", () => {
  const rct = liveCandidateToWatchSource({
    provider: "pubmed_oa",
    provider_id: "1",
    source: { metadata: { publication_types: ["Meta-Analysis"] } },
  });
  const out = runWatchCycle({
    evidenceSources: [rct],
    newsItems: [news("n1")],
    knownEvidenceKeys: [],
    knownNewsKeys: [],
    firstRun: true,
  });
  assert(out.evidence.baseline);
  assert(out.news.baseline);
  assertEquals(out.evidence.alerts, []); // no back-catalogue spam, even for a meta-analysis
  assertEquals(out.news.newItems, []);
});
