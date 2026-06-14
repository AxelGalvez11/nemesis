"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchResearchReports, type ResearchReportSummary } from "@/lib/api";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";

// The Reports library: every deep-research / structured-review report the user has generated.
// Reports persist as their own saved_reports rows (kind='deep_research'); this lists them and links
// to the full report at /app/reports/[id], where they can be read, restyled, and exported.
export default function ReportsPage() {
  const [reports, setReports] = useState<ResearchReportSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchResearchReports()
      .then((r) => { if (alive) setReports(r); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load reports."); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Orb size={52} />
        <h2 className="welcome-title">Reports</h2>
        <p className="welcome-sub">Every deep-research report you&apos;ve generated. Open one to read it, switch citation styles, or export to Word or PowerPoint.</p>
      </div>

      {err ? <p className="tmpl-note">{err}</p> : null}
      {reports === null && !err ? <p className="muted" style={{ fontSize: 14 }}>Loading reports…</p> : null}

      {reports && reports.length === 0 ? (
        <p className="welcome-sub">No reports yet. Start one from <Link href="/app/ask">Ask</Link> — choose Deep research or Structured review.</p>
      ) : null}

      {reports && reports.length > 0 ? (
        <div className="research-history">
          <div className="research-history-list">
            {reports.map((r) => (
              <Link key={r.id} href={`/app/reports/${r.id}`} className="research-card" title={r.title}>
                <Icon name="doc" size={15} />
                <span className="research-card-title">{r.title}</span>
                <small>{r.citation_count} sources</small>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
