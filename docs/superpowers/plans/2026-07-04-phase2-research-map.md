# Phase 2 — Project Research Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-project "Map" tab — an Obsidian-local-graph × ResearchRabbit force-directed graph whose nodes are the project's chats, reports, and watches plus the papers they cite, with a tap-to-expand "related papers" affordance backed by a new auth-gated OpenAlex proxy.

**Architecture:** A pure aggregation module in `packages/shared` turns the project's saved items (with their citations) into `{nodes, edges}`. A client hook fetches per-item citations (concurrency-capped, degrading per item) and feeds that module. A cytoscape view — adapted from the existing `EvidenceGraph.tsx` conventions, never mutating it — renders the graph, decorates the top sources with the existing trust-enrichment cache, and lets a tapped source node fetch OpenAlex-related papers (added as client-only "ghost" nodes) through a new same-origin Next.js API route that mirrors the auth + rate-limit pattern of `apps/web/app/api/v1/evidence/search/route.ts`.

**Tech Stack:** TypeScript, Next.js 16 (App Router, `nodejs` runtime routes), React 19, cytoscape.js `^3.34.0` (already a dependency), Supabase JS client (RLS-scoped browser reads; bearer-token same-origin route auth), Deno `std@0.224.0` for `packages/shared` unit tests, OpenAlex public API.

## Global Constraints

- **No schema changes and no edge-function changes.** Everything aggregates client-side from already-stored payloads; the one new server surface is a Next.js API route, not a Supabase edge function.
- **FROZEN: `supabase/functions/ask/**` is never touched.** Not read into, not imported from, not modified.
- **News is walled out of the graph.** Watch events with `channel === "news"` are excluded entirely (evidence-wall rule); only `channel === "evidence"` events become source nodes.
- **Enrichment quota respected.** Decorate at most the **top 24** source nodes (by refCount desc → recency → key); the existing `enrich-source` edge function already caps a batch at 24 and 150/day. Never enrich every node.
- **Reuse, do not duplicate.** Adapt `EvidenceGraph.tsx`'s cytoscape conventions (CSS-token theming, `cose` layout, tap-select) into a new `ResearchMapView.tsx`; do NOT edit `EvidenceGraph.tsx`.
- **Graceful degradation per item.** A failed per-item citation fetch skips that item and is counted in returned meta — one bad chat never blanks the whole map.
- **Pure logic lives in `packages/shared` with Deno tests.** The aggregation is a pure function; no React, no I/O, no DOM.
- **Conventional commits.** `feat:` / `test:` / `chore:` prefixes.
- **Web gate = `npm run build`** (Next build) from the web app; shared tests via `deno test packages/shared/src/research-map.test.ts`.
- **`noUncheckedIndexedAccess: true`** is set repo-wide in `tsconfig.base.json`: indexing an array/record can yield `undefined` — guard every index access; never assume `arr[i]` is defined.

### Scope note (reconciling this plan to `docs/design/research-map-spec.md`)

The spec's v1 defines three node kinds (Questions, Entities, Sources). This plan ships **two** kinds — project items (chats/reports/watches) and sources — and **defers** the Entity/NER node kind and the source→entity / question→entity edges to a later increment. Item→source `cites` edges and computed shared-source edges (the spec's "aha" edge) are in scope.

The spec's **Non-goals (v1)** explicitly lists *"No citation-network expansion via OpenAlex `referenced_works` — a Litmaps-style discovery feature, possible v2."* Task 4 (paper-expand) is that v2 increment, brought forward deliberately and scoped tightly: it is **client-only** (ghost nodes, never persisted, never fed back into aggregation), owner-approved as "a scoped paper-expand increment." Everything else honors the spec's v1 as written: reuse `EvidenceGraph` as the render seed, dedupe sources by `pmid`-else-normalized-`url`, cap with honest "showing top N" labeling, lazy enrichment via the existing batch, empty-state honesty.

Edges are built from `citations` only (the spec says "cites"), never from `reviewed_sources`.

---

## File Structure

- **`packages/shared/src/research-map.ts`** (new) — pure aggregation: `SourceNodeKey`, `MapNode`, `MapEdge`, `ResearchMap`, `ResearchMapInput`, and `buildResearchMap(input): ResearchMap`. No React, no I/O. Responsibility: turn saved-item citations + watch events into a deduped, capped node/edge graph with truncation meta.
- **`packages/shared/src/research-map.test.ts`** (new) — Deno unit tests for the aggregation (dedupe across chat+report, watch reconciliation, news exclusion, shared-edge weight, cap+truncation, deterministic ordering, empty input).
- **`packages/shared/src/index.ts`** (modify) — add `export * from "./research-map.ts";`.
- **`apps/web/lib/enrichment.ts`** (modify) — extract `useEnrichmentByPmids(pmids: string[])`; existing `useEnrichment(citations)` delegates to it (single fetch path preserved). Responsibility: let the map enrich by explicit `pmid:N` keys without fabricating `Citation` objects.
- **`apps/web/lib/research-map-data.ts`** (new) — `useResearchMapData(projectId, contents)` hook: fetches per-item citations (concurrency cap 4, per-item degrade), assembles `ResearchMapInput`, calls `buildResearchMap`, caches the result under `map:{projectId}`. Responsibility: all the async data plumbing that feeds the pure module.
- **`apps/web/lib/api.ts`** (modify) — add `fetchGraphExpand(pmid)` client helper (same-origin fetch to the new route with the user's bearer token) and its `GraphExpand`/`GraphExpandWork` result types.
- **`apps/web/app/api/v1/graph/expand/route.ts`** (new) — `nodejs`-runtime GET route: auth + rate-limit mirroring `evidence/search/route.ts`; proxies OpenAlex; returns a slim `{work, cites, cited_by, similar}` capped 8 each.
- **`apps/web/components/ResearchMapView.tsx`** (new) — cytoscape view over `MapNode`/`MapEdge`, adapted from `EvidenceGraph.tsx` conventions; source side-card, item-node linking, top-24 enrichment decoration, "Explore related" ghost-node expansion. Responsibility: all rendering + interaction.
- **`apps/web/app/app/projects/[id]/page.tsx`** (modify) — add a "Map" tab that lazily mounts `ResearchMapView` fed by `useResearchMapData`.

---

### Task 1: Pure aggregation module (`packages/shared/src/research-map.ts`)

**Files:**
- Create: `packages/shared/src/research-map.ts`
- Create: `packages/shared/src/research-map.test.ts`
- Modify: `packages/shared/src/index.ts` (add one export line)
- Test: `packages/shared/src/research-map.test.ts`

**Interfaces:**
- Consumes (from existing shared code, already exported via `index.ts`):
  - `import type { Citation } from "./answer.ts";` — the citation shape (`chunk_tag`, `source_id`, `source_type`, `title`, `url`, `published_date`, `study_type?`, `claim_relation?`, …).
  - `import { pmidFromUrl } from "./source-ids.ts";` — `pmidFromUrl(url: string | null | undefined): string | null` (matches PubMed + Europe PMC hosts; no DOI/NCT).
- Produces (relied on by Tasks 2, 3, 5 — exact names/types):
  - `type SourceNodeKey = string;` (form `pmid:{n}` or `url:{href}`)
  - `interface MapNode { id: string; kind: "chat" | "report" | "watch" | "source"; label: string; refCount: number; meta: { url?: string; year?: string; studyType?: string; claimRelation?: string } }`
  - `interface MapEdge { id: string; source: string; target: string; kind: "cites" | "shared"; weight: number }`
  - `interface ResearchMap { nodes: MapNode[]; edges: MapEdge[]; meta: { truncatedSources: number } }`
  - `interface ResearchMapItemCites { id: string; title: string; citations: Citation[] }`
  - `interface ResearchMapWatchEvent { source_key: string; url: string | null; title: string | null; channel: string; published_date?: string | null; study_type?: string | null }`
  - `interface ResearchMapWatch { id: string; title: string; events: ResearchMapWatchEvent[] }`
  - `interface ResearchMapInput { chats: ResearchMapItemCites[]; reports: ResearchMapItemCites[]; watches: ResearchMapWatch[] }`
  - `function buildResearchMap(input: ResearchMapInput): ResearchMap`

**Design decisions (pinned, each covered by a test):**
- **Source identity:** for a citation, `pmidFromUrl(c.url)` → `pmid:{n}`; else if `c.url` is non-empty → `url:{href}`; else skip (no stable identity). For a watch event, if `source_key` matches `provider:id` with a pubmed-ish provider (`/^(pubmed|europepmc)$/i` on the provider segment) → `pmid:{id}`; else `pmidFromUrl(event.url)` → `pmid:{n}`; else if `event.url` is non-empty → `url:{href}`; else skip.
- **News exclusion:** watch events with `channel !== "evidence"` are skipped before anything else.
- **Item nodes:** every chat/report/watch becomes one node (kind `chat`/`report`/`watch`), even if it has zero usable sources — the workspace's items are always shown. An item node's `refCount` is the count of distinct sources it contributes.
- **Source dedupe + refCount:** sources dedupe by `SourceNodeKey` across all items. A source node's `refCount` = number of **distinct items** referencing it (an item citing the same pmid twice counts once).
- **`cites` edges:** one per (item, distinct source) pair, weight `1`.
- **`shared` edges:** for each unordered pair of items sharing ≥1 **surviving** source, one edge with `weight` = number of shared surviving sources. Computed AFTER the source cap so no edge points at a hidden node. (Safe because the cap is refCount-desc and shared sources have refCount ≥ 2, so they sort to the top and are essentially never truncated — but we pin the order and test the boundary.)
- **Cap + truncation:** keep the top **60** source nodes ordered by `refCount` desc → most-recent `published_date` (missing dates sort last) → `SourceNodeKey` ascending (stable tiebreak). `meta.truncatedSources` = how many source keys were dropped. Item nodes are never capped.
- **Determinism:** all ordering is total (the key tiebreak guarantees reproducibility for both the 60-cap here and the top-24-enrich set in Task 3).

- [ ] **Step 1: Write the failing test file**

Create `packages/shared/src/research-map.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test packages/shared/src/research-map.test.ts`
Expected: FAIL — `Import '.../research-map.ts' failed, not found.`

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/research-map.ts`:

```typescript
// Pure aggregation for the per-project Research Map (Obsidian-local-graph × ResearchRabbit).
// Turns a project's saved items (chats/reports with their citations, watches with their events)
// into a deduped, capped node/edge graph. No React, no I/O — deno-tested. The render layer
// (ResearchMapView) and the enrichment decoration live in the web app; this module only decides
// WHAT the graph is, never how it looks. News-channel watch events are walled out (evidence rule).

import type { Citation } from "./answer.ts";
import { pmidFromUrl } from "./source-ids.ts";

/** A stable cross-item source identity: `pmid:{n}` when a PMID is derivable, else `url:{href}`. */
export type SourceNodeKey = string;

export interface MapNode {
  id: string;
  kind: "chat" | "report" | "watch" | "source";
  label: string;
  /** For a source: number of distinct items referencing it. For an item: number of distinct sources it contributes. */
  refCount: number;
  meta: { url?: string; year?: string; studyType?: string; claimRelation?: string };
}

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  kind: "cites" | "shared";
  weight: number;
}

export interface ResearchMap {
  nodes: MapNode[];
  edges: MapEdge[];
  meta: { truncatedSources: number };
}

/** One saved item (chat or report) with the citations it carries. */
export interface ResearchMapItemCites {
  id: string;
  title: string;
  citations: Citation[];
}

/** One watch event, reduced to the fields the map needs. `channel` gates the evidence wall. */
export interface ResearchMapWatchEvent {
  source_key: string;
  url: string | null;
  title: string | null;
  channel: string;
  published_date?: string | null;
  study_type?: string | null;
}

export interface ResearchMapWatch {
  id: string;
  title: string;
  events: ResearchMapWatchEvent[];
}

export interface ResearchMapInput {
  chats: ResearchMapItemCites[];
  reports: ResearchMapItemCites[];
  watches: ResearchMapWatch[];
}

const MAX_SOURCE_NODES = 60;
const PUBMED_PROVIDER_RE = /^(pubmed|europepmc)$/i;

/** A resolved source touch: which item referenced which source, plus display metadata for the node. */
interface SourceTouch {
  itemId: string;
  key: SourceNodeKey;
  url: string | null;
  title: string | null;
  year: string | null;
  studyType: string | null;
  claimRelation: string | null;
  publishedDate: string | null;
}

function sourceKeyFromUrl(url: string | null): SourceNodeKey | null {
  const pmid = pmidFromUrl(url);
  if (pmid) return `pmid:${pmid}`;
  const href = (url ?? "").trim();
  return href ? `url:${href}` : null;
}

function sourceKeyFromWatchEvent(e: ResearchMapWatchEvent): SourceNodeKey | null {
  const parts = e.source_key.split(":");
  if (parts.length >= 2 && parts[0] && PUBMED_PROVIDER_RE.test(parts[0])) {
    const id = parts.slice(1).join(":").trim();
    if (id) return `pmid:${id}`;
  }
  return sourceKeyFromUrl(e.url);
}

function yearOf(c: Citation): string | null {
  if (c.year) return c.year;
  return c.published_date ? c.published_date.slice(0, 4) : null;
}

function collectItemTouches(items: ResearchMapItemCites[], into: SourceTouch[]): void {
  for (const item of items) {
    for (const c of item.citations) {
      const key = sourceKeyFromUrl(c.url);
      if (!key) continue;
      into.push({
        itemId: item.id,
        key,
        url: c.url,
        title: c.title,
        year: yearOf(c),
        studyType: c.study_type ?? null,
        claimRelation: c.claim_relation ?? null,
        publishedDate: c.published_date,
      });
    }
  }
}

function collectWatchTouches(watches: ResearchMapWatch[], into: SourceTouch[]): void {
  for (const w of watches) {
    for (const e of w.events) {
      if (e.channel !== "evidence") continue; // evidence wall: news never enters the graph
      const key = sourceKeyFromWatchEvent(e);
      if (!key) continue;
      into.push({
        itemId: w.id,
        key,
        url: e.url,
        title: e.title,
        year: e.published_date ? e.published_date.slice(0, 4) : null,
        studyType: e.study_type ?? null,
        claimRelation: null,
        publishedDate: e.published_date ?? null,
      });
    }
  }
}

/** Aggregated per-source state: distinct items + best display metadata + recency for the cap sort. */
interface SourceAgg {
  key: SourceNodeKey;
  items: Set<string>;
  url: string | null;
  title: string | null;
  year: string | null;
  studyType: string | null;
  claimRelation: string | null;
  publishedDate: string | null;
}

function aggregateSources(touches: SourceTouch[]): Map<SourceNodeKey, SourceAgg> {
  const agg = new Map<SourceNodeKey, SourceAgg>();
  for (const t of touches) {
    const existing = agg.get(t.key);
    if (existing) {
      existing.items.add(t.itemId);
      // Fill missing display fields from later touches; keep the newest published date for recency.
      existing.title ??= t.title;
      existing.year ??= t.year;
      existing.studyType ??= t.studyType;
      existing.claimRelation ??= t.claimRelation;
      existing.url ??= t.url;
      if (t.publishedDate && (!existing.publishedDate || t.publishedDate > existing.publishedDate)) {
        existing.publishedDate = t.publishedDate;
      }
    } else {
      agg.set(t.key, {
        key: t.key,
        items: new Set([t.itemId]),
        url: t.url,
        title: t.title,
        year: t.year,
        studyType: t.studyType,
        claimRelation: t.claimRelation,
        publishedDate: t.publishedDate,
      });
    }
  }
  return agg;
}

/** Total order: refCount desc → newest published_date → key asc. Deterministic (key breaks all ties). */
function compareForCap(a: SourceAgg, b: SourceAgg): number {
  if (b.items.size !== a.items.size) return b.items.size - a.items.size;
  const ad = a.publishedDate ?? "";
  const bd = b.publishedDate ?? "";
  if (ad !== bd) return bd < ad ? -1 : 1; // newer (larger ISO string) first; missing dates sort last
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function sourceLabel(agg: SourceAgg): string {
  if (agg.title) return agg.title;
  if (agg.key.startsWith("pmid:")) return `PMID ${agg.key.slice(5)}`;
  return agg.key;
}

export function buildResearchMap(input: ResearchMapInput): ResearchMap {
  const touches: SourceTouch[] = [];
  collectItemTouches(input.chats, touches);
  collectItemTouches(input.reports, touches);
  collectWatchTouches(input.watches, touches);

  const agg = aggregateSources(touches);
  const ordered = [...agg.values()].sort(compareForCap);
  const kept = ordered.slice(0, MAX_SOURCE_NODES);
  const keptKeys = new Set(kept.map((s) => s.key));
  const truncatedSources = ordered.length - kept.length;

  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  // Item nodes (always present) — refCount = distinct SURVIVING sources this item contributes.
  const itemSources = new Map<string, Set<SourceNodeKey>>(); // itemId -> surviving source keys
  const itemKind = new Map<string, MapNode["kind"]>();
  const registerItem = (id: string, title: string, kind: MapNode["kind"]): string => {
    const nodeId = `${kind}:${id}`;
    itemKind.set(nodeId, kind);
    nodes.push({ id: nodeId, kind, label: title || nodeId, refCount: 0, meta: {} });
    itemSources.set(nodeId, new Set());
    return nodeId;
  };
  for (const c of input.chats) registerItem(c.id, c.title, "chat");
  for (const r of input.reports) registerItem(r.id, r.title, "report");
  for (const w of input.watches) registerItem(w.id, w.title, "watch");

  // Map raw itemId -> node id per kind (item ids are unique within a kind, not necessarily across).
  // Touches carry only the raw id; resolve against whichever kind registered it by scanning items.
  const rawToNodeId = new Map<string, string>();
  for (const c of input.chats) rawToNodeId.set(`chat|${c.id}`, `chat:${c.id}`);
  for (const r of input.reports) rawToNodeId.set(`report|${r.id}`, `report:${r.id}`);
  for (const w of input.watches) rawToNodeId.set(`watch|${w.id}`, `watch:${w.id}`);

  // Re-walk touches to attribute surviving sources to their originating item NODE (kind-aware).
  const attribute = (items: ResearchMapItemCites[] | ResearchMapWatch[], kind: MapNode["kind"], toKey: (x: unknown) => SourceNodeKey[]) => {
    for (const it of items) {
      const nodeId = `${kind}:${it.id}`;
      const set = itemSources.get(nodeId);
      if (!set) continue;
      for (const key of toKey(it)) if (keptKeys.has(key)) set.add(key);
    }
  };
  attribute(input.chats, "chat", (x) => (x as ResearchMapItemCites).citations.map((c) => sourceKeyFromUrl(c.url)).filter((k): k is SourceNodeKey => !!k));
  attribute(input.reports, "report", (x) => (x as ResearchMapItemCites).citations.map((c) => sourceKeyFromUrl(c.url)).filter((k): k is SourceNodeKey => !!k));
  attribute(input.watches, "watch", (x) => (x as ResearchMapWatch).events.filter((e) => e.channel === "evidence").map(sourceKeyFromWatchEvent).filter((k): k is SourceNodeKey => !!k));

  // Source nodes (kept only) + cites edges + finalize item refCounts.
  for (const s of kept) {
    nodes.push({
      id: s.key,
      kind: "source",
      label: sourceLabel(s),
      refCount: s.items.size,
      meta: {
        ...(s.url ? { url: s.url } : {}),
        ...(s.year ? { year: s.year } : {}),
        ...(s.studyType ? { studyType: s.studyType } : {}),
        ...(s.claimRelation ? { claimRelation: s.claimRelation } : {}),
      },
    });
  }
  for (const [nodeId, keys] of itemSources) {
    const itemNode = nodes.find((n) => n.id === nodeId);
    if (itemNode) itemNode.refCount = keys.size;
    for (const key of keys) {
      edges.push({ id: `cites:${nodeId}->${key}`, source: nodeId, target: key, kind: "cites", weight: 1 });
    }
  }

  // Shared edges over surviving sources: unordered item pairs sharing >=1 source, weight = shared count.
  const itemIds = [...itemSources.keys()];
  for (let i = 0; i < itemIds.length; i++) {
    for (let j = i + 1; j < itemIds.length; j++) {
      const a = itemIds[i];
      const b = itemIds[j];
      if (!a || !b) continue;
      const sa = itemSources.get(a);
      const sb = itemSources.get(b);
      if (!sa || !sb) continue;
      let shared = 0;
      for (const key of sa) if (sb.has(key)) shared++;
      if (shared > 0) {
        edges.push({ id: `shared:${a}--${b}`, source: a, target: b, kind: "shared", weight: shared });
      }
    }
  }

  return { nodes, edges, meta: { truncatedSources } };
}
```

- [ ] **Step 4: Add the export to the shared index**

In `packages/shared/src/index.ts`, add near the other `export * from` lines (e.g. right after the `source-ids.ts` export on the line reading `export * from "./source-ids.ts";`):

```typescript
// Research Map (per-project connection graph): pure node/edge aggregation from saved-item citations.
export * from "./research-map.ts";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `deno test packages/shared/src/research-map.test.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/research-map.ts packages/shared/src/research-map.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): buildResearchMap — pure project graph aggregation"
```

---

### Task 2: Data hook (`apps/web/lib/research-map-data.ts`)

**Files:**
- Create: `apps/web/lib/research-map-data.ts`
- Test: manual (React hook with Supabase I/O — verified via `npm run build` typecheck and in-app; no unit test harness for hooks in this repo).

**Interfaces:**
- Consumes:
  - `buildResearchMap`, `ResearchMap`, `ResearchMapInput`, `ResearchMapItemCites`, `ResearchMapWatch` from `@nemesis/shared` (Task 1).
  - `fetchConversationTurns(conversationId: string): Promise<SavedTurn[]>` — `apps/web/lib/api.ts`. `SavedTurn = { q: string; a: AskResponse | null; research?: SavedResearchCard }`; `AskResponse` carries `citations: Citation[]`. Deep-research turns have `a === null` and a `research.savedReportId` pointer instead.
  - `fetchResearchReport(savedReportId: string): Promise<ResearchReport | null>` — `apps/web/lib/api.ts`. `ResearchReport` carries `citations: Citation[]`.
  - `fetchWatchEvents(watchId: string): Promise<WatchEvent[]>` — `apps/web/lib/api.ts`. `WatchEvent = { channel: "evidence" | "news"; source_key: string; url: string | null; title: string; provider: string | null; study_type: string | null; published_date: string | null; ... }`.
  - `ProjectContents = { chats: ProjectChat[]; reports: ResearchReportSummary[]; watches: WatchSummary[] }` — `apps/web/lib/api.ts`. `ProjectChat = { id: string; title: string; created_at?: string }`; `ResearchReportSummary` has `{ id, title, ... }`; `WatchSummary` has `{ id, title, ... }`.
  - `getCached<T>(key)` / `setCached<T>(key, value)` — `apps/web/lib/cache.ts` (in-memory SPA-session cache).
  - `type { Citation }` from `@nemesis/shared`.
- Produces (relied on by Task 5):
  - `interface ResearchMapState { map: ResearchMap | null; loading: boolean; error: string | null; skipped: number; refresh: () => void }`
  - `function useResearchMapData(projectId: string, contents: ProjectContents | null): ResearchMapState`

**Design notes:**
- Concurrency cap **4** via a tiny local pool (no dependency added).
- Per-item failure degrades: the item is dropped from that category's input array and counted in `skipped`; one bad fetch never rejects the whole assembly.
- Chats: collect citations from every `turn.a?.citations`; for a `turn.research?.savedReportId`, follow the pointer to `fetchResearchReport` and append its `citations`. A chat therefore may pull citations from both inline answers and its embedded research cards.
- Cache: seed `map` from `getCached("map:{projectId}")` for instant paint; overwrite after each successful build.

- [ ] **Step 1: Write the hook**

Create `apps/web/lib/research-map-data.ts`:

```typescript
"use client";
// Assembles the per-project Research Map data: fetches each item's citations (chats via their saved
// turns + any embedded deep-research report; reports directly; watches via their evidence events),
// then hands the collected shape to the pure buildResearchMap aggregator. Per-item failures degrade
// (skip + count) so one unreadable chat never blanks the map. Concurrency-capped at 4 to stay gentle
// on the RLS-scoped browser client. Seeds from an in-memory cache for an instant re-paint.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Citation } from "@nemesis/shared";
import {
  buildResearchMap,
  type ResearchMap,
  type ResearchMapInput,
  type ResearchMapItemCites,
  type ResearchMapWatch,
} from "@nemesis/shared";
import {
  fetchConversationTurns,
  fetchResearchReport,
  fetchWatchEvents,
  type ProjectContents,
} from "@/lib/api";
import { getCached, setCached } from "@/lib/cache";

export interface ResearchMapState {
  map: ResearchMap | null;
  loading: boolean;
  error: string | null;
  /** How many items were skipped because their citation fetch failed. */
  skipped: number;
  refresh: () => void;
}

/** Run tasks with a fixed concurrency ceiling, preserving input order in the output. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Gather a chat's citations from its inline answers plus any embedded deep-research report. */
async function chatCitations(chatId: string): Promise<Citation[]> {
  const turns = await fetchConversationTurns(chatId);
  const out: Citation[] = [];
  const reportIds: string[] = [];
  for (const t of turns) {
    if (t.a?.citations?.length) out.push(...t.a.citations);
    if (t.research?.savedReportId) reportIds.push(t.research.savedReportId);
  }
  for (const rid of reportIds) {
    const report = await fetchResearchReport(rid);
    if (report?.citations?.length) out.push(...report.citations);
  }
  return out;
}

export function useResearchMapData(projectId: string, contents: ProjectContents | null): ResearchMapState {
  const cacheKey = `map:${projectId}`;
  const [map, setMap] = useState<ResearchMap | null>(() => getCached<ResearchMap>(cacheKey) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => {
    if (!contents) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      let failures = 0;
      const settle = async <T,>(id: string, load: () => Promise<T>, empty: T): Promise<T> => {
        try {
          return await load();
        } catch {
          failures++;
          return empty;
        }
      };

      const chats = await mapWithLimit(contents.chats, 4, async (c): Promise<ResearchMapItemCites> => ({
        id: c.id,
        title: c.title,
        citations: await settle(c.id, () => chatCitations(c.id), []),
      }));
      const reports = await mapWithLimit(contents.reports, 4, async (r): Promise<ResearchMapItemCites> => ({
        id: r.id,
        title: r.title,
        citations: await settle(r.id, async () => (await fetchResearchReport(r.id))?.citations ?? [], []),
      }));
      const watches = await mapWithLimit(contents.watches, 4, async (w): Promise<ResearchMapWatch> => ({
        id: w.id,
        title: w.title,
        events: await settle(w.id, async () => {
          const events = await fetchWatchEvents(w.id);
          return events.map((e) => ({
            source_key: e.source_key,
            url: e.url,
            title: e.title,
            channel: e.channel,
            published_date: e.published_date,
            study_type: e.study_type,
          }));
        }, []),
      }));

      if (cancelled || !aliveRef.current) return;
      const input: ResearchMapInput = { chats, reports, watches };
      const built = buildResearchMap(input);
      setCached(cacheKey, built);
      setMap(built);
      setSkipped(failures);
      setLoading(false);
    })().catch((e) => {
      if (cancelled || !aliveRef.current) return;
      setError(e instanceof Error ? e.message : "Could not build the map.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [contents, cacheKey, tick]);

  return { map, loading, error, skipped, refresh };
}
```

- [ ] **Step 2: Typecheck via build**

Run: `cd apps/web && npm run build`
Expected: Compiles. (This file is not yet imported by any page, so it must at least type-check as part of the workspace; if the build tree-shakes unused modules, verify with `npx tsc --noEmit` in `apps/web`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/research-map-data.ts
git commit -m "feat(web): useResearchMapData — per-item citation assembly for the project map"
```

---

### Task 3: Enrichment-by-PMID refactor + `ResearchMapView` (`apps/web/lib/enrichment.ts`, `apps/web/components/ResearchMapView.tsx`)

**Files:**
- Modify: `apps/web/lib/enrichment.ts` (extract `useEnrichmentByPmids`; existing `useEnrichment` delegates)
- Create: `apps/web/components/ResearchMapView.tsx`
- Test: manual — `npm run build` typecheck + in-app render.

**Interfaces:**
- Consumes:
  - `MapNode`, `MapEdge`, `ResearchMap` from `@nemesis/shared` (Task 1).
  - `pmidFromUrl` from `@nemesis/shared` — to derive `pmid:N` from a source node's `meta.url`.
  - `SourceEnrichment` + the new `useEnrichmentByPmids(pmids: string[]): Record<string, SourceEnrichment>` from `@/lib/enrichment` (this task). `SourceEnrichment = { doi: string | null; retracted: boolean; cited_by: number | null; tallies: { supporting: number; contrasting: number; mentioning: number } | null; snapshot: StudySnapshot | null }`. Returned map keys are `pmid:N`.
  - `fetchGraphExpand(pmid: string): Promise<GraphExpand>` from `@/lib/api` (Task 4) — for "Explore related".
  - `Core, ElementDefinition` from `cytoscape`.
- Produces (relied on by Task 5):
  - `function ResearchMapView({ map, loading, error, skipped, onOpenItem }: ResearchMapViewProps): JSX.Element`
  - `interface ResearchMapViewProps { map: ResearchMap | null; loading: boolean; error: string | null; skipped: number; onOpenItem: (kind: "chat" | "report" | "watch", id: string) => void }`

**Refactor note (why `useEnrichmentByPmids`):** the map's source nodes are keyed `pmid:N`, not `Citation` objects. Rather than fabricate 9-field `Citation` stubs to satisfy `useEnrichment(Citation[])`, we extract the pmid-driven core so the map passes real `pmid:N` keys directly and the returned map keys line up with node ids. `enrichment.ts` is app lib (NOT the frozen `supabase/functions/ask/**`), so this refactor is in-bounds. The existing `useEnrichment` keeps its exact signature and behavior by delegating.

- [ ] **Step 1: Refactor `enrichment.ts` to expose `useEnrichmentByPmids`**

In `apps/web/lib/enrichment.ts`, replace the final `useEnrichment` function (the one that derives `pmids` from `citations`) with the two functions below (keep everything above it — `StudySnapshot`, `SourceEnrichment`, `memo`, `pending`, `fetchBatch` — unchanged):

```typescript
/** Trust enrichment for an explicit set of `pmid:N`-derived PMIDs. The single fetch path is shared
 *  with useEnrichment (same module-level memo + in-flight de-dup). Returned keys are `pmid:N`. */
export function useEnrichmentByPmids(pmids: string[]): Record<string, SourceEnrichment> {
  const [map, setMap] = useState<Record<string, SourceEnrichment>>({});
  const unique = [...new Set(pmids)];
  const sig = unique.join(",");
  useEffect(() => {
    if (!sig) return;
    let alive = true;
    void fetchBatch(sig.split(",")).then((m) => { if (alive) setMap(m); });
    return () => { alive = false; };
  }, [sig]);
  return map;
}

export function useEnrichment(citations: Citation[]): Record<string, SourceEnrichment> {
  const pmids = citations.map((c) => pmidFromUrl(c.url)).filter((p): p is string => !!p);
  return useEnrichmentByPmids(pmids);
}
```

Note: `useEnrichment` must NOT change its exported signature or behavior — it still takes `Citation[]` and returns the same `Record<string, SourceEnrichment>`. The `pmidFromUrl` and `useState`/`useEffect` imports already exist at the top of the file.

- [ ] **Step 2: Verify the refactor type-checks and existing callers still compile**

Run: `cd apps/web && npm run build`
Expected: Compiles. `useEnrichment` callers (evidence panel) are unaffected — same signature.

- [ ] **Step 3: Write `ResearchMapView.tsx`**

Create `apps/web/components/ResearchMapView.tsx`:

```typescript
"use client";
// The per-project Research Map: a cytoscape force graph over the project's items (chats/reports/
// watches) and the sources they cite. Adapted from EvidenceGraph.tsx's conventions (CSS-token theme,
// cose layout, tap-to-select) but driven by the workspace-spanning MapNode/MapEdge shape instead of a
// single answer. Item nodes link out to their page; source nodes open a side card and can fan out to
// OpenAlex "related papers" as CLIENT-ONLY ghost nodes (never persisted, never fed back to the
// aggregator). Only the top 24 source nodes are enrichment-decorated (respects the trust-cache quota).
import { useEffect, useMemo, useRef, useState } from "react";
import type { Core, ElementDefinition, NodeSingular } from "cytoscape";
import { pmidFromUrl, type MapNode, type ResearchMap } from "@nemesis/shared";
import { useEnrichmentByPmids, type SourceEnrichment } from "@/lib/enrichment";
import { fetchGraphExpand, type GraphExpandWork } from "@/lib/api";

export interface ResearchMapViewProps {
  map: ResearchMap | null;
  loading: boolean;
  error: string | null;
  skipped: number;
  onOpenItem: (kind: "chat" | "report" | "watch", id: string) => void;
}

const ENRICH_LIMIT = 24;

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** A source node's PMID (for enrichment + expand), or null for a url-keyed source. */
function pmidOfSource(n: MapNode): string | null {
  if (n.id.startsWith("pmid:")) return n.id.slice(5);
  return pmidFromUrl(n.meta.url ?? null);
}

/** Node radius from recurrence: item nodes fixed, sources scale with refCount. */
function nodeWeight(n: MapNode): number {
  if (n.kind === "source") return Math.max(16, Math.min(40, 16 + n.refCount * 6));
  return n.kind === "report" ? 40 : n.kind === "watch" ? 34 : 30;
}

/** A client-only ghost node from an OpenAlex expand — never persisted, never re-aggregated. */
interface Ghost {
  id: string;         // `ghost:pmid:N` or `ghost:W...`
  parentPmid: string; // the source node we expanded from
  label: string;
  year: string | null;
  pmid: string | null;
  relation: "cites" | "cited_by" | "similar";
}

function buildBaseElements(map: ResearchMap, topPmids: Set<string>, enrich: Record<string, SourceEnrichment>): ElementDefinition[] {
  const els: ElementDefinition[] = [];
  for (const n of map.nodes) {
    const pmid = n.kind === "source" ? pmidOfSource(n) : null;
    const enr = pmid && topPmids.has(pmid) ? enrich[`pmid:${pmid}`] : undefined;
    const retracted = enr?.retracted === true;
    els.push({
      data: {
        id: n.id,
        label: n.label.length > 46 ? `${n.label.slice(0, 45)}…` : n.label,
        kind: n.kind,
        weight: nodeWeight(n),
        relation: n.meta.claimRelation ?? "",
        citedBy: enr?.cited_by ?? null,
      },
      classes: [n.kind, retracted ? "retracted" : "", n.meta.claimRelation ?? ""].filter(Boolean).join(" "),
    });
  }
  for (const e of map.edges) {
    els.push({
      data: { id: e.id, source: e.source, target: e.target, weight: e.kind === "shared" ? Math.min(6, 1 + e.weight) : 2 },
      classes: e.kind === "shared" ? "shared-edge" : "cites-edge",
    });
  }
  return els;
}

function ghostElements(ghosts: Ghost[]): ElementDefinition[] {
  const els: ElementDefinition[] = [];
  const seen = new Set<string>();
  for (const g of ghosts) {
    if (!seen.has(g.id)) {
      seen.add(g.id);
      els.push({
        data: { id: g.id, label: g.label.length > 40 ? `${g.label.slice(0, 39)}…` : g.label, kind: "source", weight: 15, ghostPmid: g.pmid },
        classes: "source ghost",
      });
    }
    els.push({
      data: { id: `related:${g.parentPmid}->${g.id}`, source: `pmid:${g.parentPmid}`, target: g.id, weight: 1 },
      classes: "related-edge",
    });
  }
  return els;
}

export function ResearchMapView({ map, loading, error, skipped, onOpenItem }: ResearchMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [expanding, setExpanding] = useState(false);
  const [expandErr, setExpandErr] = useState<string | null>(null);

  // Top-24 source PMIDs by refCount (map.nodes source order already reflects the cap sort in Task 1).
  const topPmids = useMemo(() => {
    if (!map) return new Set<string>();
    const pmids = map.nodes
      .filter((n) => n.kind === "source")
      .map((n) => pmidOfSource(n))
      .filter((p): p is string => !!p)
      .slice(0, ENRICH_LIMIT);
    return new Set(pmids);
  }, [map]);
  const enrich = useEnrichmentByPmids([...topPmids].map((p) => p));

  const nodeById = useMemo(() => {
    const m = new Map<string, MapNode>();
    if (map) for (const n of map.nodes) m.set(n.id, n);
    return m;
  }, [map]);
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;
  const selectedPmid = selectedNode && selectedNode.kind === "source" ? pmidOfSource(selectedNode) : null;
  const selectedEnr = selectedPmid ? enrich[`pmid:${selectedPmid}`] : undefined;

  const elements = useMemo(() => {
    if (!map) return [];
    return [...buildBaseElements(map, topPmids, enrich), ...ghostElements(ghosts)];
  }, [map, topPmids, enrich, ghosts]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !elements.length) return;
    let destroyed = false;
    let cy: Core | null = null;
    (async () => {
      const mod = await import("cytoscape");
      if (destroyed) return;
      const text = cssVar("--text", "#f4f4f5");
      const text2 = cssVar("--text-2", "#a6a6ad");
      const text3 = cssVar("--text-3", "#8c8c95");
      const line = cssVar("--line-2", "#2c2c33");
      const surface = cssVar("--surface", "#141417");
      const raised = cssVar("--raised", "#1f1f24");
      const acid = cssVar("--acid", "#bcff3c");
      const info = cssVar("--info", "#7fb2ff");
      const warn = cssVar("--warn", "#f5b23b");
      const danger = cssVar("--danger", "#ff5c4d");
      cy = mod.default({
        container: el,
        elements,
        minZoom: 0.3,
        maxZoom: 2.4,
        wheelSensitivity: 0.18,
        style: [
          { selector: "node", style: { label: "data(label)", color: text2, "font-size": 9, "text-outline-color": surface, "text-outline-width": 2, "background-color": text3, "border-width": 1, "border-color": line, width: "data(weight)", height: "data(weight)" } },
          { selector: ".chat", style: { shape: "round-rectangle", "background-color": raised, "border-color": info, "border-width": 2, color: text, "font-size": 10 } },
          { selector: ".report", style: { shape: "round-rectangle", "background-color": raised, "border-color": acid, "border-width": 2, color: text, "font-weight": "bold", "font-size": 10 } },
          { selector: ".watch", style: { shape: "round-rectangle", "background-color": surface, "border-color": warn, "border-width": 2, color: text2, "font-size": 10 } },
          { selector: ".source", style: { "background-color": text2, "border-color": line } },
          { selector: ".supports", style: { "border-color": acid, "border-width": 2 } },
          { selector: ".partial", style: { "border-color": info, "border-width": 2 } },
          { selector: ".conflicts", style: { "border-color": danger, "border-width": 2 } },
          { selector: ".mentions", style: { "border-color": warn } },
          { selector: ".retracted", style: { "border-color": danger, "border-width": 4, "border-style": "double" } },
          { selector: ".ghost", style: { "background-color": surface, "border-color": text3, "border-style": "dashed", opacity: 0.7, width: 14, height: 14 } },
          { selector: "edge", style: { width: "data(weight)", "line-color": line, "curve-style": "bezier", opacity: 0.6 } },
          { selector: ".cites-edge", style: { "line-color": line, "target-arrow-shape": "triangle", "target-arrow-color": line } },
          { selector: ".shared-edge", style: { "line-color": acid, opacity: 0.55, "line-style": "solid" } },
          { selector: ".related-edge", style: { "line-color": text3, "line-style": "dashed", opacity: 0.5 } },
          { selector: ".selected", style: { "background-color": text, "border-color": acid, "border-width": 3, color: text } },
        ],
        layout: { name: "cose", animate: false, randomize: true, fit: true, padding: 28, nodeRepulsion: 7800, idealEdgeLength: 92, edgeElasticity: 80, numIter: 900 },
      });
      cyRef.current = cy;
      cy.on("tap", "node", (event) => {
        const node = event.target as NodeSingular;
        const id = node.data("id") as string;
        const kind = node.data("kind") as string;
        if (kind === "source") {
          setSelectedId(id);
          setExpandErr(null);
        } else {
          // item node → open its page (id form is `chat:...` / `report:...` / `watch:...`)
          const [k, ...rest] = id.split(":");
          if (k === "chat" || k === "report" || k === "watch") onOpenItem(k, rest.join(":"));
        }
      });
    })();
    return () => { destroyed = true; cy?.destroy(); cyRef.current = null; };
  }, [elements, onOpenItem]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("selected");
    if (selectedId) cy.getElementById(selectedId).addClass("selected");
  }, [selectedId, elements]);

  async function exploreRelated() {
    if (!selectedPmid || expanding) return;
    setExpanding(true);
    setExpandErr(null);
    try {
      const res = await fetchGraphExpand(selectedPmid);
      const next: Ghost[] = [];
      const add = (works: GraphExpandWork[], relation: Ghost["relation"]) => {
        for (const w of works) {
          const id = w.pmid ? `ghost:pmid:${w.pmid}` : `ghost:${w.id}`;
          next.push({ id, parentPmid: selectedPmid, label: w.title ?? id, year: w.year, pmid: w.pmid ?? null, relation });
        }
      };
      add(res.cites, "cites");
      add(res.cited_by, "cited_by");
      add(res.similar, "similar");
      setGhosts((prev) => [...prev, ...next]);
    } catch {
      setExpandErr("Couldn’t load related papers right now. Try again in a moment.");
    } finally {
      setExpanding(false);
    }
  }

  if (loading && !map) return <p className="proj-empty">Building the map…</p>;
  if (error) return <p className="tmpl-note">{error}</p>;
  const sourceCount = map ? map.nodes.filter((n) => n.kind === "source").length : 0;
  if (!map || sourceCount === 0) {
    return <p className="proj-empty">Add chats or reports with citations to see the map. It gets interesting once a few pieces of research share the same sources.</p>;
  }

  return (
    <div className="ev-map-panel">
      <div className="ev-map-legend" aria-label="Research map legend">
        <span><i className="legend-dot supports" />Report</span>
        <span><i className="legend-dot partial" />Chat</span>
        <span><i className="legend-dot mentions" />Watch</span>
        <span><i className="legend-dot conflicts" />Retracted</span>
      </div>
      <div className="ev-map-canvas" ref={containerRef} role="img" aria-label="Interactive research map" />
      <div className="ev-map-help">
        Drag nodes · scroll to zoom · tap a paper for its card, an item to open it
        {map.meta.truncatedSources > 0 ? ` · showing the top ${sourceCount} sources (${map.meta.truncatedSources} more not shown)` : ""}
        {skipped > 0 ? ` · ${skipped} item${skipped === 1 ? "" : "s"} couldn’t be read` : ""}
      </div>
      {selectedNode && selectedNode.kind === "source" ? (
        <div className="ev-map-selected">
          <b>{selectedNode.label}</b>
          <small>
            {selectedNode.meta.year ? `${selectedNode.meta.year} · ` : ""}
            {selectedNode.meta.studyType ? `${selectedNode.meta.studyType} · ` : ""}
            cited by {selectedEnr?.cited_by ?? "—"}
            {selectedEnr?.retracted ? " · RETRACTED" : ""}
          </small>
          {selectedEnr?.tallies ? (
            <small>Support {selectedEnr.tallies.supporting} · Contrasting {selectedEnr.tallies.contrasting} · Mentioning {selectedEnr.tallies.mentioning}</small>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {selectedNode.meta.url ? <a href={selectedNode.meta.url} target="_blank" rel="noreferrer" className="mode">Open source</a> : null}
            {selectedPmid ? <button type="button" className="mode" onClick={() => void exploreRelated()} disabled={expanding}>{expanding ? "Loading…" : "Explore related"}</button> : null}
          </div>
          {expandErr ? <small className="tmpl-note">{expandErr}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck via build** (Task 4 must land first for `fetchGraphExpand`/`GraphExpandWork` to resolve; if implementing 3 before 4, temporarily this import will fail — implement Task 4 before running this build, or stub the import. Recommended order: do Task 4, then this step.)

Run: `cd apps/web && npm run build`
Expected: Compiles once Task 4 exists.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/enrichment.ts apps/web/components/ResearchMapView.tsx
git commit -m "feat(web): ResearchMapView + useEnrichmentByPmids for project graph"
```

---

### Task 4: OpenAlex expand route + client helper (`apps/web/app/api/v1/graph/expand/route.ts`, `apps/web/lib/api.ts`)

**Files:**
- Create: `apps/web/app/api/v1/graph/expand/route.ts`
- Modify: `apps/web/lib/api.ts` (add `fetchGraphExpand` + types)
- Test: manual — `npm run build` typecheck + a signed-in in-app call.

**Interfaces:**
- Consumes:
  - `verifyBearer(req: Request): Promise<VerifiedUser | null>` — `@/lib/server` (returns `{ id, email } | null`).
  - `pmidFromUrl(url)` — `@nemesis/shared` (to strip a full PubMed URL back to a bare PMID from OpenAlex `ids.pmid`, which is a URL, e.g. `https://pubmed.ncbi.nlm.nih.gov/23245604`).
  - `supabase.auth.getSession()` + `supabaseUrl`/`supabaseAnonKey` — for the client helper's bearer (existing pattern, `apps/web/lib/api.ts` already imports these).
- Produces (relied on by Task 3):
  - `interface GraphExpandWork { id: string; title: string | null; year: string | null; pmid: string | null }`
  - `interface GraphExpand { work: GraphExpandWork; cites: GraphExpandWork[]; cited_by: GraphExpandWork[]; similar: GraphExpandWork[] }`
  - `function fetchGraphExpand(pmid: string): Promise<GraphExpand>`

**Verified OpenAlex contract (checked live 2026-07-04):**
- `GET /works/pmid:{pmid}?select=id,ids,title,publication_year,referenced_works,related_works` → object with `id` (`https://openalex.org/W...`), `ids.pmid` (full PubMed URL), `title`, `publication_year` (number), `referenced_works` (array of OpenAlex URLs), `related_works` (array of OpenAlex URLs, ~10).
- `GET /works?filter=cites:{W}&select=id,ids,title,publication_year&per-page=8` → `{ meta, results }`; results are full work objects (cited-by).
- `GET /works?filter=openalex_id:{W}|{W}|...&select=id,ids,title,publication_year&per-page=8` → resolves referenced-work IDs to metadata (outgoing "cites").
- `GET /works?filter=related_to:{W}&select=id,ids,title,publication_year&per-page=8` → similar works.
- OpenAlex IDs are URLs; the short form is the trailing `W...` segment. `mailto=` is a politeness param (optional).

**Scope guardrail:** the ghost nodes these results become are CLIENT-ONLY (Task 3). They must never enter `buildResearchMap` input, the `map:{projectId}` cache, or shared-edge computation.

- [ ] **Step 1: Write the route**

Create `apps/web/app/api/v1/graph/expand/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

import { pmidFromUrl } from "@nemesis/shared";
import { verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

// HARDENING (mirrors evidence/search/route.ts): this route fans out to OpenAlex (up to 4 calls per
// request), so it must not be a public open door. Two guards: (1) require a signed-in user; nothing
// auto-calls this route, so auth breaks no flow. (2) a per-instance sliding-window rate cap bounding
// the outbound fan-out under a token burst. Responses carry a CDN cache header so repeats are absorbed.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 30; // expands per window per instance — a backstop; auth is the primary gate
let hits: number[] = [];
function rateLimited(now: number): boolean {
  hits = hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  return false;
}

const OPENALEX = "https://api.openalex.org";
const CAP = 8;

interface SlimWork { id: string; title: string | null; year: string | null; pmid: string | null }

interface OpenAlexWork {
  id?: string;
  ids?: { pmid?: string };
  title?: string | null;
  publication_year?: number | null;
  referenced_works?: string[];
  related_works?: string[];
}

/** Short OpenAlex id (`W...`) from a full or short id string. */
function shortId(id: string | undefined): string | null {
  if (!id) return null;
  const m = id.match(/(W\d+)/);
  return m ? m[1] ?? null : null;
}

function slim(w: OpenAlexWork): SlimWork {
  return {
    id: shortId(w.id) ?? (w.id ?? ""),
    title: w.title ?? null,
    year: typeof w.publication_year === "number" ? String(w.publication_year) : null,
    pmid: pmidFromUrl(w.ids?.pmid ?? null),
  };
}

function mailtoParam(): string {
  const mail = process.env.OPENALEX_MAILTO;
  return mail ? `&mailto=${encodeURIComponent(mail)}` : "";
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`openalex ${res.status}`);
  return res.json();
}

async function listWorks(url: string): Promise<SlimWork[]> {
  const data = await getJson(url);
  if (typeof data !== "object" || data === null || !("results" in data)) return [];
  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.slice(0, CAP).map((r) => slim(r as OpenAlexWork));
}

export async function GET(req: NextRequest) {
  const user = await verifyBearer(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized", message: "Sign in to explore related papers." }, { status: 401 });
  }

  const pmid = req.nextUrl.searchParams.get("pmid")?.trim();
  if (!pmid || !/^\d{1,9}$/.test(pmid)) {
    return NextResponse.json({ error: "bad_pmid", message: "Pass a numeric ?pmid=..." }, { status: 400 });
  }

  if (rateLimited(Date.now())) {
    return NextResponse.json({ error: "rate_limited", message: "Too many lookups right now — try again shortly." }, { status: 429 });
  }

  try {
    const mailto = mailtoParam();
    const root = await getJson(`${OPENALEX}/works/pmid:${pmid}?select=id,ids,title,publication_year,referenced_works,related_works${mailto}`) as OpenAlexWork;
    const workId = shortId(root.id);
    if (!workId) {
      return NextResponse.json({ error: "not_found", message: "No matching paper in the citation graph." }, { status: 404 });
    }

    const refIds = (root.referenced_works ?? []).map(shortId).filter((x): x is string => !!x).slice(0, CAP);
    const [cites, citedBy, similar] = await Promise.all([
      refIds.length
        ? listWorks(`${OPENALEX}/works?filter=openalex_id:${refIds.join("|")}&select=id,ids,title,publication_year&per-page=${CAP}${mailto}`)
        : Promise.resolve<SlimWork[]>([]),
      listWorks(`${OPENALEX}/works?filter=cites:${workId}&select=id,ids,title,publication_year&per-page=${CAP}${mailto}`),
      listWorks(`${OPENALEX}/works?filter=related_to:${workId}&select=id,ids,title,publication_year&per-page=${CAP}${mailto}`),
    ]);

    const payload = {
      work: slim(root),
      cites,
      cited_by: citedBy,
      similar,
    };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Related-paper lookup failed";
    return NextResponse.json({ error: "graph_expand_failed", message }, { status: 502 });
  }
}
```

- [ ] **Step 2: Add the client helper + types to `api.ts`**

In `apps/web/lib/api.ts`, add near the other same-origin fetch helpers (anywhere at module scope after the imports; the file already imports `supabase` from `./supabase`):

```typescript
// ── Research Map: OpenAlex-backed "explore related papers" (calls the auth-gated /api/v1/graph/expand
//    Next.js route). Client-only — the returned works become ghost nodes in the map, never persisted. ──
export interface GraphExpandWork {
  /** Short OpenAlex id (e.g. "W2125065061"). */
  id: string;
  title: string | null;
  year: string | null;
  pmid: string | null;
}

export interface GraphExpand {
  work: GraphExpandWork;
  cites: GraphExpandWork[];
  cited_by: GraphExpandWork[];
  similar: GraphExpandWork[];
}

/** Fetch cites / cited-by / similar papers for a PMID via the auth-gated proxy. Throws on failure so
 *  the caller can show an honest "couldn't load" message (never fabricates results). */
export async function fetchGraphExpand(pmid: string): Promise<GraphExpand> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to explore related papers");
  const res = await fetch(`/api/v1/graph/expand?pmid=${encodeURIComponent(pmid)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`graph expand failed (${res.status})`);
  return (await res.json()) as GraphExpand;
}
```

- [ ] **Step 3: Typecheck via build**

Run: `cd apps/web && npm run build`
Expected: Compiles. Now Task 3's `ResearchMapView` import of `fetchGraphExpand`/`GraphExpandWork` resolves too.

- [ ] **Step 4: Sanity-check the route logic against OpenAlex (optional live check)**

Run (a quick shape check, no auth — confirms the OpenAlex contract the route depends on):
```bash
curl -s "https://api.openalex.org/works/pmid:23245604?select=id,ids,title,publication_year,referenced_works,related_works" | head -c 400
```
Expected: JSON with `"id":"https://openalex.org/W..."`, `"ids":{...,"pmid":"https://pubmed.ncbi.nlm.nih.gov/23245604"}`, and a `referenced_works` array.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/graph/expand/route.ts apps/web/lib/api.ts
git commit -m "feat(web): auth-gated OpenAlex expand route + fetchGraphExpand helper"
```

---

### Task 5: Wire the "Map" tab into the project workspace (`apps/web/app/app/projects/[id]/page.tsx`)

**Files:**
- Modify: `apps/web/app/app/projects/[id]/page.tsx`
- Test: manual — `npm run build` + in-app: open a project with ≥2 chats/reports that share sources, click Map.

**Interfaces:**
- Consumes:
  - `useResearchMapData(projectId, contents)` — `@/lib/research-map-data` (Task 2), returns `{ map, loading, error, skipped, refresh }`.
  - `ResearchMapView` — `@/components/ResearchMapView` (Task 3), props `{ map, loading, error, skipped, onOpenItem }`.
  - Existing page state: `contents: ProjectContents | null`, `projectId`, `router`, the `Tab` union and the tab `chip-row`.

**Design notes:**
- Extend the `Tab` union with `"map"`. The existing tab loop renders item lists for `conversation`/`report`/`watch`; the Map is a separate view, so render the tab button in the same `chip-row` but branch the section body: item lists for the three item tabs, `ResearchMapView` for `"map"`.
- **Lazy:** only build the map when Map is first activated. Track `mapActivated` and pass `contents` to the hook only after activation, so navigating a project never fires the per-item fetch fan-out unless the user opens Map.
- `onOpenItem` maps `(kind, id)` to the existing `linkFor` route and navigates.

- [ ] **Step 1: Add imports**

At the top of `apps/web/app/app/projects/[id]/page.tsx`, add to the existing import block:

```typescript
import { useResearchMapData } from "@/lib/research-map-data";
import { ResearchMapView } from "@/components/ResearchMapView";
```

- [ ] **Step 2: Extend the `Tab` type and add lazy-activation state**

Change the `Tab` type declaration (currently `type Tab = "conversation" | "report" | "watch";`) to:

```typescript
type Tab = "conversation" | "report" | "watch" | "map";
```

Inside `ProjectWorkspacePage`, after the existing `const [settingsOpen, setSettingsOpen] = useState(false);` line, add:

```typescript
  const [mapActivated, setMapActivated] = useState(false);
  // Lazy: the map's per-item citation fetch only runs once the user opens the Map tab.
  const mapData = useResearchMapData(projectId, mapActivated ? contents : null);
```

- [ ] **Step 3: Add the Map tab button and branch the section body**

In the tabs `chip-row`, the current loop iterates `["conversation", "report", "watch"]`. Change it to include `"map"` and give Map a count-free label. Replace the tab loop block:

```tsx
          {/* Tabs */}
          <div className="chip-row" role="tablist" aria-label="Project contents">
            {(["conversation", "report", "watch"] as Tab[]).map((t) => {
              const label = t === "conversation" ? "Chats" : t === "report" ? "Reports" : "Monitoring";
              const count = t === "conversation" ? contents.chats.length : t === "report" ? contents.reports.length : contents.watches.length;
              return (
                <button key={t} type="button" role="tab" aria-selected={tab === t}
                  className={`chip-action${tab === t ? " active" : ""}`}
                  onClick={() => { setTab(t); setOpenPicker(false); }}>
                  {label} <small>{count}</small>
                </button>
              );
            })}
          </div>
```

with:

```tsx
          {/* Tabs */}
          <div className="chip-row" role="tablist" aria-label="Project contents">
            {(["conversation", "report", "watch"] as Tab[]).map((t) => {
              const label = t === "conversation" ? "Chats" : t === "report" ? "Reports" : "Monitoring";
              const count = t === "conversation" ? contents.chats.length : t === "report" ? contents.reports.length : contents.watches.length;
              return (
                <button key={t} type="button" role="tab" aria-selected={tab === t}
                  className={`chip-action${tab === t ? " active" : ""}`}
                  onClick={() => { setTab(t); setOpenPicker(false); }}>
                  {label} <small>{count}</small>
                </button>
              );
            })}
            <button type="button" role="tab" aria-selected={tab === "map"}
              className={`chip-action${tab === "map" ? " active" : ""}`}
              onClick={() => { setTab("map"); setOpenPicker(false); setMapActivated(true); }}>
              Map
            </button>
          </div>
```

- [ ] **Step 4: Render the Map view instead of the item section when the Map tab is active**

The item-list `<section className="proj-section"> … </section>` block should only render for the three item tabs. Wrap the whole section in `{tab !== "map" ? ( … ) : (`ResearchMapView`)}`. Change the opening of the section from:

```tsx
          <section className="proj-section">
```

to:

```tsx
          {tab === "map" ? (
            <section className="proj-section">
              <div className="proj-section-head">
                <h3><Icon name="doc" size={14} /> Map</h3>
              </div>
              <ResearchMapView
                map={mapData.map}
                loading={mapData.loading}
                error={mapData.error}
                skipped={mapData.skipped}
                onOpenItem={(kind, id) => router.push(linkFor(kind, id))}
              />
            </section>
          ) : (
          <section className="proj-section">
```

and add a matching close: change the section's closing `</section>` (the one that ends the item-list section, right before the closing `</>` of the `contents ?` fragment) to:

```tsx
          </section>
          )}
```

Note: `linkFor(kind, id)` already accepts `ProjectItemKind` (`"conversation" | "report" | "watch"`). `onOpenItem` hands it `"chat" | "report" | "watch"` — map `"chat"` to `"conversation"`. Adjust the `onOpenItem` prop to:

```tsx
                onOpenItem={(kind, id) => router.push(linkFor(kind === "chat" ? "conversation" : kind, id))}
```

- [ ] **Step 5: Typecheck + build the whole web app**

Run: `cd apps/web && npm run build`
Expected: Compiles clean. Tab renders; opening Map triggers the lazy fetch.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/app/projects/\[id\]/page.tsx
git commit -m "feat(web): add lazy Map tab to the project workspace"
```

---

### Task 6: Verification + PR

**Files:**
- No new files — this task runs the gates and opens the PR.

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a green build, passing shared tests, a pushed `feat/research-map` branch, and an owner-facing PR.

- [ ] **Step 1: Run the shared unit tests**

Run: `deno test packages/shared/src/research-map.test.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 2: Confirm no frozen-layer or schema drift**

Run:
```bash
git diff --name-only origin/main...HEAD | grep -E "supabase/functions/ask/|supabase/migrations/" || echo "clean: no frozen-ask or migration changes"
```
Expected: `clean: no frozen-ask or migration changes`.

- [ ] **Step 3: Run the web build gate**

Run: `cd apps/web && npm run build`
Expected: `Compiled successfully` (Next build passes; no type errors).

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/research-map
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create \
  --base main \
  --head feat/research-map \
  --title "feat(web): project Research Map — Obsidian×ResearchRabbit graph (phase 2)" \
  --body "$(cat <<'EOF'
## What this adds (plain English)

Every project now has a new **Map** tab. It draws a connection graph of everything you've saved in that project — your chats, your Deep Research reports, and your monitoring watches — together with the papers they cite. It's the Obsidian "graph view" idea applied to your research: you can literally see when three different questions all lean on the same two studies, or when a retracted paper is quietly holding up several of your answers.

**How to read it:**
- Bigger paper dots = cited more often across the project.
- A thick line between two of your items = they share sources (the "aha" connection).
- A red double ring on a paper = it's been retracted (pulled from the enrichment trust cache).
- Tap a paper for its card (year, how many times it's been cited, support/contrast tallies, a link to open it). Tap one of your chats/reports to jump straight to it.

**"Explore related" (new):** tapping a paper card offers related papers — what it cites, what cites it, and similar work — pulled live from OpenAlex (a free, open scholarly database). Those show up as dashed "ghost" nodes so you can branch out from any source, ResearchRabbit-style. They're exploration-only: nothing about them is saved.

## How it's built (for reviewers)

- **No database or engine changes.** The graph is assembled entirely from data already stored with your saved items. The `/ask` safety engine is untouched.
- **Pure aggregation in `packages/shared`** (`buildResearchMap`, 11 Deno tests): dedupes sources by PMID (or URL), computes shared-source edges, caps at the top 60 sources with an honest "showing top N" label.
- **News stays walled out** of the graph (only evidence-channel watch events become nodes), matching the rest of the app.
- **Trust enrichment is quota-safe:** only the top 24 sources are decorated, reusing the existing batched `enrich-source` path.
- **"Explore related" is a new auth-gated Next.js route** (`/api/v1/graph/expand`) that proxies OpenAlex — same sign-in + rate-limit guard as the existing evidence-search route. The papers it returns are client-only ghost nodes, never persisted.
- **Graceful degradation:** if one item's history can't be read, it's skipped and counted, never blanking the whole map.

## Test plan
- [x] `deno test packages/shared/src/research-map.test.ts` — green
- [x] `npm run build` (web) — green
- [ ] Open a project with 2+ chats/reports that cite overlapping papers → Map shows a shared-source edge
- [ ] Tap a paper → card with cited-by/tallies; retracted paper shows the danger ring
- [ ] "Explore related" adds dashed ghost nodes; a signed-out call to the route is rejected
- [ ] A project with no cited sources shows the honest empty state

## Deploy note
`main` auto-deploys `app.pharmaorb.app`. **Owner-gated:** do not merge until the owner approves — merging ships it live.
EOF
)"
```
Expected: PR created; URL printed.

- [ ] **Step 6: Report to the owner and hold for merge approval**

Do NOT merge. Post the PR URL and a one-line plain-English summary; wait for the owner's explicit go-ahead (merging auto-deploys to `app.pharmaorb.app`).

---

## Self-Review

**1. Spec coverage** (`docs/design/research-map-spec.md`):
- "Where it lives — a Map view/tab at workspace/project level" → Task 5 (Map tab in `projects/[id]/page.tsx`). ✓
- Nodes: Questions (chats/report titles) + Sources → Tasks 1 (item + source nodes), 3 (render). Entities/NER node kind → **deferred** (declared in Scope note). ✓ (documented gap)
- Edges: question→source `cites`, source shared-between questions → Task 1 (`cites` + `shared` edges). question→entity / source→entity → **deferred** with entities. ✓ (documented gap)
- Visual grammar: node size = recurrence (Task 3 `nodeWeight` uses `refCount`), retracted danger ring (Task 3 `.retracted` double border), relation color from `claim_relation` (Task 1 carries `meta.claimRelation`, Task 3 styles `.supports/.partial/.conflicts/.mentions`), tap → open (Task 3 `onOpenItem` / source card). ✓
- "What we already have": adapt `EvidenceGraph.tsx` (Task 3, new file, original untouched); `pmidFromUrl` identity (Task 1); enrichment cache decoration (Task 3, top-24). ✓
- Build sketch: pure aggregation module deno-tested (Task 1); data fetch client-side, no new tables (Task 2); adapt EvidenceGraph → ResearchMapView (Task 3); empty-state honesty (Task 3). ✓
- Spec Non-goal "no OpenAlex citation-network expansion (v2)" → Task 4 is that v2 increment, brought forward and scoped client-only; reconciled in the Scope note. ✓
- Spec cap "top ~150 by degree" → this plan caps sources at 60 (a per-project scope is smaller than a whole-vault one; honest "showing top N" label preserved). Intentional tightening, documented. ✓

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step shows complete code. OpenAlex contract is verified live, not assumed. Task 3 Step 4 explicitly flags the Task-4-first ordering dependency rather than hand-waving it. ✓

**3. Type consistency** (grepped across tasks):
- `MapNode` / `MapEdge` / `ResearchMap` / `ResearchMapInput` / `ResearchMapItemCites` / `ResearchMapWatch` / `ResearchMapWatchEvent` — defined in Task 1, consumed verbatim in Tasks 2 (input assembly) and 3 (render). ✓
- `buildResearchMap(input: ResearchMapInput): ResearchMap` — Task 1 signature; Task 2 calls it with exactly that input. ✓
- `useResearchMapData(projectId, contents) → { map, loading, error, skipped, refresh }` — Task 2 produces; Task 5 consumes those exact keys and passes `map/loading/error/skipped` into `ResearchMapView`. ✓
- `ResearchMapViewProps { map, loading, error, skipped, onOpenItem }` — Task 3 defines; Task 5 supplies all five. `onOpenItem(kind, id)` where `kind: "chat" | "report" | "watch"` — Task 5 maps `"chat"→"conversation"` for `linkFor`. ✓
- `useEnrichmentByPmids(pmids: string[]) → Record<string, SourceEnrichment>` — Task 3 Step 1 defines in `enrichment.ts`; Task 3 view consumes it; keys are `pmid:N` matching source node ids. ✓
- `GraphExpand` / `GraphExpandWork` / `fetchGraphExpand(pmid)` — Task 4 defines in `api.ts`; Task 3 imports `fetchGraphExpand` + `GraphExpandWork`. Field names (`id`, `title`, `year`, `pmid`, and `work`/`cites`/`cited_by`/`similar`) match between the route payload (Task 4 route) and the client types (Task 4 api.ts) and the consumer (Task 3 `exploreRelated`). ✓
- `pmidFromUrl` used identically in Tasks 1, 3, 4 (from `@nemesis/shared`). ✓
- Cache key `map:{projectId}` — written in Task 2, read in Task 2 seed; not referenced elsewhere (ghosts never cached, per Task 4 guardrail). ✓

No inconsistencies found.
