"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Citation } from "@nemesis/shared";
import { CLAIM_RELATION_LABEL, studyTypeLabel } from "@nemesis/shared";
import type { Core, ElementDefinition } from "cytoscape";
import { normTag } from "@/lib/cite";

function sourceFamily(t: string): string {
  const p = t.toLowerCase();
  if (p.includes("pubmed") || p.includes("europepmc") || p.includes("openalex")) return "PubMed";
  if (p.includes("trial") || p.includes("nct")) return "Trials";
  if (p.includes("openfda") || p.includes("dailymed") || p.includes("faers") || p.includes("fda_safety")) return "FDA";
  if (p.includes("medlineplus")) return "Guidance";
  return "Other";
}

function relationForCitation(c: Citation): NonNullable<Citation["claim_relation"]> | "reviewed" {
  if (c.claim_relation) return c.claim_relation;
  if (c.support_level === "direct") return "supports";
  if (c.support_level === "partial") return "partial";
  if (c.support_level === "weak" || c.support_level === "background") return "mentions";
  return "reviewed";
}

function familyId(family: string): string {
  return `family-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function citationTitle(c: Citation): string {
  return c.title || c.source_type || normTag(c.chunk_tag);
}

function trimTitle(title: string, max = 92): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function buildElements(citations: Citation[], reviewed: Citation[]): ElementDefinition[] {
  const elements: ElementDefinition[] = [{
    data: { id: "answer", label: "Answer", kind: "answer", weight: 58 },
    classes: "answer",
  }];
  const seenFamilies = new Set<string>();
  const seenSources = new Set<string>();
  const all = [
    ...citations.map((c, i) => ({ citation: c, cited: true, index: i })),
    ...reviewed.map((c, i) => ({ citation: c, cited: false, index: i })),
  ].slice(0, 36);

  for (const item of all) {
    const c = item.citation;
    const tag = normTag(c.chunk_tag);
    if (seenSources.has(tag)) continue;
    seenSources.add(tag);
    const family = sourceFamily(c.source_type);
    const fId = familyId(family);
    if (!seenFamilies.has(fId)) {
      seenFamilies.add(fId);
      elements.push({
        data: { id: fId, label: family, kind: "family", weight: 30 },
        classes: `family ${family.toLowerCase()}`,
      });
    }
    const relation = relationForCitation(c);
    const sourceId = `source-${tag}`;
    const studyType = studyTypeLabel(c);
    elements.push({
      data: {
        id: sourceId,
        label: tag,
        title: citationTitle(c),
        tag,
        kind: item.cited ? "source" : "reviewed",
        weight: item.cited ? Math.max(20, 34 - item.index * 1.4) : 13,
        relation,
        family,
        studyType,
      },
      classes: `${item.cited ? "source" : "reviewed"} ${relation}`,
    });
    elements.push({
      data: { id: `answer-${tag}`, source: "answer", target: sourceId, relation, weight: item.cited ? 4 : 1.4 },
      classes: `edge-${relation} ${item.cited ? "cited-edge" : "reviewed-edge"}`,
    });
    elements.push({
      data: { id: `family-${tag}`, source: sourceId, target: fId, relation: "family", weight: 0.8 },
      classes: "family-edge",
    });
  }
  return elements;
}

export function EvidenceGraph({ citations, reviewed, activeTag, onCite }: { citations: Citation[]; reviewed: Citation[]; activeTag?: string; onCite: (tag: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(activeTag ?? null);
  const elements = useMemo(() => buildElements(citations, reviewed), [citations, reviewed]);
  const sourceByTag = useMemo(() => {
    const m = new Map<string, Citation>();
    for (const c of [...citations, ...reviewed]) m.set(normTag(c.chunk_tag), c);
    return m;
  }, [citations, reviewed]);
  const selected = selectedTag ? sourceByTag.get(selectedTag) ?? null : null;

  useEffect(() => {
    if (activeTag) setSelectedTag(activeTag);
  }, [activeTag]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
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
      const acid = cssVar("--acid", "#ff2740");
      const info = cssVar("--info", "#7fb2ff");
      const warn = cssVar("--warn", "#f5b23b");
      const danger = cssVar("--danger", "#ff5c4d");
      cy = mod.default({
        container: el,
        elements,
        minZoom: 0.35,
        maxZoom: 2.4,
        wheelSensitivity: 0.18,
        style: [
          {
            selector: "node",
            style: {
              label: "data(label)",
              color: text2,
              "font-size": 9,
              "text-outline-color": surface,
              "text-outline-width": 2,
              "background-color": text3,
              "border-width": 1,
              "border-color": line,
              width: "data(weight)",
              height: "data(weight)",
            },
          },
          {
            selector: ".answer",
            style: {
              shape: "round-rectangle",
              "background-color": raised,
              "border-color": text,
              "border-width": 2,
              color: text,
              "font-weight": "bold",
              "font-size": 10,
            },
          },
          { selector: ".family", style: { shape: "round-rectangle", "background-color": surface, "border-color": line, color: text3, width: 52, height: 22 } },
          { selector: ".source", style: { "background-color": text2, "border-color": line } },
          { selector: ".reviewed", style: { "background-color": text3, opacity: 0.45, width: 12, height: 12 } },
          { selector: ".supports", style: { "border-color": acid, "border-width": 2 } },
          { selector: ".partial", style: { "border-color": info, "border-width": 2 } },
          { selector: ".conflicts", style: { "border-color": danger, "border-width": 2 } },
          { selector: ".mentions", style: { "border-color": warn } },
          {
            selector: "edge",
            style: {
              width: "data(weight)",
              "line-color": line,
              "target-arrow-shape": "triangle",
              "target-arrow-color": line,
              "curve-style": "bezier",
              opacity: 0.72,
            },
          },
          { selector: ".edge-supports", style: { "line-color": acid, "target-arrow-color": acid } },
          { selector: ".edge-partial", style: { "line-color": info, "target-arrow-color": info } },
          { selector: ".edge-conflicts", style: { "line-color": danger, "target-arrow-color": danger } },
          { selector: ".edge-mentions", style: { "line-color": warn, "target-arrow-color": warn, opacity: 0.55 } },
          { selector: ".reviewed-edge", style: { opacity: 0.26, "line-style": "dotted" } },
          { selector: ".family-edge", style: { opacity: 0.18, "target-arrow-shape": "none", width: 1 } },
          { selector: ".selected", style: { "background-color": text, "border-color": acid, "border-width": 3, color: text } },
        ],
        layout: {
          name: "cose",
          animate: false,
          randomize: true,
          fit: true,
          padding: 28,
          nodeRepulsion: 7400,
          idealEdgeLength: 78,
          edgeElasticity: 82,
          numIter: 900,
        },
      });
      cyRef.current = cy;
      cy.on("tap", "node.source, node.reviewed", (event) => {
        const tag = event.target.data("tag") as string | undefined;
        if (!tag) return;
        setSelectedTag(tag);
        onCite(tag);
      });
      if (selectedTag) {
        const n = cy.getElementById(`source-${selectedTag}`);
        if (n.length) n.addClass("selected");
      }
    })();
    return () => {
      destroyed = true;
      cy?.destroy();
      cyRef.current = null;
    };
  }, [elements, onCite, selectedTag]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("selected");
    if (selectedTag) cy.getElementById(`source-${selectedTag}`).addClass("selected");
  }, [selectedTag]);

  if (!elements.length) return <div className="ev-empty">Ask a question to build an evidence map.</div>;

  return (
    <div className="ev-map-panel">
      <div className="ev-map-legend" aria-label="Evidence map legend">
        <span><i className="legend-dot supports" />Supporting</span>
        <span><i className="legend-dot partial" />Partial</span>
        <span><i className="legend-dot conflicts" />Conflicting</span>
        <span><i className="legend-dot reviewed" />Reviewed</span>
      </div>
      <div className="ev-map-canvas" ref={containerRef} role="img" aria-label="Interactive evidence map" />
      <div className="ev-map-help">Drag nodes · scroll to zoom · tap a source to open its card</div>
      {selected ? (
        <div className="ev-map-selected">
          <span>{sourceFamily(selected.source_type)} · {CLAIM_RELATION_LABEL[relationForCitation(selected)] ?? "Reviewed"}</span>
          <b>{trimTitle(citationTitle(selected))}</b>
          {studyTypeLabel(selected) ? <small>{studyTypeLabel(selected)}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
