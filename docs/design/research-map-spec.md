# Research Map — workspace-level connection graph (spec)

**Status:** spec only — not scheduled. Owner-requested 2026-07-02 during the evidence-trust-layer build.
**Origin:** owner asked "where should the Obsidian map live?" Decision: the per-answer "Map" tab is the
year × strength scatter (shipped on `feat/evidence-trust-layer`); the Obsidian-style *connection* graph
lives one level up, across saved research — not inside a single answer.

## The idea in one line

Obsidian's graph is compelling because it spans the whole vault. Our "vault" is everything a user has
accumulated: saved chats, Deep Research reports, and Monitoring watches. The Research Map is one
force-directed graph over all of it, revealing structure no single answer can show — "these three
questions all lean on the same two trials," "this drug connects to that side-effect across four reports."

## Where it lives

- **Home:** the Projects/Library workspace (the owner-approved Projects spec: workspaces grouping
  chats + reports + watches). A "Research Map" view/tab at workspace level.
- **Secondary:** a scoped-down version inside a single Deep Research report (reports span enough
  sources to have real structure); NOT in ordinary chat answers.
- **Depends on:** the Projects feature (container + membership). Build order: Projects first.

## Nodes and edges

Nodes (three kinds):
1. **Questions** — saved chats / report titles (what the user asked)
2. **Entities** — drugs, conditions, outcomes (we already extract these: monitored entities,
   report topics; NER exists in the watch/browse pipeline)
3. **Sources** — papers/labels/trials, keyed by the same `pmid:N` / tag identity the trust layer uses

Edges:
- question —cites→ source (from stored AskResponse/report citations; they persist full payloads)
- question —about→ entity (existing entity extraction)
- source —about→ entity (cheap: MeSH terms already come back from PubMed fetches)
- source —shared-between→ questions (computed: same pmid in 2+ saved items — the "aha" edge)

Visual grammar (reuse trust-layer vocabulary):
- Node size = how often it recurs across the workspace
- Source node ring color = support/conflict (same relation colors as the old EvidenceGraph)
- RETRACTED sources get the danger ring — a retracted paper quietly underpinning four saved
  answers is exactly the insight this view exists to surface (trust-layer cache already knows)
- Click node → opens the chat/report/source card (same `onCite`/scroll pattern as today)

## What we already have (why this is cheap)

- **`EvidenceGraph.tsx` is the seed.** Deliberately kept on disk (unused) when the scatter replaced it:
  cytoscape force layout, relation-colored nodes/edges, family grouping, tap-to-open, CSS-token theming.
  It needs a data source spanning the workspace instead of one answer — the render layer mostly exists.
- Saved chats persist the full AskResponse (citations incl. tags/urls); reports persist `citations[]`.
- `pmidFromUrl`/`enrichmentKeyFor` (trust layer) give stable cross-item source identity.
- `source_enrichment` cache gives retraction/tally decoration for free.

## Build sketch (rough, for sizing — not a plan)

1. **Aggregation module** (`packages/shared`, pure, deno-tested): `buildResearchMap(items) →
   {nodes, edges}` where items = the workspace's saved chats/reports/watches payloads. Dedup sources by
   pmid-else-normalized-url; compute shared-source edges; cap graph size (e.g. top ~150 nodes by degree)
   with honest "showing top N" labeling — never silently truncate.
2. **Data fetch**: one RPC/page-load query pulling the workspace's items (RLS-scoped like existing
   chat-list queries. No new tables needed for v1 — aggregate client-side from stored payloads).
3. **View**: adapt EvidenceGraph into `ResearchMapView` (rename, new element builder, keep styling);
   mount as a workspace tab. Enrichment decoration lazy via existing `useEnrichment` batching.
4. **Empty-state honesty**: needs ≥ ~3 saved items with overlapping sources to be interesting; below
   that, show the "save more research" empty state instead of a sad two-node graph (mirrors the
   scatter's <3-datable-sources abstention).

Estimated effort: ~3–5 tasks in the same TDD/subagent process once Projects exists. No engine changes,
no frozen-layer contact, no new external services.

## Non-goals (v1)

- No citation-network expansion (papers citing papers via OpenAlex `referenced_works`) — that's a
  Litmaps-style *discovery* feature; v1 maps only what the user has saved. Possible v2.
- No graph persistence/layout saving; recompute per load.
- No mobile-specific interaction work beyond default pinch/pan cytoscape behavior.
