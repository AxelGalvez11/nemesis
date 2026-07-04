import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildResearchMap } from "./research-map.ts";
import type { Citation } from "./answer.ts";
import type { ResearchMapWatchEvent } from "./research-map.ts";

const cite = (over: Partial<Citation>): Citation => ({
  chunk_tag: "1", source_id: "s", source_type: "pubmed_oa", title: "T", section: null,
  url: null, license: null, published_date: "2020-01-01", retrieved_at: null, ...over,
});

const ev = (over: Partial<ResearchMapWatchEvent>): ResearchMapWatchEvent => ({
  source_key: "", url: null, title: null, channel: "evidence", published_date: "2021-01-01",
  study_type: null, ...over,
});

const pubmed = (pmid: string, over: Partial<Citation> = {}): Citation =>
  cite({ url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}`, ...over });

Deno.test("dedupes the same pmid cited by a chat and a report into one source node", () => {
  const map = buildResearchMap({
    chats: [{ id: "c1", title: "Chat 1", citations: [pubmed("111")] }],
    reports: [{ id: "r1", title: "Report 1", citations: [pubmed("111")] }],
    watches: [],
  });
  const sources = map.nodes.filter((n) => n.kind === "source");
  assertEquals(sources.length, 1);
  assertEquals(sources[0]?.id, "pmid:111");
  assertEquals(sources[0]?.refCount, 2); // two distinct items
});

Deno.test("a source cited twice by ONE item counts once for refCount", () => {
  const map = buildResearchMap({
    chats: [{ id: "c1", title: "Chat 1", citations: [pubmed("111"), pubmed("111", { chunk_tag: "2" })] }],
    reports: [],
    watches: [],
  });
  const src = map.nodes.find((n) => n.id === "pmid:111");
  assertEquals(src?.refCount, 1);
  const citesEdges = map.edges.filter((e) => e.kind === "cites" && e.target === "pmid:111");
  assertEquals(citesEdges.length, 1); // one edge from c1, not two
});

Deno.test("reconciles a watch event's provider:id source_key to a pmid key", () => {
  const map = buildResearchMap({
    chats: [{ id: "c1", title: "Chat 1", citations: [pubmed("222")] }],
    reports: [],
    watches: [{ id: "w1", title: "Watch 1", events: [ev({ source_key: "pubmed:222", url: null })] }],
  });
  const src = map.nodes.find((n) => n.id === "pmid:222");
  assertEquals(src?.refCount, 2); // chat c1 + watch w1 both reference pmid:222
});

Deno.test("falls back to a url key when a watch event has no pubmed-ish source_key", () => {
  const map = buildResearchMap({
    chats: [], reports: [],
    watches: [{ id: "w1", title: "Watch 1", events: [ev({ source_key: "clinicaltrials:NCT01", url: "https://clinicaltrials.gov/study/NCT01" })] }],
  });
  const src = map.nodes.find((n) => n.kind === "source");
  assertEquals(src?.id, "url:https://clinicaltrials.gov/study/NCT01");
});

Deno.test("excludes news-channel watch events from the graph", () => {
  const map = buildResearchMap({
    chats: [], reports: [],
    watches: [{ id: "w1", title: "Watch 1", events: [ev({ source_key: "news:https://x.com/a", url: "https://x.com/a", channel: "news" })] }],
  });
  assertEquals(map.nodes.filter((n) => n.kind === "source").length, 0);
});

Deno.test("emits a shared edge weighted by the count of shared sources", () => {
  const map = buildResearchMap({
    chats: [{ id: "c1", title: "Chat 1", citations: [pubmed("1"), pubmed("2")] }],
    reports: [{ id: "r1", title: "Report 1", citations: [pubmed("1"), pubmed("2"), pubmed("3")] }],
    watches: [],
  });
  const shared = map.edges.filter((e) => e.kind === "shared");
  assertEquals(shared.length, 1);
  assertEquals(shared[0]?.weight, 2); // pmid:1 and pmid:2 are shared
});

Deno.test("does not emit a shared edge when two items share no source", () => {
  const map = buildResearchMap({
    chats: [{ id: "c1", title: "Chat 1", citations: [pubmed("1")] }],
    reports: [{ id: "r1", title: "Report 1", citations: [pubmed("9")] }],
    watches: [],
  });
  assertEquals(map.edges.filter((e) => e.kind === "shared").length, 0);
});

Deno.test("caps source nodes at 60 and reports the truncated count", () => {
  const citations: Citation[] = [];
  for (let i = 0; i < 70; i++) citations.push(pubmed(String(1000 + i)));
  const map = buildResearchMap({
    chats: [{ id: "c1", title: "Chat 1", citations }],
    reports: [], watches: [],
  });
  assertEquals(map.nodes.filter((n) => n.kind === "source").length, 60);
  assertEquals(map.meta.truncatedSources, 10);
});

Deno.test("keeps a shared source under the cap (refCount>=2 sorts to the top)", () => {
  // 61 chat-only sources (refCount 1) plus one source shared by both items (refCount 2). The shared
  // PMID is numeric so its key is pmid:9999 (pmidFromUrl only matches digits after the host).
  const chatCites: Citation[] = [pubmed("9999")];
  for (let i = 0; i < 61; i++) chatCites.push(pubmed(String(2000 + i)));
  const map = buildResearchMap({
    chats: [{ id: "c1", title: "Chat 1", citations: chatCites }],
    reports: [{ id: "r1", title: "Report 1", citations: [pubmed("9999")] }],
    watches: [],
  });
  const kept = new Set(map.nodes.filter((n) => n.kind === "source").map((n) => n.id));
  assertEquals(kept.has("pmid:9999"), true);         // survived the cap
  assertEquals(map.edges.some((e) => e.kind === "shared"), true); // edge still valid
});

Deno.test("returns an empty graph for empty input", () => {
  const map = buildResearchMap({ chats: [], reports: [], watches: [] });
  assertEquals(map.nodes, []);
  assertEquals(map.edges, []);
  assertEquals(map.meta.truncatedSources, 0);
});

Deno.test("always emits an item node even with zero usable sources", () => {
  const map = buildResearchMap({
    chats: [{ id: "c1", title: "Chat 1", citations: [cite({ url: null })] }],
    reports: [], watches: [],
  });
  const item = map.nodes.find((n) => n.kind === "chat");
  assertEquals(item?.id, "chat:c1");
  assertEquals(item?.refCount, 0);
});
