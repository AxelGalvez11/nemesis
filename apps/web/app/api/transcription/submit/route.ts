import { forwardToFunction } from "../forward";

export const runtime = "nodejs";

/**
 * Start an enhance-transcript job. A forwarder — the implementation is
 * supabase/functions/nemesis-transcribe/index.ts. See ../forward.ts for why
 * this route still exists.
 */
export async function POST(request: Request) {
  return await forwardToFunction(request, "submit");
}
