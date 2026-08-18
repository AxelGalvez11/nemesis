/**
 * Run every saved Nemesis Lab parser case, from the command line.
 *
 * 🔴 THIS IS THE §17 HALF OF THE LAB: localhost is the FIRST verification layer, not the last. A
 * corpus that can only be exercised by a person clicking through a page cannot run before a merge,
 * so the same cases the owner saves by hand are runnable here, exit code and all.
 *
 * 🔴 IT REPORTS DRIFT AND FAILS ONLY ON DRIFT. A case is saved because the behaviour was WRONG, so
 * the recorded observation is a BASELINE, never an expectation — see lib/lab/replay.ts. `--strict`
 * turns any drift into a non-zero exit, which is what a merge gate wants; the default prints and
 * exits 0, which is what a person running it mid-change wants.
 *
 * 🔴 TEACHING CASES ARE SKIPPED HERE, LOUDLY. A teaching turn needs a real learner session to reach
 * the metered model door and to satisfy row-level security, so it reruns in the browser on the
 * Replays page. Counting a skipped case as a pass is exactly the silent-coverage failure this repo
 * has paid for; they are listed as SKIPPED with the reason.
 *
 * Usage, from apps/web:
 *
 *     ../../node_modules/.bin/tsx scripts/lab-replay.ts
 *     ../../node_modules/.bin/tsx scripts/lab-replay.ts --strict
 */

import { countDocument } from "@nemesis/shared";

import { listCases, readCaseFile } from "@/lib/lab/cases";
import { driftBetween, parserFacts } from "@/lib/lab/replay";
import { parseDocument } from "@/lib/notebooks/parse-document";

const strict = process.argv.includes("--strict");

async function main(): Promise<void> {
  const cases = listCases();
  if (cases.length === 0) {
    console.log("No saved cases. Save one from the Lab's Parser or Tutor tab first.");
    return;
  }

  let drifted = 0;
  let skipped = 0;
  let ran = 0;

  for (const entry of cases) {
    if (entry.kind !== "parser") {
      skipped += 1;
      console.log(`SKIP  ${entry.id}\n      ${entry.note}\n      a teaching case reruns in the browser, as the Lab learner`);
      continue;
    }
    const bytes = readCaseFile(entry);
    if (!bytes) {
      skipped += 1;
      console.log(`SKIP  ${entry.id}\n      the file saved with this case is missing, so nothing was reparsed`);
      continue;
    }

    const observed = entry.observed as {
      counts?: Record<string, unknown> | null;
      report?: {
        lane?: string;
        lookedAtFigures?: boolean;
        document?: { coverage?: { state?: string }; readBy?: string | null; routeReason?: string | null; text?: string } | null;
        outcome?: { ok?: boolean; reason?: string };
      } | null;
    };

    const outcome = await parseDocument(bytes.slice(), entry.file!.name, entry.file!.type, {
      lookAtFigures: observed.report?.lookedAtFigures === true,
      vendorAllowed: observed.report?.lane !== "native",
    });
    const parsed = outcome.ok || outcome.reason === "no-text" ? outcome.document : null;
    const model = parsed?.model ?? null;

    const before = parserFacts({
      characters: typeof observed.report?.document?.text === "string" ? observed.report.document.text.length : null,
      counts: observed.counts ?? null,
      coverageState: observed.report?.document?.coverage?.state ?? null,
      outcome: observed.report?.outcome?.ok ? "ok" : (observed.report?.outcome?.reason ?? "unknown"),
      readBy: observed.report?.document?.readBy ?? null,
      routeReason: observed.report?.document?.routeReason ?? null,
    });
    const after = parserFacts({
      characters: parsed?.text.length ?? null,
      counts: model ? (countDocument(model) as unknown as Record<string, unknown>) : null,
      coverageState: parsed?.coverage.state ?? null,
      outcome: outcome.ok ? "ok" : outcome.reason,
      readBy: parsed?.readBy ?? null,
      routeReason: parsed?.routeReason ?? null,
    });

    const drift = driftBetween(before, after);
    ran += 1;
    if (drift.length === 0) {
      console.log(`SAME  ${entry.id}\n      ${entry.note}`);
      continue;
    }
    drifted += 1;
    console.log(`DRIFT ${entry.id}\n      ${entry.note}`);
    for (const change of drift) {
      console.log(`        ${change.field}: ${change.before}  ->  ${change.after}`);
    }
  }

  console.log(`\n${ran} rerun, ${drifted} drifted, ${skipped} skipped (not run, and not counted as unchanged).`);
  if (strict && drifted > 0) process.exitCode = 1;
}

// 🔴 NOT TOP-LEVEL AWAIT. tsx transforms a `.ts` file to CJS, which refuses it — and the file must
// stay `.ts` rather than `.mts`, because every acceptance script here does: under `.mts` resolution
// the learn modules' circular imports come back undefined.
void main().catch((cause: unknown) => {
  console.error(cause);
  process.exitCode = 1;
});
