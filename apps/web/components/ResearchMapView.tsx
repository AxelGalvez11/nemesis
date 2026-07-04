"use client";
// The per-project Research Map: a cytoscape force graph over the project's items (chats/reports/
// watches) and the sources they cite. Adapted from EvidenceGraph.tsx's conventions (CSS-token theme,
// cose layout, tap-to-select) but driven by the workspace-spanning MapNode/MapEdge shape instead of a
// single answer. Item nodes link out to their page; source nodes open a side card and can fan out to
// OpenAlex "related papers" as CLIENT-ONLY ghost nodes (never persisted, never fed back to the
// aggregator). Only the top 24 source nodes are enrichment-decorated (respects the trust-cache quota).
import { useEffect, useMemo, useRef, useState } from "react";
import type { Core, ElementDefinition, NodeSingular } from "cytoscape";
import { pmidFromUrl, type MapNode, type ResearchMap } from "@pharmabro/shared";
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
