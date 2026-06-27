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
      color: "#f5f7f1",
      "text-outline-color": "#070807",
      "text-outline-width": 2,
      "background-color": "#394232",
      "border-color": "#748060",
      "border-width": 1,
      width: 34,
      height: 34,
    },
  },
  {
    selector: "node[kind = 'report']",
    style: {
      "background-color": "#a8ff3e",
      "border-color": "#d7ff8d",
      color: "#11160f",
      "text-outline-width": 0,
      width: 54,
      height: 54,
      "font-size": 12,
      "font-weight": 700,
    },
  },
  {
    selector: "node[kind = 'section']",
    style: {
      "background-color": "#25351f",
      "border-color": "#a8ff3e",
      width: 44,
      height: 44,
      "font-weight": 700,
    },
  },
  {
    selector: "node[kind = 'claim']",
    style: {
      "background-color": "#171a18",
      "border-color": "#485044",
      shape: "round-rectangle",
      width: 42,
      height: 30,
    },
  },
  {
    selector: "node[kind = 'source']",
    style: {
      "background-color": "#111310",
      "border-color": "#8ea672",
      shape: "hexagon",
      width: 38,
      height: 38,
      "font-size": 9,
    },
  },
  {
    selector: "node[evidenceRole = 'official_label']",
    style: { "border-color": "#a8ff3e", "border-width": 3 },
  },
  {
    selector: "node[evidenceRole = 'randomized_trial'], node[evidenceRole = 'systematic_review']",
    style: { "border-color": "#71e8ff", "border-width": 2 },
  },
  {
    selector: "node[active = 'true']",
    style: {
      "border-color": "#a8ff3e",
      "border-width": 4,
      "background-color": "#1f2b18",
    },
  },
  {
    selector: "node[kind = 'safety']",
    style: {
      "background-color": "#3a241b",
      "border-color": "#ffb36b",
      width: 44,
      height: 44,
    },
  },
  {
    selector: "node[kind = 'gap']",
    style: {
      "background-color": "#2a2930",
      "border-color": "#c6b5ff",
      width: 42,
      height: 42,
    },
  },
  {
    selector: "edge",
    style: {
      width: 1.4,
      "line-color": "#3f4838",
      "target-arrow-color": "#3f4838",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      opacity: 0.8,
    },
  },
  {
    selector: "edge[kind = 'cites']",
    style: {
      width: 1.8,
      "line-color": "#87c45a",
      "target-arrow-color": "#87c45a",
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
      "line-color": "#a8ff3e",
      "target-arrow-color": "#a8ff3e",
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
