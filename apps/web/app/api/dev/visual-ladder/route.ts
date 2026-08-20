// DEV-ONLY — run one concept down §42's ladder and report every rung it touched.
//
// 🔴 IT CALLS THE PRODUCTION ROUTER, WHICH IS THE ONLY THING THAT MAKES THE LAB WORTH HAVING. This
// route resolves a structure, searches for reference images, and then hands what it found to
// `routeVisual()` — the same function `canvas-policy-view.tsx` and `canvas-document.tsx` ask. A lab
// that re-implemented the decision would show a picture of a ladder rather than the ladder, and
// would keep agreeing with itself after production stopped agreeing with it.
//
// 🔴 REFUSED IN PRODUCTION, NOT MERELY HIDDEN. This route performs unauthenticated outbound
// requests to third parties on a caller's text; that is fine on a laptop and is a small open relay
// in production. `NODE_ENV` is the gate and it is checked first, before anything is parsed.
import { NextResponse } from "next/server";

import { resolveStructure } from "@/lib/learn/chem-resolver";
import { findReferenceImages } from "@/lib/learn/reference-images";
import { validateCanvasVisual } from "@/lib/learn/canvas-visual";
import { creditLineFor } from "@/lib/learn/visual-provenance";
import { routeVisual, type VisualRouteInput } from "@/lib/learn/visual-route";

export const runtime = "nodejs";
export const maxDuration = 30;

/** The shape the Lab renders. Every field answers one of the owner's six questions. */
interface LadderReport {
  concept: string;
  /** What was asked for — a structure, a picture, or both. */
  need: string;
  /** Rung 2: did a canonical structure resolve? */
  structure:
    | { ok: true; notation: string; provider: string; id: string; value: string; stereochemistry: boolean }
    | { ok: false; reason: string; detail: string };
  /** Rungs 3 and 4: what the registry and the live provider offered, with licences. */
  candidates: Array<{
    provenance: string;
    providerId: string;
    assetPath: string;
    caption?: string;
    author?: string;
    licence?: string;
    attribution?: string;
    url?: string;
    tags: string[];
    credit: string | null;
  }>;
  /** The production router's verdict, verbatim. */
  route: { decision: string; representation?: string; reason?: string; assetRefusal?: string; because: string };
  /** What the surface would actually draw, in a form the Lab can render without guessing. */
  rendered:
    | { kind: "structure"; notation: string; value: string }
    | { kind: "image"; assetPath: string; credit: string | null; url?: string }
    | { kind: "none" };
}

async function nodeFetch(url: string, init?: { signal?: AbortSignal }) {
  const response = await fetch(url, { ...init, headers: { accept: "application/json" } });
  return { json: () => response.json() as Promise<unknown>, ok: response.ok, status: response.status };
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "The visual lab is a development surface." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { concept?: unknown; operation?: unknown };
  const concept = typeof body.concept === "string" ? body.concept.trim() : "";
  if (!concept) return NextResponse.json({ error: "Name a concept." }, { status: 400 });
  // `locate` is the accuracy-bearing operation — the Lab exposes it because it is the switch that
  // makes a generated picture unreachable, and seeing that happen is half the point of the surface.
  const operation = body.operation === "locate" ? ("locate" as const) : ("explain" as const);

  const structure = await resolveStructure(concept, { fetch: nodeFetch, timeoutMs: 8000 });
  const candidates = await findReferenceImages({ concept, limit: 4 }, { fetch: nodeFetch });

  // 🔴 A RESOLVED STRUCTURE BECOMES A REQUEST, NOT A DECISION. The Lab does not get to say "this is
  // rung 2"; it builds the same `structure` request a teaching model would emit and lets the router
  // rank it against everything else. That is what makes the "selected rung" column trustworthy.
  const request = structure.ok
    ? {
        kind: "structure" as const,
        learningGoal: `Recognise the structure of ${concept}`,
        notation: structure.structure.notation,
        resolvedFrom: {
          id: structure.structure.id,
          name: structure.structure.name,
          provider: structure.structure.provider,
        },
        value: structure.structure.value,
      }
    : undefined;

  const input: VisualRouteInput = { assets: candidates, operation, ...(request ? { request } : {}) };
  const route = routeVisual(input);

  const report: LadderReport = {
    candidates: candidates.map((candidate) => ({
      assetPath: candidate.assetPath,
      attribution: candidate.licence?.attribution,
      author: candidate.author,
      caption: candidate.caption,
      credit: creditLineFor(candidate),
      licence: candidate.licence?.licence,
      provenance: candidate.provenance,
      providerId: candidate.providerId,
      tags: [...candidate.tags],
      url: candidate.url,
    })),
    concept,
    need:
      operation === "locate"
        ? "a picture the learner will be graded against"
        : "a picture that accompanies an explanation",
    rendered: { kind: "none" },
    route: {
      because: route.because,
      decision: route.decision,
      ...(route.decision === "render" ? { representation: route.representation } : {}),
      ...(route.decision === "prose" ? { reason: route.reason, assetRefusal: route.assetRefusal } : {}),
      ...(route.decision === "refused" ? { reason: route.reason } : {}),
    },
    structure: structure.ok
      ? {
          id: structure.structure.id,
          notation: structure.structure.notation,
          ok: true,
          provider: structure.structure.provider,
          stereochemistry: /@|\/|\\/.test(structure.structure.value),
          value: structure.structure.value,
        }
      : { detail: structure.detail, ok: false, reason: structure.reason },
  };

  if (route.decision === "render" && route.representation === "structure" && route.spec.kind === "structure") {
    report.rendered = { kind: "structure", notation: route.spec.notation, value: route.spec.value };
  } else if (route.decision === "render" && (route.representation === "reference_image" || route.representation === "generated_image")) {
    report.rendered = {
      assetPath: route.asset.assetPath,
      credit: creditLineFor(route.asset),
      kind: "image",
      url: (route.asset as { url?: string }).url,
    };
  }

  // Validating the request we built is a check on the LAB, not on the router: if this ever refuses,
  // the surface is constructing specs the production boundary would reject.
  const selfCheck = request ? validateCanvasVisual(request) : { ok: true as const };
  return NextResponse.json({ ...report, labSpecValid: selfCheck.ok });
}
