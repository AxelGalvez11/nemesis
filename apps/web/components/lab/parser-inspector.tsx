"use client";

// Nemesis Lab — the parser inspector.
//
// ORIGINAL | EXTRACTED, page by page, over the REAL production parse. Everything on the right half
// came out of `parseDocument`; nothing on this page repairs, reorders or beautifies it.
//
// 🔴 THE PAID LANE NEVER RUNS BECAUSE THIS PAGE IS OPEN. Comparison is a button, pressed once, per
// file. That rule is in the route as well (`lane === "vendor"` is only ever set from a click), but
// it matters most here, where the temptation to "just fetch both so the diff is instant" lives.

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { compareParses, type ParseComparison } from "@/lib/lab/compare";
import type { LabLane, LabParseReport } from "@/lib/lab/report";
import { splitSlideContent, speakerNotesText } from "@/lib/lab/speaker-notes";
import { unitFlags, worthInspecting, type UnitFlags } from "@/lib/lab/unit-flags";

import { ExtractedPane } from "./extracted-pane";
import { FiguresPane } from "./figures-pane";
import { OriginalPane } from "./original-pane";
import { RoutingPane } from "./routing-pane";

type View = "pages" | "figures" | "comparison";

export function ParserInspector() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<LabParseReport | null>(null);
  const [against, setAgainst] = useState<LabParseReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState(0);
  const [view, setView] = useState<View>("pages");
  const [lookAtFigures, setLookAtFigures] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(
    async (chosen: File, lane: LabLane, into: "primary" | "against") => {
      setBusy(lane === "vendor" ? "Calling the paid parser…" : "Reading the file with the production parser…");
      setError(null);
      try {
        const body = new FormData();
        body.set("file", chosen);
        body.set("lane", lane);
        body.set("figures", lookAtFigures ? "look" : "skip");
        const response = await fetch("/api/dev/lab/parse", { body, method: "POST" });
        const json = (await response.json()) as LabParseReport | { error: string };
        if (!response.ok || "error" in json) {
          setError("error" in json ? json.error : `The parser route answered ${response.status}.`);
          return;
        }
        if (into === "primary") {
          setReport(json);
          setAgainst(null);
          setUnit(0);
          setView("pages");
        } else {
          setAgainst(json);
          setView("comparison");
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The parser route could not be reached.");
      } finally {
        setBusy(null);
      }
    },
    [lookAtFigures],
  );

  const accept = useCallback(
    (chosen: File | null | undefined) => {
      if (!chosen) return;
      setFile(chosen);
      void run(chosen, "production", "primary");
    },
    [run],
  );

  const model = report?.document?.model ?? null;
  const comparison: ParseComparison | null = useMemo(
    () => (against ? compareParses(model, against.document?.model ?? null, against.laneNote) : null),
    [against, model],
  );
  const disagreeing = useMemo(
    () => new Set((comparison?.disagreements ?? []).map((entry) => entry.unit)),
    [comparison],
  );
  const flags: UnitFlags[] = useMemo(
    () => (model ? unitFlags(model, report?.document?.coverage ?? null, disagreeing) : []),
    [disagreeing, model, report],
  );

  const slideSplit = useMemo(() => {
    if (!model || model.format !== "pptx") return null;
    return splitSlideContent(model.blocks.filter((block) => block.unit === unit));
  }, [model, unit]);

  const promote = useCallback(async () => {
    if (!file || !report) return;
    setPromoting(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/dev/lab/source", { body, method: "POST" });
      const json = (await response.json()) as { sourceId?: string; error?: string };
      if (!response.ok || !json.sourceId) {
        setError(json.error ?? `Could not open this source in the Tutor Lab (${response.status}).`);
        return;
      }
      router.push(`/dev/lab/tutor?source=${json.sourceId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the Tutor Lab.");
    } finally {
      setPromoting(false);
    }
  }, [file, report, router]);

  return (
    <main className="flex min-h-[calc(100vh-45px)] flex-col">
      <div
        className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-3"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          accept(event.dataTransfer.files?.[0]);
        }}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded border border-neutral-600 px-3 py-1.5 text-sm hover:border-neutral-400"
        >
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => accept(event.target.files?.[0])}
        />
        <span className="text-xs text-neutral-500">or drop one here — PDF, PowerPoint, Word, Excel, CSV, text, image</span>
        <label className="ml-auto flex items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={lookAtFigures}
            onChange={(event) => setLookAtFigures(event.target.checked)}
          />
          Look at pictures with vision (costs money, off in production uploads)
        </label>
        {file ? (
          <button
            type="button"
            onClick={() => accept(file)}
            className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
          >
            Re-read
          </button>
        ) : null}
      </div>

      {busy ? <p className="px-4 py-2 text-sm text-neutral-400">{busy}</p> : null}
      {error ? <p className="px-4 py-2 text-sm text-red-400">{error}</p> : null}

      {report ? (
        <>
          <RoutingPane report={report} />

          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-4 py-2 text-xs">
            {(["pages", "figures", "comparison"] as const).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setView(name)}
                className={`rounded px-2 py-1 capitalize ${view === name ? "bg-neutral-700" : "text-neutral-400 hover:text-neutral-100"}`}
              >
                {name}
              </button>
            ))}
            <span className="mx-2 text-neutral-700">|</span>
            <span className="text-neutral-500">Compare against:</span>
            {(["native", "vendor"] as const).map((lane) => (
              <button
                key={lane}
                type="button"
                disabled={!file || busy !== null}
                onClick={() => file && void run(file, lane, "against")}
                className="rounded border border-neutral-700 px-2 py-1 hover:border-neutral-500 disabled:opacity-40"
                title={
                  lane === "vendor"
                    ? "Calls the paid parser. This is the only thing on this page that spends money, and only when you press it."
                    : "Re-reads the file with the vendor forbidden — what Nemesis can do on its own."
                }
              >
                {lane === "native" ? "Native only" : "Paid reference ($)"}
              </button>
            ))}
            <button
              type="button"
              disabled={!report.document || promoting}
              onClick={() => void promote()}
              className="ml-auto rounded border border-emerald-700 px-3 py-1 text-emerald-300 hover:border-emerald-500 disabled:opacity-40"
              title="Saves THIS parse as a lab source and opens it in the Tutor Lab. This is the only step that writes anything."
            >
              {promoting ? "Opening…" : "Open in Tutor Lab →"}
            </button>
            <SaveCase file={file} report={report} comparison={comparison} unit={unit} />
          </div>

          {view === "pages" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <UnitStrip flags={flags} unit={unit} onPick={setUnit} />
              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
                <section className="min-h-0 overflow-auto border-r border-neutral-800">
                  <Header>Original</Header>
                  <OriginalPane file={file} unit={unit} />
                </section>
                <section className="flex min-h-0 flex-col overflow-hidden">
                  <Header>Extracted</Header>
                  {slideSplit ? (
                    <SpeakerNotes split={slideSplit} />
                  ) : null}
                  <ExtractedPane
                    model={model}
                    unit={unit}
                    unitText={report.unitText}
                    figures={report.figures}
                    fallbackText={report.document?.text ?? ""}
                  />
                </section>
              </div>
            </div>
          ) : null}

          {view === "figures" ? (
            <FiguresPane
              model={model}
              figures={report.figures}
              onJump={(target) => {
                setUnit(target);
                setView("pages");
              }}
            />
          ) : null}

          {view === "comparison" ? (
            <ComparisonView comparison={comparison} against={against} onJump={(target) => { setUnit(target); setView("pages"); }} />
          ) : null}
        </>
      ) : (
        <div className="p-8 text-sm text-neutral-500">
          Drop a real lecture in. Nothing is saved, nothing reaches your Library, and no paid parser is
          called until you ask for one.
        </div>
      )}
    </main>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-neutral-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
      {children}
    </p>
  );
}

/** The page/slide picker — §7. Marked units are the ones worth looking at first. */
function UnitStrip({ flags, unit, onPick }: { flags: readonly UnitFlags[]; unit: number; onPick: (unit: number) => void }) {
  const flagged = flags.filter(worthInspecting).length;
  return (
    <div className="border-b border-neutral-800 px-3 py-2">
      <p className="mb-1 text-[11px] text-neutral-500">
        {flags.length} unit(s) · {flagged} worth inspecting (table, picture, equation, lost text, or a
        disagreement)
      </p>
      <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
        {flags.map((entry) => (
          <button
            key={entry.unit}
            type="button"
            onClick={() => onPick(entry.unit)}
            title={describe(entry)}
            className={`rounded border px-1.5 py-0.5 text-[11px] ${
              entry.unit === unit ? "border-neutral-300 bg-neutral-700" : "border-neutral-800 hover:border-neutral-600"
            } ${entry.unread || entry.unexaminedFigure ? "text-red-400" : entry.disagreement ? "text-fuchsia-400" : worthInspecting(entry) ? "text-amber-400" : "text-neutral-400"}`}
          >
            {entry.unit + 1}
            <span className="ml-1 text-[9px]">
              {entry.table ? "▦" : ""}
              {entry.figure ? "▣" : ""}
              {entry.equation ? "∑" : ""}
              {entry.note ? "✎" : ""}
              {entry.unread ? "!" : ""}
              {entry.disagreement ? "≠" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function describe(entry: UnitFlags): string {
  const parts = [`${entry.kind} ${entry.unit + 1}`, `${entry.blocks} blocks`, `${entry.characters} chars`];
  if (entry.label) parts.push(`"${entry.label}"`);
  if (entry.table) parts.push("table");
  if (entry.figure) parts.push("picture");
  if (entry.equation) parts.push("equation");
  if (entry.note) parts.push("note");
  if (entry.unexaminedFigure) parts.push("a picture nobody looked at");
  if (entry.unread) parts.push("NOTHING was read off this unit");
  if (entry.unreadableRegions) parts.push(`${entry.unreadableRegions} unreadable region(s)`);
  if (entry.disagreement) parts.push("the two lanes disagree");
  return parts.join(" · ");
}

function SpeakerNotes({ split }: { split: ReturnType<typeof splitSlideContent> }) {
  return (
    <div className="border-b border-neutral-800 bg-neutral-950 px-3 py-2 text-xs">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Speaker notes</p>
      {split.recovered ? (
        <p className="mt-1 whitespace-pre-wrap text-sky-300">{speakerNotesText(split.notes)}</p>
      ) : (
        <p className="mt-1 text-neutral-500">
          None recovered for this slide. That means either the slide has none or the reader found none — the
          parse does not distinguish them.
        </p>
      )}
      <p className="mt-1 text-[10px] text-neutral-600">
        Recovered from the parser&apos;s own <code>[Speaker notes: …]</code> marker in the slide text. Nemesis does
        not model notes as a separate block kind.
      </p>
    </div>
  );
}

function ComparisonView({
  comparison,
  against,
  onJump,
}: {
  comparison: ParseComparison | null;
  against: LabParseReport | null;
  onJump: (unit: number) => void;
}) {
  if (!comparison || !against) {
    return <p className="p-4 text-sm text-neutral-500">Press “Native only” or “Paid reference” above to compare two readings of this file.</p>;
  }
  if (!comparison.ran) {
    return (
      <div className="p-4 text-sm">
        <p className="text-amber-400">This comparison did not happen.</p>
        <p className="mt-1 text-neutral-400">{comparison.note}</p>
        <p className="mt-2 text-neutral-500">
          An empty difference list here would look exactly like two parsers agreeing. They did not agree;
          one of them never ran.
        </p>
      </div>
    );
  }
  return (
    <div className="p-4 text-sm">
      <p className="text-neutral-400">
        Production lane vs {against.lane === "vendor" ? "the paid parser" : "native only"} — {comparison.unitsA} vs{" "}
        {comparison.unitsB} units, {comparison.agreedUnits} agreed, {comparison.disagreements.length} disagree.
      </p>
      {comparison.note ? <p className="mt-1 text-amber-400">{comparison.note}</p> : null}
      <div className="mt-3 space-y-2">
        {comparison.disagreements.map((entry) => (
          <div key={entry.unit} className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs">
            <button type="button" onClick={() => onJump(entry.unit)} className="text-neutral-300 underline">
              Unit {entry.unit + 1}
            </button>
            <table className="mt-1 text-[11px]">
              <tbody>
                {entry.differences.map((difference) => (
                  <tr key={difference.aspect}>
                    <td className="pr-3 text-neutral-500">{difference.aspect}</td>
                    <td className="pr-3 text-neutral-300">{difference.a}</td>
                    <td className="text-fuchsia-300">{difference.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {comparison.disagreements.length === 0 ? (
          <p className="text-neutral-400">The two lanes produced the same structure on every shared unit.</p>
        ) : null}
      </div>
    </div>
  );
}

/** Save this parse as a regression case — §14. Defined here because it needs the file bytes. */
function SaveCase({
  file,
  report,
  comparison,
  unit,
}: {
  file: File | null;
  report: LabParseReport;
  comparison: ParseComparison | null;
  unit: number;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <button
      type="button"
      disabled={!file || saving}
      onClick={async () => {
        if (!file) return;
        const note = window.prompt(
          "What is wrong with this parse? (for example: page 4 has a 6-column table and Nemesis flattened it)",
        );
        if (!note) return;
        setSaving(true);
        try {
          const body = new FormData();
          body.set("file", file);
          body.set("kind", "parser");
          body.set("note", note);
          body.set("unit", String(unit));
          body.set("report", JSON.stringify({ ...report, document: report.document ? { ...report.document, model: null } : null, figures: [] }));
          body.set("counts", JSON.stringify(report.counts ?? {}));
          body.set("comparison", JSON.stringify(comparison ?? null));
          const response = await fetch("/api/dev/lab/cases", { body, method: "POST" });
          const json = (await response.json()) as { id?: string; error?: string };
          setSaved(json.id ? `Saved as ${json.id}` : (json.error ?? "Could not save"));
        } finally {
          setSaving(false);
        }
      }}
      className="rounded border border-neutral-700 px-2 py-1 hover:border-neutral-500 disabled:opacity-40"
      title="Save this file and this parse as a regression case, so it can be rerun after a change."
    >
      {saving ? "Saving…" : saved ?? "Save as regression"}
    </button>
  );
}
