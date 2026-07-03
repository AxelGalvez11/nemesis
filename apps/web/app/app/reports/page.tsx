"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchResearchReports, type ResearchReportSummary } from "@/lib/api";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";
import { getCached, setCached } from "@/lib/cache";

// Report sub-types, for grouping the library "by kind". Headers only appear once there are 2+ types
// (a single-type library stays a clean flat list). "meta" and "structured_review" reports are BOTH
// products of the one user-facing Deep research tool (the pooled meta-analysis is folded into it),
// so they normalize into the "standard" group rather than confusing the library with three names.
const MODE_LABEL: Record<string, string> = {
  standard: "Deep research",
  discovery: "Discovery reports",
  lab_draft: "Lab drafts",
  other: "Other",
};
const MODE_ORDER = ["standard", "discovery", "lab_draft"];
const normalizeMode = (m: string | null | undefined): string =>
  !m || m === "meta" || m === "structured_review" ? "standard" : m;

// The Reports library: every deep-research / structured-review report the user has generated.
// Reports persist as their own saved_reports rows (kind='deep_research'); this lists them and links
// to the full report at /app/reports/[id], where they can be read, restyled, and exported.
export default function ReportsPage() {
  // Seed from the session cache so a return visit paints instantly (no skeleton), then revalidate.
  const [reports, setReports] = useState<ResearchReportSummary[] | null>(() => getCached<ResearchReportSummary[]>("reports") ?? null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchResearchReports()
      .then((r) => { if (alive) { setReports(r); setCached("reports", r); } })
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
      {reports === null && !err ? <SkeletonRows count={3} label="Loading your reports…" /> : null}

      {reports && reports.length === 0 ? (
        <p className="welcome-sub">No reports yet. Start one from <Link href="/app/ask">Ask</Link> — open the <b>+</b> menu and choose Deep research or Discovery.</p>
      ) : null}

      {reports && reports.length > 0 ? (
        <div className="research-history">
          {(() => {
            const known = new Set(MODE_ORDER);
            const groups = MODE_ORDER
              .map((m) => ({ mode: m, items: reports.filter((r) => normalizeMode(r.mode) === m) }))
              .filter((g) => g.items.length > 0);
            const others = reports.filter((r) => !known.has(normalizeMode(r.mode)));
            if (others.length) groups.push({ mode: "other", items: others });
            const showHeaders = groups.length > 1; // only group visually once there are 2+ kinds
            return groups.map((g) => (
              <div key={g.mode} className="report-group">
                {showHeaders ? <div className="report-group-h">{MODE_LABEL[g.mode] ?? "Other"}</div> : null}
                <div className="research-history-list">
                  {g.items.map((r) => (
                    <Link key={r.id} href={`/app/reports/${r.id}`} className="research-card" title={r.title}>
                      <Icon name="doc" size={15} />
                      <span className="research-card-title">{r.title}</span>
                      <small>{r.citation_count} sources</small>
                    </Link>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : null}
    </div>
  );
}
