"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { CitationStyle, ResearchReport } from "@pharmabro/shared";
import { fetchResearchReport } from "@/lib/api";
import { ResearchReportView } from "@/components/ResearchReportView";
import { WatchButton } from "@/components/WatchButton";

// A single saved report, opened from the Reports library (or, later, a chat's "Report ready" card).
// Reuses ResearchReportView verbatim — the same renderer the live run uses — so a saved report reads
// identically, with the Word/PowerPoint export and the Vancouver/AMA citation toggle.
export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const [report, setReport] = useState<ResearchReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [citeStyle, setCiteStyle] = useState<CitationStyle>("vancouver");

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    fetchResearchReport(id)
      .then((rep) => { if (!alive) return; if (rep) setReport(rep); else setErr("Report not found."); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load report."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  return (
    <div className="research-wrap">
      <div className="research-head">
        <Link className="chip-action" href="/app/reports">← All reports</Link>
        {/* Monitor this report's question for new evidence (saved-question watch). */}
        {report ? <WatchButton kind="saved_question" question={report.question} savedReportId={id} /> : null}
      </div>
      {loading ? <p className="muted" style={{ fontSize: 14 }}>Loading report…</p> : null}
      {err ? <p className="tmpl-note">{err}</p> : null}
      {report ? <ResearchReportView report={report} reportId={id} style={citeStyle} onStyleChange={setCiteStyle} /> : null}
    </div>
  );
}
