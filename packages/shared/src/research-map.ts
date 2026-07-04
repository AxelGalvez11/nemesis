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
