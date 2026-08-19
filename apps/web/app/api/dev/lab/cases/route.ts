/**
 * Save and list regression cases — Nemesis Lab §14.
 *
 * 🔴 THE FILE ITSELF IS STORED, NOT A REFERENCE TO ONE. See lib/lab/cases.ts: a case that pointed
 * at a `library_sources` row would stop reproducing the moment that row was reset, and would do so
 * silently — the rerun would simply find nothing and report no difference.
 */
import { NextResponse } from "next/server";

import { labRouteRefusal } from "@/lib/lab/gate";
import { listCases, newCaseId, saveCase, type LabCase, type LabCaseKind } from "@/lib/lab/cases";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const refusal = labRouteRefusal();
  if (refusal) return refusal;
  return NextResponse.json({ cases: listCases() });
}

export async function POST(req: Request): Promise<Response> {
  const refusal = labRouteRefusal();
  if (refusal) return refusal;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected a form." }, { status: 400 });
  const kind = String(form.get("kind") ?? "") as LabCaseKind;
  if (kind !== "parser" && kind !== "tutor") {
    return NextResponse.json({ error: "A case is either a parser case or a tutor case." }, { status: 400 });
  }
  const note = String(form.get("note") ?? "").trim();
  if (!note) return NextResponse.json({ error: "Say what is wrong with it." }, { status: 400 });

  const savedAt = new Date();
  const id = newCaseId(kind, savedAt, note);

  const observed: Record<string, unknown> =
    kind === "parser"
      ? {
          comparison: readJson(form.get("comparison")),
          counts: readJson(form.get("counts")),
          report: readJson(form.get("report")),
        }
      : {
          canvasId: String(form.get("canvasId") ?? "") || null,
          sourceId: String(form.get("sourceId") ?? "") || null,
          turn: readJson(form.get("turn")),
        };

  const entry: LabCase = {
    id,
    kind,
    note,
    observed,
    savedAt: savedAt.toISOString(),
    ...(kind === "parser" && form.get("unit") !== null ? { unit: Number(form.get("unit")) } : {}),
  };

  const file = form.get("file");
  if (kind === "parser") {
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A parser case needs the file itself, so it can be reparsed after a change." },
        { status: 400 },
      );
    }
    entry.file = { bytes: file.size, name: file.name, path: "", type: file.type };
    const saved = saveCase(entry, { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name });
    return NextResponse.json({ id: saved.id });
  }

  return NextResponse.json({ id: saveCase(entry).id });
}

function readJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
