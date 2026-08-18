"use client";

// DEV-ONLY — the ladder, made visible for one concept at a time (§42).
//
// Ask for "aspirin" or "nephron" and see what the production router decided and why: what was
// needed, which candidates existed, what each one's provenance and licence were, which rung won,
// and the actual drawing.
//
// 🔴 IT RENDERS THE REAL COMPONENT, NOT A PREVIEW OF ONE. The structure below is drawn by
// `ChemicalStructure` — the same component `SemanticVisual` mounts on the Canvas — so what appears
// here is what a learner would see. A lab with its own renderer proves the lab works.
//
// The query string is read off `window` after mount rather than through `useSearchParams`,
// following the convention the other dev-preview surfaces set.

import { useCallback, useEffect, useState } from "react";

import { ChemicalStructure } from "@/components/workspace/learn/chemical-structure";

interface LadderReport {
  concept: string;
  need: string;
  labSpecValid: boolean;
  structure:
    | { ok: true; notation: "smiles"; provider: string; id: string; value: string; stereochemistry: boolean }
    | { ok: false; reason: string; detail: string };
  candidates: Array<{
    provenance: string;
    providerId: string;
    assetPath: string;
    caption?: string;
    author?: string;
    licence?: string;
    attribution?: string;
    url?: string;
    tags: string[];
    credit: string | null;
  }>;
  route: { decision: string; representation?: string; reason?: string; assetRefusal?: string; because: string };
  rendered:
    | { kind: "structure"; notation: "smiles"; value: string }
    | { kind: "image"; assetPath: string; credit: string | null; url?: string }
    | { kind: "none" };
}

/** The concepts the owner named, as one-click probes across very different rungs. */
const PROBES = ["aspirin", "nephron", "T-cell receptor signalling", "mitochondrion", "hemoglobin"];

export default function VisualLabPage() {
  const [concept, setConcept] = useState("aspirin");
  const [operation, setOperation] = useState<"explain" | "locate">("explain");
  const [report, setReport] = useState<LadderReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (asked: string, op: "explain" | "locate") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/visual-ladder", {
        body: JSON.stringify({ concept: asked, operation: op }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error ?? `${response.status}`);
        setReport(null);
        return;
      }
      setReport(payload as LadderReport);
    } catch (caught) {
      setError((caught as Error)?.message ?? "the request failed");
      setReport(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("concept");
    if (asked) {
      setConcept(asked);
      void run(asked, "explain");
    }
  }, [run]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-sm">
      <h1 className="text-xl font-semibold">Visual ladder</h1>
      <p className="mt-1 text-neutral-500">
        One concept, run down §42&rsquo;s rungs by the production router. Source figure → deterministic
        render → licensed reference image → generated illustration.
      </p>

      <form
        className="mt-6 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(concept, operation);
        }}
      >
        <input
          className="min-w-56 flex-1 rounded-lg border border-neutral-300 px-3 py-2"
          onChange={(event) => setConcept(event.target.value)}
          placeholder="aspirin"
          value={concept}
        />
        <select
          className="rounded-lg border border-neutral-300 px-3 py-2"
          onChange={(event) => setOperation(event.target.value as "explain" | "locate")}
          value={operation}
        >
          {/* The switch that makes a generated picture unreachable. Seeing it flip is half the point. */}
          <option value="explain">explain — nothing graded</option>
          <option value="locate">locate — graded against the picture</option>
        </select>
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-40" disabled={busy} type="submit">
          {busy ? "Running…" : "Run"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {PROBES.map((probe) => (
          <button
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs"
            key={probe}
            onClick={() => {
              setConcept(probe);
              void run(probe, operation);
            }}
            type="button"
          >
            {probe}
          </button>
        ))}
      </div>

      {error && <p className="mt-6 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}

      {report && (
        <div className="mt-8 space-y-6">
          <Section title="Requested visual need">
            <p>{report.need}</p>
          </Section>

          <Section title="Rung 2 — deterministic structure">
            {report.structure.ok ? (
              <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
                <dt className="text-neutral-500">resolver</dt>
                <dd>
                  {report.structure.provider} · id {report.structure.id}
                </dd>
                <dt className="text-neutral-500">notation</dt>
                <dd>{report.structure.notation}</dd>
                <dt className="text-neutral-500">canonical value</dt>
                <dd className="font-mono break-all">{report.structure.value}</dd>
                <dt className="text-neutral-500">stereochemistry</dt>
                <dd>{report.structure.stereochemistry ? "stated in the notation" : "none in this structure"}</dd>
              </dl>
            ) : (
              <p>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">{report.structure.reason}</span>{" "}
                {report.structure.detail}
              </p>
            )}
          </Section>

          <Section title={`Rungs 3 and 4 — candidates found (${report.candidates.length})`}>
            {report.candidates.length === 0 ? (
              <p className="text-neutral-500">Nothing offered for this concept.</p>
            ) : (
              <ul className="space-y-3">
                {report.candidates.map((candidate) => (
                  <li className="rounded-lg border border-neutral-200 p-3" key={`${candidate.providerId}-${candidate.assetPath}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">{candidate.provenance}</span>
                      <span className="text-neutral-500">{candidate.providerId}</span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">
                        {candidate.licence ?? "no licence recorded"}
                      </span>
                    </div>
                    {candidate.caption && <p className="mt-1">{candidate.caption}</p>}
                    <p className="mt-1 text-neutral-500">{candidate.credit ?? "no credit line — this asset cannot be shown"}</p>
                    {candidate.url && (
                      <a className="text-blue-700 underline" href={candidate.url} rel="noreferrer" target="_blank">
                        original
                      </a>
                    )}
                    {candidate.tags.length > 0 && <p className="mt-1 text-xs text-neutral-400">{candidate.tags.join(" · ")}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Selected rung, and why">
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-neutral-900 px-2 py-0.5 font-mono text-xs text-white">
                {report.route.decision === "render" ? report.route.representation : report.route.decision}
              </span>
              {report.route.reason && (
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">{report.route.reason}</span>
              )}
              {report.route.assetRefusal && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">{report.route.assetRefusal}</span>
              )}
            </p>
            <p className="mt-2 text-neutral-600">{report.route.because}</p>
          </Section>

          <Section title="What the learner would see">
            {report.rendered.kind === "structure" && (
              <ChemicalStructure
                visual={{
                  caption: `${report.concept} — drawn from its canonical structure`,
                  kind: "structure",
                  learningGoal: `Recognise the structure of ${report.concept}`,
                  notation: report.rendered.notation,
                  value: report.rendered.value,
                }}
              />
            )}
            {report.rendered.kind === "image" && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={report.concept} className="max-w-full rounded-lg" src={report.rendered.url ?? report.rendered.assetPath} />
                <figcaption className="mt-2 text-neutral-500">{report.rendered.credit}</figcaption>
              </figure>
            )}
            {report.rendered.kind === "none" && <p className="text-neutral-500">Prose. Nothing is drawn.</p>}
          </Section>

          {!report.labSpecValid && (
            <p className="rounded-lg bg-red-50 p-3 text-red-700">
              The lab built a request the production boundary would refuse. That is a bug in this
              surface, not in the router.
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      {children}
    </section>
  );
}
