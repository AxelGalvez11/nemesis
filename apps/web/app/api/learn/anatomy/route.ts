// Where a structure's name becomes a region file and a highlight list — the server half of §42's
// anatomy lane.
//
// 🔴🔴 THIS ROUTE EXISTS FOR ONE REASON: THE ATLAS REGISTRY MAY NOT REACH THE LEARNER'S BUNDLE.
// The names of every bone, muscle, nerve and vessel in every harvested region are tens of
// thousands of characters and grow with each region added; a learner reading a history lesson must
// not download them to discover their answer mentions no anatomy. The same argument §45 makes for
// the maths parser, and `visualization-roadmap.test.ts` enforces the same way: a client component
// that so much as names `anatomy-atlas` fails the build.
//
// 🔴 IT READS NOTHING AND REACHES NOTHING. No third party, no database, no learner material — it
// matches strings against a compiled-in list and returns a same-origin path. That is why it needs
// no authentication and why it is bounded rather than guarded: the only cost it can be made to
// spend is string comparison.

import { NextResponse } from "next/server";

import { resolveStructureName } from "@/lib/learn/anatomy-match";

export const runtime = "nodejs";

/** How many structures one request may resolve. `anatomy-resolve.ts` collects at most this many. */
const MAX_STRUCTURES = 6;

/** The longest name worth matching. Past this it is not an anatomical term. */
const MAX_NAME_LENGTH = 80;

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const structures =
    typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).structures)
      ? ((body as Record<string, unknown>).structures as unknown[])
      : null;
  if (!structures) return NextResponse.json({ error: "expected { structures: [...] }" }, { status: 400 });
  if (structures.length > MAX_STRUCTURES) {
    return NextResponse.json({ error: `at most ${MAX_STRUCTURES} structures` }, { status: 400 });
  }

  // 🔴 A PER-STRUCTURE RESULT ARRAY, NOT A WHOLE-REQUEST PASS OR FAIL, and the positions match the
  // input. A lesson naming the sacrum and the mitral valve should lose only the valve.
  const results = structures.map((asked) => {
    if (typeof asked !== "string" || !asked.trim() || asked.length > MAX_NAME_LENGTH) {
      return { detail: `a structure name is 1–${MAX_NAME_LENGTH} characters`, ok: false, reason: "name-unusable" };
    }
    const resolved = resolveStructureName(asked);
    return resolved
      ? { ok: true, resolved }
      : { detail: `the atlas carries no structure matching "${asked}"`, ok: false, reason: "not-in-atlas" };
  });

  return NextResponse.json({ results });
}
