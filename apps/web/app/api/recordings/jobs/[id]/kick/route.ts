// Nudge the worker for one job.
//
// Two callers, both of them accelerants rather than requirements:
//
//   - a page that is watching a job and sees it sitting there due but unclaimed
//     (a kick that was lost when a serverless invocation died, say)
//   - the retry button, right after retry_recording_job has reset the row
//
// pg_cron picks either case up within a minute on its own. This route only makes
// it feel immediate — nothing here is load-bearing, which is why every failure
// path is a quiet 202 rather than an error the student has to understand.
//
// The worker itself takes the service-role key, which the browser must never
// hold. This route is the airlock: it authenticates the student, checks the job
// is theirs, and only then spends the key.

import { NextRequest } from "next/server";

import { supabaseUrl, serviceRoleKey } from "@/lib/env";
import { json, userClient, verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyBearer(req);
  if (!auth) return json({ error: "unauthorized" }, 401);
  if (!supabaseUrl || !serviceRoleKey) return json({ kicked: false }, 202);

  const { id } = await context.params;
  if (!id) return json({ error: "a job id is required" }, 400);

  // Read through the CALLER'S token, so row-level security is what proves the
  // job is theirs. A service-role read here would need this route to get the
  // ownership check right by hand, and getting it wrong would let any signed-in
  // account spend the worker's budget on someone else's job.
  const { data } = await userClient(req)
    .from("recording_jobs")
    .select("id,status")
    .eq("id", id)
    .maybeSingle();
  if (!data) return json({ error: "not found" }, 404);
  // A finished job has nothing to advance; kicking it would claim a lease for a
  // no-op.
  if (data.status !== "processing") return json({ kicked: false }, 202);

  try {
    await fetch(`${supabaseUrl}/functions/v1/recording-worker`, {
      body: JSON.stringify({ jobId: id }),
      headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      method: "POST",
    });
    return json({ kicked: true }, 202);
  } catch (caught) {
    console.error("recording worker kick failed", (caught as Error)?.message);
    return json({ kicked: false }, 202);
  }
}
