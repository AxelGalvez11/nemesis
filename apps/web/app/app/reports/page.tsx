"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchResearchReports, type ResearchReportSummary } from "@/lib/api";
import { displayReportTitle } from "@pharmabro/shared";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";
import { getCached, setCached } from "@/lib/cache";

// Report sub-types, for grouping the library "by kind". Headers only appear once there are 2+ types
// (a single-type library stays a clean flat list). "meta" and "structured_review" reports are BOTH
// products of the one user-facing Deep research tool, so they normalize into the "standard" group.
const MODE_LABEL: Record<string, string> = {
  standard: "Deep research",
  discovery: "Discovery reports",
  lab_draft: "Lab drafts",
  other: "Other",
};
const MODE_ORDER = ["standard", "discovery", "lab_draft"];
const normalizeMode = (m: string | null | undefined): string =>
  !m || m === "meta" || m === "structured_review" ? "standard" : m;

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The Reports Library: every deep-research / structured-review report the user has generated, grouped by
// kind, searchable once the list grows, with a "New report" shortcut back to Ask.
export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ResearchReportSummary[] | null>(() => getCached<ResearchReportSummary[]>("reports") ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetchResearchReports()
      .then((r) => { if (alive) { setReports(r); setCached("reports", r); } })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load reports."); });
    return () => { alive = false; };
  }, []);

  // Filter by cleaned title (search only appears once the library grows past 6).
  const filtered = useMemo(() => {
    if (!reports) return null;
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => displayReportTitle(r.title).toLowerCase().includes(q));
  }, [reports, query]);

  const showSearch = (reports?.length ?? 0) > 6;

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Orb size={52} />
        <h2 className="welcome-title">Library</h2>
        <p className="welcome-sub">Every deep-research report you’ve generated. Open one to read it, switch citation styles, or export to Word or PowerPoint.</p>
        <button type="button" className="mode watch-add-btn" style={{ marginTop: 6 }} onClick={() => router.push("/app/ask")}>
          <Icon name="plus" size={14} /> New report
        </button>
      </div>

      {showSearch ? (
        <div className="watch-add">
          <Icon name="search" size={16} />
          <input className="watch-add-input" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports…" aria-label="Search reports" />
        </div>
      ) : null}

      {err ? <p className="tmpl-note">{err}</p> : null}
      {reports === null && !err ? <SkeletonRows count={3} label="Loading your reports…" /> : null}

      {reports && reports.length === 0 ? (
        <p className="welcome-sub">No reports yet. Start one from <Link href="/app/ask">Ask</Link> — open the <b>+</b> menu and choose Deep research or Discovery.</p>
      ) : null}

      {filtered && reports && reports.length > 0 ? (
        <div className="research-history">
          {(() => {
            const known = new Set(MODE_ORDER);
            const groups = MODE_ORDER
              .map((m) => ({ mode: m, items: filtered.filter((r) => normalizeMode(r.mode) === m) }))
              .filter((g) => g.items.length > 0);
            const others = filtered.filter((r) => !known.has(normalizeMode(r.mode)));
            if (others.length) groups.push({ mode: "other", items: others });
            if (groups.length === 0) return <p className="welcome-sub">No reports match “{query}”.</p>;
            const showHeaders = groups.length > 1; // only group visually once there are 2+ kinds
            return groups.map((g) => (
              <div key={g.mode} className="report-group">
                {showHeaders ? <div className="report-group-h">{MODE_LABEL[g.mode] ?? "Other"}</div> : null}
                <div className="research-history-list">
                  {g.items.map((r) => (
                    <Link key={r.id} href={`/app/reports/${r.id}`} className="research-card" title={displayReportTitle(r.title)}>
                      <Icon name="doc" size={15} />
                      <span className="research-card-title">{displayReportTitle(r.title)}</span>
                      {!showHeaders ? <small style={{ color: "var(--text-3)" }}>{MODE_LABEL[g.mode] ?? "Other"}</small> : null}
                      {r.created_at ? <small>{shortDate(r.created_at)}</small> : null}
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
