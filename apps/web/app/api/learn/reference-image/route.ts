// Where a figure SUBJECT becomes a licensed picture — §42's rung three, reachable from a lesson.
//
// 🔴 IT IS A ROUTE FOR THE SAME REASONS THE STRUCTURE ONE IS. The canvas talks to the model from
// the browser, so there is no server already in that path; and this one reaches third parties,
// which a page must not do on the learner's behalf. The repositories see our server, never their
// browser — no learner IP, no referrer carrying a canvas URL — and there is one place to add
// caching or a rate limit the day either is needed.
//
// 🔴 THE LICENCE DECISION IS MADE HERE, ONCE, BY `chooseAsset`. What crosses back is the chosen
// candidate with its licence and credit attached — or a named refusal. A caller cannot ask this
// route for an arbitrary URL, and no repository response reaches a client unfiltered.
import { NextRequest, NextResponse } from "next/server";

import { searchShelf } from "@/lib/learn/figure-shelf-server";
import { findReferenceImages } from "@/lib/learn/reference-images";
import { REFERENCE_REGISTRY } from "@/lib/learn/reference-registry";
import { REFERENCE_SHELF } from "@/lib/learn/reference-shelf";
import { chooseAsset, type CandidateAsset } from "@/lib/learn/visual-provenance";
import { verifyBearer } from "@/lib/server";

/**
 * Hand-picked rows first, then the harvested shelf — `searchCurated` sorts by match score and
 * keeps arrival order on ties, so a hand-checked row always shadows a harvested one for the same
 * concept, and both shadow the live provider.
 */
const CURATED = [...REFERENCE_REGISTRY, ...REFERENCE_SHELF];

export const runtime = "nodejs";
export const maxDuration = 20;

/** How many subjects one answer may look up. Matches `figure-resolve.ts`'s own bound. */
const MAX_SUBJECTS = 4;

/**
 * How many runners-up ride back with the chosen asset, for the caller's relevance judge.
 *
 * One below `MAX_JUDGED` in `figure-relevance.ts`, because the chosen asset is the first of the
 * five the judge sees. Sending more would be prompt tokens the judge is told to ignore.
 */
const MAX_ALTERNATIVES = 4;

/** How long one repository query gets. A slow repository costs one picture, never the prose. */
const TIMEOUT_MS = 8000;

/**
 * The Wikimedia etiquette header. Commons asks API clients to say who they are, and a polite
 * client is the difference between a working provider and a throttled one.
 */
const USER_AGENT = "NemesisLearn/1.0 (https://enternemesis.com)";

async function repositoryFetch(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { json: () => response.json() as Promise<unknown>, ok: response.ok, status: response.status };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 🔴 SIGNED-IN CALLERS ONLY, SINCE THE SHELF JOINED THE POOL. This route used to cost two
  // free repository queries; a shelf lookup costs a paid embedding per subject, and an open route
  // that spends money per request is a bill somebody else decides the size of. `figure-lookup.ts`
  // sends the session's own token; a caller without one loses the pictures, never the prose.
  const auth = await verifyBearer(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const subjects =
    typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).subjects)
      ? ((body as Record<string, unknown>).subjects as unknown[])
      : null;
  if (!subjects) return NextResponse.json({ error: "expected { subjects: [...] }" }, { status: 400 });
  if (subjects.length > MAX_SUBJECTS) {
    return NextResponse.json({ error: `at most ${MAX_SUBJECTS} subjects` }, { status: 400 });
  }

  const results = await Promise.all(
    subjects.map(async (subject) => {
      if (typeof subject !== "string" || !subject.trim()) {
        return { detail: "a subject is empty", ok: false as const, reason: "empty-subject" };
      }
      const candidates = await findReferenceImages(
        { concept: subject.trim(), limit: 4 },
        {
          fetch: repositoryFetch,
          registry: CURATED,
          // A shelf outage reads as an empty shelf here: the turn cannot use a 503, only a picture
          // or the ladder's honest refusal. The search route keeps the distinction for monitoring.
          shelfSearch: async (concept, limit) =>
            (await searchShelf(concept, limit, request.headers.get("authorization"))) ?? [],
        },
      );
      const choice = chooseAsset({ accuracyBearing: false, candidates });
      // 🔴 ONLY THE FIELDS THE SPEC CARRIES CROSS BACK. The provider objects hold tags and provider
      // ids that are useful to the Lab; a teaching answer needs the picture, its caption, and the
      // licence that lets us show it — nothing else, so nothing else travels.
      return choice.ok
        ? {
            asset: shown(choice.asset),
            // 🔴 THE RUNNERS-UP TRAVEL TOO, BECAUSE `chooseAsset` RANKS TRUST AND NOTHING ELSE.
            // Among candidates whose licences are equally fine it keeps arrival order, which for
            // the live provider is Wikimedia's own full-text ranking — and that ranking is what
            // answers "the doctrine of precedent" with a scan of Kant. The caller runs the
            // relevance judge (`figure-relevance.ts`), and a judge given one option can only say
            // yes or no: a perfectly good second candidate would be lost to the first one being
            // irrelevant. Everything here has already passed the licence gate individually, so
            // nothing unshowable is being offered — only more to choose between.
            alternatives: candidates
              .filter((candidate) => candidate.assetPath !== choice.asset.assetPath)
              .filter((candidate) => chooseAsset({ accuracyBearing: false, candidates: [candidate] }).ok)
              .slice(0, MAX_ALTERNATIVES)
              .map(shown),
            ok: true as const,
          }
        : { detail: choice.detail, ok: false as const, reason: choice.reason };
    }),
  );

  return NextResponse.json({ results });
}

/** The wire shape of one showable picture — see the comment at the `asset` field above. */
function shown(asset: CandidateAsset) {
  return {
    assetPath: asset.assetPath,
    ...(asset.caption ? { caption: asset.caption } : {}),
    licence: asset.licence,
    provenance: asset.provenance,
  };
}
