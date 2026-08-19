/**
 * Run a saved parser case again — Nemesis Lab §14.
 *
 * 🔴 IT REPARSES THE STORED BYTES WITH `parseDocument`, the same production entrypoint the original
 * inspection used. Not a cached result, not the saved report: the file, read again, now.
 *
 * Tutor cases are NOT rerun here, and the refusal says so rather than returning an empty diff. A
 * teaching turn needs the learner's own JWT to reach the metered model door and to write evidence
 * under row-level security, so it reruns in the browser, on the Replays page, as the Lab learner.
 * Faking it server-side with the service role would exercise a path no learner ever takes.
 */
import { NextResponse } from "next/server";

import { countDocument } from "@nemesis/shared";

import { readCase, readCaseFile } from "@/lib/lab/cases";
import { labRouteRefusal } from "@/lib/lab/gate";
import { driftBetween, parserFacts, type ReplayResult } from "@/lib/lab/replay";
import { parseDocument } from "@/lib/notebooks/parse-document";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const refusal = labRouteRefusal();
  if (refusal) return refusal;
  const { id } = await context.params;
  const entry = readCase(id);
  if (!entry) return NextResponse.json({ error: "No such case." }, { status: 404 });

  if (entry.kind !== "parser") {
    return NextResponse.json({
      drift: [],
      note: "A teaching case reruns in the browser, as the Lab learner, because it needs a real session to reach the model and to write evidence. Open it on the Replays page.",
      ran: false,
    } satisfies ReplayResult);
  }

  const bytes = readCaseFile(entry);
  if (!bytes) {
    return NextResponse.json({
      drift: [],
      note: "The file saved with this case is missing, so there is nothing to reparse. This is not agreement.",
      ran: false,
    } satisfies ReplayResult);
  }

  const report = (entry.observed as { report?: { lookedAtFigures?: boolean; lane?: string } | null }).report ?? null;
  const outcome = await parseDocument(bytes.slice(), entry.file!.name, entry.file!.type, {
    lookAtFigures: report?.lookedAtFigures === true,
    vendorAllowed: report?.lane !== "native",
  });
  const parsed = outcome.ok || outcome.reason === "no-text" ? outcome.document : null;
  const model = parsed?.model ?? null;

  const after = parserFacts({
    characters: parsed?.text.length ?? null,
    counts: model ? (countDocument(model) as unknown as Record<string, unknown>) : null,
    coverageState: parsed?.coverage.state ?? null,
    outcome: outcome.ok ? "ok" : outcome.reason,
    readBy: parsed?.readBy ?? null,
    routeReason: parsed?.routeReason ?? null,
  });

  const observed = entry.observed as {
    counts?: Record<string, unknown> | null;
    report?: {
      document?: { coverage?: { state?: string }; readBy?: string | null; routeReason?: string | null; text?: string } | null;
      outcome?: { ok?: boolean; reason?: string };
    } | null;
  };
  const beforeDoc = observed.report?.document ?? null;
  const before = parserFacts({
    characters: typeof beforeDoc?.text === "string" ? beforeDoc.text.length : null,
    counts: observed.counts ?? null,
    coverageState: beforeDoc?.coverage?.state ?? null,
    outcome: observed.report?.outcome?.ok ? "ok" : (observed.report?.outcome?.reason ?? "unknown"),
    readBy: beforeDoc?.readBy ?? null,
    routeReason: beforeDoc?.routeReason ?? null,
  });

  return NextResponse.json({
    drift: driftBetween(before, after),
    note: null,
    ran: true,
  } satisfies ReplayResult);
}
