"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { CitationStyle, ResearchReport } from "@pharmabro/shared";
import { fetchResearchReport } from "@/lib/api";
import { ResearchPoster } from "@/components/ResearchPoster";
import { SkeletonRows } from "@/components/Skeleton";

// A real, printable conference poster generated FROM a saved Deep Research report — the live wiring
// of the ResearchPoster component (previously dev-preview only). The board is styled for 48×36
// landscape; "Print / Save as PDF" uses the browser's print (the @media print + @page rules in
// shell.css strip the app chrome and lock poster proportions), so the output is a real, cited,
// print-ready poster. A subtle Nemesis mark rides the footer — the wedge growth loop.
export default function PosterPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [style, setStyle] = useState<CitationStyle>("vancouver");

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
      <div className="research-head poster-toolbar">
        <Link className="chip-action" href={`/app/reports/${id}`}>← Back to report</Link>
        {report ? (
          <div className="poster-toolbar-actions">
            <div className="cite-style-toggle" role="group" aria-label="Citation style">
              <button type="button" className={style === "vancouver" ? "active" : ""} onClick={() => setStyle("vancouver")}>Vancouver</button>
              <button type="button" className={style === "ama" ? "active" : ""} onClick={() => setStyle("ama")}>AMA</button>
            </div>
            <button type="button" className="chip-action primary" onClick={() => window.print()}>
              Print / Save as PDF
            </button>
          </div>
        ) : null}
      </div>

      {loading ? <SkeletonRows count={4} label="Building your poster…" /> : null}
      {err ? <p className="tmpl-note">{err}</p> : null}
      {report ? (
        <div className="poster-preview-stage">
          <ResearchPoster report={report} style={style} />
        </div>
      ) : null}
    </div>
  );
}
