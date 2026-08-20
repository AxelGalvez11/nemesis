/**
 * Sign the browser in as the Lab's own learner — Nemesis Lab §16.
 *
 * 🔴 IT HANDS BACK A SESSION FOR A THROWAWAY ACCOUNT, NEVER FOR THE OWNER'S. The Tutor Lab has to
 * run the real cognition, and the real cognition writes evidence under the learner's own JWT with
 * row-level security enforced exactly as in production. That means the browser must genuinely BE
 * signed in — and it must be signed in as an identity that owns nothing but Lab rows.
 *
 * 🔴 THE GATE IS WHY THIS IS NOT A CREDENTIAL LEAK. `labRouteRefusal` 404s in production, so this
 * route exists only on a developer's own machine, and the account it returns is one the Lab made
 * for itself. There is no path by which it can mint a session for a real learner.
 */
import { NextResponse } from "next/server";

import { labRouteRefusal } from "@/lib/lab/gate";
import { ensureLabLearner } from "@/lib/lab/learner";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const refusal = labRouteRefusal();
  if (refusal) return refusal;
  const result = await ensureLabLearner();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json(result.learner);
}
