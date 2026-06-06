import type { Citation, EvidenceGrade } from "./answer.ts";

export type ReportKind =
  | "evidence_brief"
  | "literature_overview"
  | "deep_research"
  | "slide_deck";

export type ReportDepth = "brief" | "deep";

export interface EvidenceBriefRequest {
  answer_id: string;
  depth?: ReportDepth;
}

export interface EvidenceBriefSection {
  title: string;
  bullets: string[];
}

export interface EvidenceBriefResponse {
  report_id: string;
  kind: "evidence_brief";
  depth: ReportDepth;
  status: "completed";
  title: string;
  summary: string;
  evidence_grade: EvidenceGrade;
  sections: EvidenceBriefSection[];
  citations: Citation[];
  source_count: number;
  generated_from_answer_id: string;
  export_formats: string[];
  created_at: string;
}
