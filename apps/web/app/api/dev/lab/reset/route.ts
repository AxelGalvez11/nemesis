/**
 * Empty the Lab — Nemesis Lab §16, "reset without making me clean database rows by hand".
 *
 * 🔴 IT DELETES BY THE LAB LEARNER'S USER ID AND NOTHING ELSE. See lib/lab/learner.ts for why that
 * is safe here when a timestamp window is not: the account exists only because the Lab created it,
 * so identity IS provenance and the whole `acceptance-cleanup` question never arises.
 */
import { NextResponse } from "next/server";

import { labRouteRefusal } from "@/lib/lab/gate";
import { resetLabLearner } from "@/lib/lab/learner";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const refusal = labRouteRefusal();
  if (refusal) return refusal;
  const body = (await req.json().catch(() => ({}))) as { keepLearner?: boolean };
  const result = await resetLabLearner({ keepLearner: body.keepLearner !== false });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json(result);
}
