import type { CitationStyle } from "@pharmabro/shared";

export type ExportFormat = "docx" | "pptx";

export function detectRequestedExportFormats(text: string): ExportFormat[] {
  const q = text.toLowerCase();
  const formats: ExportFormat[] = [];
  if (/\b(word|docx|document|write-?up)\b/.test(q)) formats.push("docx");
  if (/\b(power\s*point|powerpoint|pptx?|slide\s*deck|slides?|deck)\b/.test(q)) formats.push("pptx");
  return formats;
}

export function reportExportHref(reportId: string, format: ExportFormat, style: CitationStyle = "vancouver"): string {
  return `/api/reports/${encodeURIComponent(reportId)}/export/${format}?style=${encodeURIComponent(style)}`;
}
