import { supabase } from "./supabase";
import type { ResearchReport } from "@nemesis/shared";

// Deep Research reports library (read-only on mobile), ported from apps/web/lib/api.ts. Reports are
// GENERATED on web (the Pro-gated research edge fn); mobile reads the saved deliverables. Both read the
// SAME owner-scoped saved_reports rows (kind='deep_research') via RLS — listing/opening a report is
// ungated; only generation is Pro-gated. Generating a new report from the phone is a deferred follow-up.

export interface ResearchReportSummary {
  id: string;
  title: string;
  created_at: string;
  citation_count: number;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** The caller's saved deep-research reports, newest first. */
export async function fetchResearchReports(): Promise<ResearchReportSummary[]> {
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id,title,created_at,citation_count")
    .eq("kind", "deep_research")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`research reports failed: ${error.message}`);
  return (data ?? [])
    .map((r) =>
      isObj(r) && typeof r.id === "string" && typeof r.title === "string"
        ? {
            id: r.id,
            title: r.title,
            created_at: typeof r.created_at === "string" ? r.created_at : "",
            citation_count: typeof r.citation_count === "number" ? r.citation_count : 0,
          }
        : null,
    )
    .filter((r): r is ResearchReportSummary => r !== null);
}

/** Read one saved report's full payload (the ResearchReport), or null. Owner-scoped by RLS. */
export async function fetchResearchReport(savedReportId: string): Promise<ResearchReport | null> {
  const { data, error } = await supabase
    .from("saved_reports")
    .select("payload")
    .eq("id", savedReportId)
    .eq("kind", "deep_research")
    .maybeSingle();
  if (error) throw new Error(`research report failed: ${error.message}`);
  return isObj(data) && isObj(data.payload) ? (data.payload as unknown as ResearchReport) : null;
}
