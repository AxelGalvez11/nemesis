// eval/ci-gate.ts — run the harness IN-PROCESS, compare aggregate to the committed baseline
// with a tolerance band. In-process (not a nested `deno run` subprocess) so any failure throws
// a real, visible stack trace instead of an empty-stdout "Unexpected end of JSON input".
import { runRetrievalEval } from "./retrieval-eval.ts";

const TOLERANCE = 0.03; // absolute; aggregate may not drop more than this vs baseline
const baseline = JSON.parse(
  await Deno.readTextFile(new URL("./baselines/2026-06-08-retrieval-baseline.json", import.meta.url)),
);
const current = await runRetrievalEval();

let failed = false;
for (const key of Object.keys(baseline.aggregate)) {
  const base = baseline.aggregate[key] as number;
  const now = (current.aggregate[key] as number) ?? 0;
  const ok = now >= base - TOLERANCE;
  console.log(`${ok ? "✓" : "✗"} ${key}: baseline=${base.toFixed(4)} now=${now.toFixed(4)} (tol ${TOLERANCE})`);
  if (!ok) failed = true;
}
if (current.unanswerable_clean !== current.unanswerable_total) {
  console.log("✗ AC3: unanswerable probes returned matches");
  failed = true;
}
Deno.exit(failed ? 1 : 0);
