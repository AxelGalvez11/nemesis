import type { AnswerPoint, Citation, ResearchReport } from "@pharmabro/shared";

export type EvidenceGraphNodeKind =
  | "report"
  | "section"
  | "claim"
  | "source"
  | "gap"
  | "safety";

export interface EvidenceGraphNode {
  id: string;
  label: string;
  kind: EvidenceGraphNodeKind;
  tag?: string;
  sourceType?: string;
  evidenceRole?: string;
  supportLevel?: string;
  evidenceWeight?: number;
}

export interface EvidenceGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "section" | "claim" | "cites";
}

export interface EvidenceGraphModel {
  nodes: EvidenceGraphNode[];
  edges: EvidenceGraphEdge[];
}

function normTag(id: string): string {
  return String(id).replace(/^\[/, "").replace(/\]$/, "").trim();
}

function compact(text: string | null | undefined, fallback: string, max = 96): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim() || fallback;
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

function sourceLabel(citation: Citation): string {
  const tag = normTag(citation.chunk_tag);
  const type = citation.source_type.toUpperCase().replace(/_/g, " ");
  return `${tag}. ${compact(citation.title, type, 76)}`;
}

function connectPoint(
  model: EvidenceGraphModel,
  point: AnswerPoint,
  parentId: string,
  pointId: string,
  fallbackLabel: string,
  citationsByTag: Map<string, Citation>,
  sourceIds: Set<string>,
): void {
  model.nodes.push({
    id: pointId,
    label: compact(point.text, fallbackLabel),
    kind: "claim",
  });
  model.edges.push({
    id: `${parentId}->${pointId}`,
    source: parentId,
    target: pointId,
    kind: "claim",
  });

  const seen = new Set<string>();
  for (const rawTag of point.citation_ids ?? []) {
    const tag = normTag(rawTag);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    const citation = citationsByTag.get(tag);
    if (!citation) continue;
    const sourceId = `source-${tag}`;
    sourceIds.add(sourceId);
    model.edges.push({
      id: `${pointId}->${sourceId}`,
      source: pointId,
      target: sourceId,
      kind: "cites",
    });
  }
}

export function buildEvidenceGraph(report: ResearchReport): EvidenceGraphModel {
  const model: EvidenceGraphModel = {
    nodes: [{
      id: "report",
      label: compact(report.question || report.summary, "Research report", 86),
      kind: "report",
    }],
    edges: [],
  };

  const citationsByTag = new Map<string, Citation>();
  for (const citation of report.citations) {
    const tag = normTag(citation.chunk_tag);
    if (!tag || citationsByTag.has(tag)) continue;
    citationsByTag.set(tag, citation);
  }

  const sourceIds = new Set<string>();
  report.sections.forEach((section, sectionIndex) => {
    const sectionId = `section-${sectionIndex}`;
    model.nodes.push({
      id: sectionId,
      label: compact(section.heading, `Section ${sectionIndex + 1}`, 70),
      kind: "section",
    });
    model.edges.push({
      id: `report->${sectionId}`,
      source: "report",
      target: sectionId,
      kind: "section",
    });
    section.points.forEach((point, pointIndex) => {
      connectPoint(
        model,
        point,
        sectionId,
        `claim-${sectionIndex}-${pointIndex}`,
        `Claim ${pointIndex + 1}`,
        citationsByTag,
        sourceIds,
      );
    });
  });

  if (report.safety_notes.length) {
    const safetyId = "safety";
    model.nodes.push({ id: safetyId, label: "Safety signals", kind: "safety" });
    model.edges.push({
      id: `report->${safetyId}`,
      source: "report",
      target: safetyId,
      kind: "section",
    });
    report.safety_notes.forEach((point, index) => {
      connectPoint(
        model,
        point,
        safetyId,
        `safety-claim-${index}`,
        `Safety note ${index + 1}`,
        citationsByTag,
        sourceIds,
      );
    });
  }

  if (report.uncertainties.length) {
    const gapId = "gaps";
    model.nodes.push({ id: gapId, label: "Evidence gaps", kind: "gap" });
    model.edges.push({
      id: `report->${gapId}`,
      source: "report",
      target: gapId,
      kind: "section",
    });
    report.uncertainties.forEach((point, index) => {
      connectPoint(
        model,
        point,
        gapId,
        `gap-claim-${index}`,
        `Gap ${index + 1}`,
        citationsByTag,
        sourceIds,
      );
    });
  }

  for (const [tag, citation] of citationsByTag) {
    const sourceId = `source-${tag}`;
    if (!sourceIds.has(sourceId)) continue;
    model.nodes.push({
      id: sourceId,
      label: sourceLabel(citation),
      kind: "source",
      tag,
      sourceType: citation.source_type,
      evidenceRole: citation.evidence_role,
      supportLevel: citation.support_level,
      evidenceWeight: citation.evidence_weight,
    });
  }

  return model;
}
