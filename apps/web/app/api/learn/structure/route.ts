// Where a compound NAME becomes a canonical structure — §42's ladder, finally reachable.
//
// 🔴🔴 IT IS A ROUTE FOR THE SAME REASON THE PLOT ONE IS, PLUS ONE MORE. The canvas talks to the
// model from the browser, so there is no server already in that path; and this one reaches a THIRD
// PARTY, which a page must not do on the learner's behalf. PubChem sees our server, never their
// browser: no learner IP, no referrer carrying a canvas URL, no CORS surface, and one place to add
// caching or a rate limit the day either is needed.
//
// 🔴 A LOOKUP, NOT A PROXY. The only thing that crosses is a compound name, and the only thing that
// comes back is a validated SMILES with the provenance stamp attached by `chem-resolver.ts`. A
// caller cannot ask this route for an arbitrary URL, and PubChem's response never reaches a client
// unfiltered.
import { NextResponse } from "next/server";

import { resolveStructure } from "@/lib/learn/chem-resolver";

export const runtime = "nodejs";
export const maxDuration = 20;

/** How many names one answer may look up. Matches `structure-resolve.ts`'s own bound. */
const MAX_NAMES = 8;

/**
 * How long one lookup gets.
 *
 * 🔴 THE LEARNER IS ALREADY WAITING WHEN THIS RUNS, so it is short and the lookups go out together.
 * A slow PubChem costs one picture, never the explanation around it — `structure-resolve.ts` drops
 * an unresolved name and keeps the prose.
 */
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

  // 🔴 IN PARALLEL AND BOUNDED, because eight sequential lookups at six seconds each is a minute of
  // a learner watching a spinner. `MAX_NAMES` is what stops this being a way to fan out requests to
  // a third party from one call.
  const results = await Promise.all(
    names.map(async (name) => {
      if (typeof name !== "string" || !name.trim()) {
        return { detail: "a name is empty", ok: false as const, reason: "empty-name" };
      }
      const resolution = await resolveStructure(name, { fetch: globalThis.fetch, timeoutMs: TIMEOUT_MS });
      return resolution.ok
        ? { ok: true as const, structure: resolution.structure }
        : { detail: resolution.detail, ok: false as const, reason: resolution.reason };
    }),
  );

  return NextResponse.json({ results });
}
