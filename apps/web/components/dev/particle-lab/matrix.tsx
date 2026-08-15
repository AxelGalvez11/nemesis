"use client";

import { useState } from "react";

import { CANDIDATES } from "./candidates";
import { benchmark } from "./harness";
import { defaults } from "./types";

/**
 * The advisory comparison table.
 *
 * ADVISORY. It does not pick a winner and deliberately has no "overall" column,
 * because an overall score would be this file quietly choosing for the owner —
 * which is the one thing the brief rules out. Each column is one axis, judged
 * separately, and two of the five (Performance, Complexity) are measured rather
 * than opinions.
 */

type Rating = "excellent" | "good" | "acceptable" | "poor";

type Row = {
  readonly id: string;
  readonly visual: Rating;
  readonly loader: Rating;
  readonly landing: Rating;
  readonly complexity: Rating;
  /** Why the soft columns landed where they did. */
  readonly note: string;
};

/**
 * These are OPINIONS, formed by looking at the grid and the scale strip. They are
 * the columns you should expect to disagree with — that disagreement is the
 * reason the lab exists rather than a recommendation memo.
 *
 * Performance is deliberately NOT a hand-written rating here. Press "Measure
 * performance" and it gets filled in from an isolated timing run. The first draft
 * of this table DID guess it, and guessed wrong: H was marked the expensive one
 * because its shader is the heaviest per point, when in fact its low point count
 * makes it one of the cheapest overall.
 *
 * The Loader column was rewritten the same way. It originally claimed B and F
 * were "excellent" at 56px and C, D and H "poor". Rendered at 56px, all eight
 * filled in solid — identically. Tuned the way a real loader would be, all eight
 * became small grainy clusters, and the ONLY differences left were silhouette
 * and how evenly the dots sat. The ratings below reflect that, and no candidate
 * scores "excellent", because at 56px none of them show their technique at all.
 */
const ROWS: readonly Row[] = [
  {
    id: "A",
    visual: "excellent",
    loader: "good",
    landing: "excellent",
    complexity: "good",
    note: "Strongest reference match. Rows are legible while it is large and gone by loader size, where it reduces to a clean round cluster.",
  },
  {
    id: "B",
    visual: "good",
    loader: "good",
    landing: "good",
    complexity: "excellent",
    note: "Its character IS the silhouette, so shrinking costs it least. Also the least distinctive when large.",
  },
  {
    id: "C",
    visual: "acceptable",
    loader: "poor",
    landing: "good",
    complexity: "good",
    note: "The only one with no shell, so small it scatters rather than reading as an object at all.",
  },
  {
    id: "D",
    visual: "excellent",
    loader: "acceptable",
    landing: "excellent",
    complexity: "good",
    note: "The most computational-looking of the eight. Thinning for a loader punches holes in the contours.",
  },
  {
    id: "E",
    visual: "good",
    loader: "good",
    landing: "good",
    complexity: "good",
    note: "Motion survives shrinking better than most, because the wave moves the dots and not only the shape.",
  },
  {
    id: "F",
    visual: "good",
    loader: "good",
    landing: "acceptable",
    complexity: "good",
    note: "The only candidate using no noise at all. Its change is slow enough to need ~15s of watching.",
  },
  {
    id: "G",
    visual: "good",
    loader: "acceptable",
    landing: "excellent",
    complexity: "acceptable",
    note: "The only one whose density reorganises. Silhouette barely moves, which reads as calm.",
  },
  {
    id: "H",
    visual: "excellent",
    loader: "acceptable",
    landing: "excellent",
    complexity: "acceptable",
    note: "Closest to 'information reorganising itself'. Needed bounding to stop the flow destroying the shell.",
  },
];

/**
 * Rates a measured frame time against the real budget: one 60fps frame is
 * 16.7ms, and a candidate has to share that with the rest of the page.
 *
 * These thresholds are absolute rather than relative-to-the-fastest on purpose.
 * A relative scale would always produce a spread — it would rank a field of
 * eight equally cheap options as though some were problems, which is precisely
 * the kind of manufactured difference this table must not invent.
 */
function rateMs(ms: number): Rating {
  if (ms < 1) return "excellent";
  if (ms < 4) return "good";
  if (ms < 10) return "acceptable";
  return "poor";
}

export function Matrix() {
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);

  const measure = async () => {
    setRunning(true);
    const out: Record<string, number> = {};
    for (const c of CANDIDATES) {
      // Sequential, and yielding between candidates. Running them concurrently
      // would put them back on the same GPU queue and reproduce exactly the
      // cross-contamination this benchmark exists to avoid.
      out[c.id] = await benchmark(c, defaults(c));
      setMeasured({ ...out });
      await new Promise((r) => window.setTimeout(r, 30));
    }
    setRunning(false);
  };

  return (
    <section className="pl-matrix">
      <h2>Comparison matrix</h2>
      <p className="pl-matrix-intro">
        Advisory only — no overall score and no recommended winner. Visual, Loader and Landing fit are
        judgements you should feel free to overrule. Performance is blank until you measure it: each
        candidate is then rendered alone at a fixed size with the GPU forced to finish each frame, which
        is the only way these eight become comparable to each other.
      </p>
      <p className="pl-matrix-intro">
        One result worth knowing before you read the Loader column: at 48–64px, <b>none</b> of these
        show their technique. Left at their normal settings they all fill in solid; thinned the way a
        real loader would thin them, they all become small grainy clusters that differ only in
        silhouette. If the loader is the main use, choose on cost and simplicity. The technique only
        starts to matter at canvas size and above.
      </p>
      <p className="pl-matrix-actions">
        <button type="button" onClick={measure} disabled={running}>
          {running ? "Measuring…" : "Measure performance"}
        </button>
        <Verdict measured={measured} complete={!running && Object.keys(measured).length === CANDIDATES.length} />
      </p>
      <div className="pl-matrix-scroll">
        <table>
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Visual fit</th>
              <th>Loader fit</th>
              <th>Landing fit</th>
              <th>Performance (measured)</th>
              <th>Complexity</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const candidate = CANDIDATES.find((c) => c.id === row.id);
              return (
                <tr key={row.id}>
                  <th scope="row">
                    {row.id} — {candidate?.name}
                    {candidate?.reference ? <em> reference</em> : null}
                  </th>
                  <Cell v={row.visual} />
                  <Cell v={row.loader} />
                  <Cell v={row.landing} />
                  <td>
                    {measured[row.id] === undefined ? (
                      <span className="pl-unmeasured">not measured</span>
                    ) : (
                      <span className={`pl-rating pl-rating-${rateMs(measured[row.id] ?? 0)}`}>
                        {(measured[row.id] ?? 0).toFixed(2)} ms
                      </span>
                    )}
                  </td>
                  <Cell v={row.complexity} />
                  <td className="pl-matrix-note">{row.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * States the conclusion the numbers support, rather than leaving eight decimals
 * on screen for the reader to rank by eye. If every candidate is comfortably
 * inside a frame, the useful finding is "this column should not decide it" — and
 * saying so is more honest than a column of green ticks implying a close race.
 */
function Verdict({
  measured,
  complete,
}: {
  readonly measured: Record<string, number>;
  readonly complete: boolean;
}) {
  if (!complete) return null;

  const values = Object.values(measured);
  if (!values.length) return null;

  const fastest = Math.min(...values);
  const slowest = Math.max(...values);
  const budget = 16.7;
  const decisive = slowest > budget * 0.25;

  return (
    <span className="pl-verdict">
      {fastest.toFixed(2)}–{slowest.toFixed(2)} ms per frame, alone at 420px.{" "}
      {decisive
        ? "The slowest here takes a real bite out of a 16.7ms frame — worth weighing."
        : "All eight sit far inside a 16.7ms frame, so performance should not decide this — pick on how they look."}
    </span>
  );
}

function Cell({ v }: { readonly v: Rating }) {
  return (
    <td>
      <span className={`pl-rating pl-rating-${v}`}>{v}</span>
    </td>
  );
}
