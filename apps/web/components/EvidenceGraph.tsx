"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Core, ElementDefinition, StylesheetJson } from "cytoscape";
import type { ResearchReport } from "@pharmabro/shared";
import { buildEvidenceGraph, type EvidenceGraphModel } from "@/lib/evidence-graph";

interface EvidenceGraphProps {
  report: ResearchReport;
  onCite: (tag: string) => void;
}

interface EvidenceGraphCanvasProps {
  model: EvidenceGraphModel;
  onCite: (tag: string) => void;
  title?: string;
  subtitle?: string;
  hint?: string;
  rootLabel?: string;
  activeTag?: string;
  compact?: boolean;
}

const GRAPH_STYLE: StylesheetJson = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
      "font-size": 10,
      "text-wrap": "wrap",
      "text-max-width": "118px",
      color: "#d4d4d4",
      "text-outline-color": "#202020",
      "text-outline-width": 2,
      "background-color": "#8e8e8e",
      "border-color": "#b8b8b8",
      "border-width": 1,
      width: 22,
      height: 22,
    },
  },
  {
    selector: "node[kind = 'report']",
    style: {
      "background-color": "#d8d8d8",
      "border-color": "#f1f1f1",
      color: "#f5f5f5",
      "text-outline-color": "#202020",
      "text-outline-width": 2,
      width: 42,
      height: 42,
      "font-size": 12,
      "font-weight": 700,
    },
  },
  {
    selector: "node[kind = 'section']",
    style: {
      "background-color": "#666666",
      "border-color": "#a6a6a6",
      width: 32,
      height: 32,
      "font-weight": 700,
    },
  },
  {
    selector: "node[kind = 'claim']",
    style: {
      "background-color": "#343434",
      "border-color": "#686868",
      shape: "round-rectangle",
      width: 34,
      height: 24,
    },
  },
  {
    selector: "node[kind = 'source']",
    style: {
      "background-color": "#b6b6b6",
      "border-color": "#d0d0d0",
      shape: "ellipse",
      width: 18,
      height: 18,
      "font-size": 9,
    },
  },
  {
    selector: "node[evidenceRole = 'official_label']",
    style: { "border-color": "#f2f2f2", "border-width": 2, width: 24, height: 24 },
  },
  {
    selector: "node[evidenceRole = 'randomized_trial'], node[evidenceRole = 'systematic_review']",
    style: { "border-color": "#c7c7c7", "border-width": 2, width: 24, height: 24 },
  },
  {
    selector: "node[active = 'true']",
    style: {
      "border-color": "#ffffff",
      "border-width": 4,
      "background-color": "#f3f3f3",
    },
  },
  {
    selector: "node[kind = 'safety']",
    style: {
      "background-color": "#5c5147",
      "border-color": "#c9a678",
      width: 32,
      height: 32,
    },
  },
  {
    selector: "node[kind = 'gap']",
    style: {
      "background-color": "#4c4a54",
      "border-color": "#b5adc6",
      width: 30,
      height: 30,
    },
  },
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "#525252",
      "target-arrow-color": "#525252",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      opacity: 0.54,
    },
  },
  {
    selector: "edge[kind = 'cites']",
    style: {
      width: 1.25,
      "line-color": "#9a9a9a",
      "target-arrow-color": "#9a9a9a",
      opacity: 0.7,
    },
  },
  {
    selector: "edge[kind = 'reviewed']",
    style: {
      width: 1,
      "line-color": "#5b6157",
      "target-arrow-color": "#5b6157",
      "line-style": "dashed",
      opacity: 0.55,
    },
  },
  {
    selector: ".faded",
    style: { opacity: 0.16 },
  },
  {
    selector: ".highlighted",
    style: {
      opacity: 1,
      "border-width": 3,
      "line-color": "#e0e0e0",
      "target-arrow-color": "#e0e0e0",
    },
  },
];

function normTag(id: string | undefined): string {
  return String(id ?? "").replace(/^\[/, "").replace(/\]$/, "").trim();
}

export function EvidenceGraphCanvas({
  model,
  onCite,
  title = "Evidence map",
  subtitle = "Claims, source support, and evidence gaps as a draggable network.",
  hint = "Drag · zoom · tap source",
  rootLabel = "Report",
  activeTag,
  compact = false,
}: EvidenceGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const active = normTag(activeTag);

  const elements = useMemo<ElementDefinition[]>(() => [
    ...model.nodes.map((node) => ({
      data: {
        ...node,
        active: node.tag && active && normTag(node.tag) === active ? "true" : "false",
      },
    })),
    ...model.edges.map((edge) => ({ data: edge })),
  ], [active, model]);

  useEffect(() => {
    if (!containerRef.current || elements.length < 3) return;
    let cancelled = false;

    void import("cytoscape")
      .then((mod) => {
        if (cancelled || !containerRef.current) return;
        const cytoscape = mod.default ?? mod;
        cyRef.current?.destroy();
        const cy = cytoscape({
          container: containerRef.current,
          elements,
          style: GRAPH_STYLE,
          minZoom: 0.35,
          maxZoom: 2.4,
          layout: {
            name: "cose",
            animate: true,
            animationDuration: 450,
            fit: true,
            padding: 28,
            idealEdgeLength: 92,
            nodeRepulsion: 5200,
            gravity: 0.22,
            numIter: 900,
          },
        });

        cy.on("mouseover", "node", (event) => {
          const node = event.target;
          const neighborhood = node.closedNeighborhood();
          cy.elements().addClass("faded").removeClass("highlighted");
          neighborhood.removeClass("faded").addClass("highlighted");
        });
        cy.on("mouseout", "node", () => {
          cy.elements().removeClass("faded highlighted");
        });
        cy.on("tap", "node[kind = 'source']", (event) => {
          const tag = String(event.target.data("tag") ?? "");
          if (tag) onCite(tag);
        });

        cyRef.current = cy;
        setStatus("ready");
      })
      .catch(() => setStatus("error"));

    return () => {
      cancelled = true;
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [elements, onCite]);

  if (model.nodes.length < 3) return null;

  return (
    <section className={`research-section evidence-graph${compact ? " compact" : ""}`}>
      <div className="evidence-graph-head">
        <div>
          <h4 className="research-heading">{title}</h4>
          <p className="muted-note">{subtitle}</p>
        </div>
        <div className="evidence-graph-hint">{hint}</div>
      </div>
      <div className="evidence-graph-canvas" ref={containerRef} aria-label="Evidence map">
        {status === "loading" ? <span>Mapping evidence...</span> : null}
        {status === "error" ? <span>Evidence map unavailable.</span> : null}
      </div>
      <div className="evidence-graph-legend" aria-label="Evidence map legend">
        <span><i className="legend-report" />{rootLabel}</span>
        <span><i className="legend-claim" />Claim</span>
        <span><i className="legend-source" />Source</span>
        <span><i className="legend-label" />Official label</span>
        <span><i className="legend-trial" />Trial/review</span>
      </div>
    </section>
  );
}

export function EvidenceGraph({ report, onCite }: EvidenceGraphProps) {
  const graph = useMemo(() => buildEvidenceGraph(report), [report]);
  return <EvidenceGraphCanvas model={graph} onCite={onCite} />;
}
