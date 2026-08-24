// Where a macromolecule NAME becomes a database accession — §42's viewer lane, reachable from a
// lesson. The same shape as `app/api/learn/structure/route.ts`, one database up: RCSB sees our
// server, never the learner's browser, and the only things that cross are a name out and a
// validated accession with its provenance stamp back.
import { NextResponse } from "next/server";

import { resolveMacromolecule } from "@/lib/learn/macromolecule-resolver";

export const runtime = "nodejs";
export const maxDuration = 20;

/** How many names one answer may look up. Matches `macromolecule-resolve.ts`'s own bound. */
const MAX_NAMES = 4;

/** How long one lookup gets — two requests, search then title, inside one budget each. */
const TIMEOUT_MS = 6000;

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const names =
    typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).names)
      ? ((body as Record<string, unknown>).names as unknown[])
      : null;
  if (!names) return NextResponse.json({ error: "expected { names: [...] }" }, { status: 400 });
  if (names.length > MAX_NAMES) return NextResponse.json({ error: `at most ${MAX_NAMES} names` }, { status: 400 });

  const results = await Promise.all(
    names.map(async (name) => {
      if (typeof name !== "string" || !name.trim()) {
        return { detail: "a name is empty", ok: false as const, reason: "empty-name" };
      }
      const resolution = await resolveMacromolecule(name, { fetch: globalThis.fetch, timeoutMs: TIMEOUT_MS });
      return resolution.ok
        ? { ok: true as const, structure: resolution.structure }
        : { detail: resolution.detail, ok: false as const, reason: resolution.reason };
    }),
  );

  return NextResponse.json({ results });
}
