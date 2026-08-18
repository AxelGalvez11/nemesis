import { NextResponse } from "next/server";

import { deleteCase, readCase } from "@/lib/lab/cases";
import { labRouteRefusal } from "@/lib/lab/gate";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const refusal = labRouteRefusal();
  if (refusal) return refusal;
  const { id } = await context.params;
  const entry = readCase(id);
  return entry ? NextResponse.json(entry) : NextResponse.json({ error: "No such case." }, { status: 404 });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const refusal = labRouteRefusal();
  if (refusal) return refusal;
  const { id } = await context.params;
  return deleteCase(id)
    ? NextResponse.json({ deleted: id })
    : NextResponse.json({ error: "No such case." }, { status: 404 });
}
