"use client";

// Why Nemesis read this file the way it did — Nemesis Lab §5.
//
// 🔴 THE QUESTION THE OWNER ASKED IS "WHY DID NEMESIS DECIDE THIS DOCUMENT WAS SAFE TO KEEP LOCAL?",
// and the honest answer is a value the parse already carries: `routeReason`. It exists precisely so
// a false pass can be attributed to the RULE that produced it rather than to "the parser". This
// panel prints it, plus everything else the parse measured, and invents nothing.
//
// 🔴 ABSENT IS PRINTED AS ABSENT. `skippedFigures: null` means no lane counted; it is shown as
// "nobody counted", never as 0. That distinction is the repo's most repeated defect in one field.

import type { ExtractionCoverage } from "@nemesis/shared";

import type { LabParseReport } from "@/lib/lab/report";

export function RoutingPane({ report }: { report: LabParseReport }) {
  const document = report.document;
  const coverage = document?.coverage ?? null;
  return (
    <div className="grid gap-3 border-b border-neutral-800 bg-neutral-900 p-3 text-xs md:grid-cols-2 lg:grid-cols-4">
      <Card title="Which parser ran">
        <Row label="Lane asked for" value={report.lane} />
        <Row label="Lane that ran" value={report.laneRan} tone={report.laneRan === "none" ? "warn" : undefined} />
        <Row
          label="Read by"
          value={document?.readBy ?? "Nemesis itself (the file's own text layer)"}
        />
        <Row label="Routing reason" value={document?.routeReason ?? "this format has no router — there was no decision to record"} />
        <Row label="Parser version" value={coverage?.parserVersion ?? "not stated"} />
        {report.laneNote ? <p className="mt-2 text-amber-400">{report.laneNote}</p> : null}
      </Card>

      <Card title="What it cost">
        <Row label="Time" value={`${(report.elapsedMs / 1000).toFixed(1)}s`} />
        <Row label="File" value={`${(report.fileBytes / 1024 / 1024).toFixed(2)} MB · ${report.kind ?? "unrecognised"}`} />
        <Row label="Looked at figures" value={report.lookedAtFigures ? "yes (vision ran)" : "no (off by default, as in production upload)"} />
        <Row
          label="Available here"
          value={[
            `paid PDF reader ${report.configured.mistral ? "configured" : "NOT configured"}`,
            `paid Office reader ${report.configured.llamaparse ? "configured" : "NOT configured"}`,
            `vision ${report.configured.vision ? "configured" : "NOT configured"}`,
          ].join(" · ")}
        />
      </Card>

      <Card title="What came out">
        <Row label="Units" value={`${coverage?.units ?? 0} ${coverage?.unitKind ?? "unit"}s`} />
        <Row label="Blocks" value={report.counts ? `${report.counts.blocks}` : "no structure"} />
        <Row label="Characters" value={`${document?.text.length ?? 0}`} />
        <Row label="Tables · cells" value={report.counts ? `${report.counts.tables} · ${report.counts.tableCells}` : "—"} />
        <Row label="Figures" value={report.counts ? `${report.counts.figures}` : "—"} />
        <Row label="Equations" value={report.counts ? `${report.counts.equations}` : "—"} />
      </Card>

      <Card title="What it could not recover">
        {coverage ? <CoverageGaps coverage={coverage} counts={report.counts} /> : <p className="text-neutral-500">No coverage was recorded.</p>}
        <Row
          label="Figures skipped"
          value={document?.skippedFigures === null ? "nobody counted" : `${document?.skippedFigures}`}
          tone={document?.skippedFigures === null ? "warn" : undefined}
        />
        {report.figuresWithheld > 0 ? (
          <p className="mt-1 text-neutral-500">
            {report.figuresWithheld} figure(s) were extracted but their pixels were too large to send to this
            page. They exist; they are not shown.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function CoverageGaps({ coverage, counts }: { coverage: ExtractionCoverage; counts: LabParseReport["counts"] }) {
  const read = coverage.unitsNative + coverage.unitsVision + coverage.unitsBoth;
  return (
    <>
      <Row
        label="State"
        value={coverage.state}
        tone={coverage.state === "complete" ? undefined : "warn"}
      />
      <Row label="Units read" value={`${read} of ${coverage.units} (${coverage.unitsUnread} not read at all)`} tone={coverage.unitsUnread > 0 ? "warn" : undefined} />
      <Row
        label="Pictures"
        value={`${coverage.figures.found} found · ${coverage.figures.described} described · ${coverage.figures.skipped} skipped`}
      />
      {Object.entries(coverage.figures.reasons).length > 0 ? (
        <Row label="Why skipped" value={Object.entries(coverage.figures.reasons).map(([reason, n]) => `${reason} ×${n}`).join(", ")} />
      ) : null}
      {counts && counts.figuresUnexamined > 0 ? (
        <Row label="Never looked at" value={`${counts.figuresUnexamined} picture(s), with no reason given`} tone="warn" />
      ) : null}
      {coverage.truncation.length > 0 ? (
        <Row
          label="Cut"
          value={coverage.truncation.map((cut) => `${cut.stage}: dropped ${cut.dropped}`).join(", ")}
          tone="warn"
        />
      ) : null}
      {(coverage.unreadableRegions ?? 0) > 0 ? (
        <Row label="Unreadable regions" value={`${coverage.unreadableRegions}`} tone="warn" />
      ) : null}
      {coverage.lostUnits?.length ? (
        <Row
          label="Units with loss"
          value={coverage.lostUnits.map((loss) => `${loss.unit + 1}${loss.unread ? " (nothing read)" : ` (${loss.unreadableRegions} region(s))`}`).join(", ")}
          tone="warn"
        />
      ) : null}
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <p className="flex gap-2 py-0.5 leading-snug">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className={tone === "warn" ? "text-amber-400" : "text-neutral-300"}>{value}</span>
    </p>
  );
}
