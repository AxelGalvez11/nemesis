// The call that turns a model's figure subjects into licensed pictures (§42, rung three).
//
// 🔴 THE SIBLING OF `structure-lookup.ts`, DELIBERATELY IDENTICAL IN SHAPE. Raw model text in, raw
// model text out; a substring test before any parse; results addressed by position; a failure
// returns the input unchanged — the picture is lost, the explanation around it is not.
//
// 🔴 `fetch` IS INJECTED, so every rule here is testable with no network and no Next.js server.

import {
  applyResolvedFigures,
  collectFigureSubjects,
  mightResolveFigure,
  type FigureResolution,
} from "./figure-resolve";
import { MAX_JUDGED, readRelevanceChoice, relevancePrompt, type FigureVerdict } from "./figure-relevance";
import { ownFigures } from "./own-figures";
import { allowedAssetUrl } from "./reference-images";
import type { CandidateAsset } from "./visual-provenance";

/**
 * What the route offered for one subject: the asset it chose, plus the runners-up that also passed
 * the licence gate. Narrowed to a `FigureResolution` by the relevance judge.
 */
type FigureOffer =
  | { ok: true; asset: CandidateAsset; alternatives: CandidateAsset[] }
  | { ok: false; reason: string; detail: string };

/** Our own route. The repositories are reached from the server, never from the learner's browser. */
export const REFERENCE_IMAGE_ROUTE = "/api/learn/reference-image";

/** How long the whole batch is worth waiting for. Two repositories per subject sit behind it. */
export const REFERENCE_IMAGE_TIMEOUT_MS = 10000;

export interface FigureLookupDeps {
  readonly fetch: typeof globalThis.fetch;
  /**
   * The learner's own stored figures, consulted BEFORE the open corpus. Injected so a test can
   * prove the corpus was not asked, rather than only that it answered second.
   */
  readonly own?: (subjects: readonly string[]) => Promise<(import("./visual-provenance").CandidateAsset | null)[]>;
  readonly timeoutMs?: number;
  /** The session's bearer token, or null when there is none. The route requires a signed-in
   *  caller (a shelf lookup costs an embedding); tokenless degrades to no pictures, never a throw. */
  readonly token?: () => Promise<string | null>;
  /**
   * "Is this a picture OF that?" — asked of the candidates the licence gate allowed.
   *
   * 🔴 OPTIONAL, AND ABSENT MEANS THE OLD BEHAVIOUR: take the best-licensed candidate. That is
   * what every existing caller and every existing test gets, so adding the judge changes nothing
   * it is not wired into. See `figure-relevance.ts` for what this is protecting against and the
   * six measurements that made it necessary.
   */
  readonly judge?: (concept: string, captions: readonly string[]) => Promise<FigureVerdict>;
}

const REAL: FigureLookupDeps = {
  fetch: (...args) => globalThis.fetch(...args),
  /**
   * The relevance judge, on the lane that already meters.
   *
   * 🔴 IT RUNS ONLY WHEN A PICTURE WAS ALREADY FOUND, which is what keeps it cheap: an answer that
   * asks for no figure, or whose figure came from the learner's own material, never reaches here.
   * One short completion, a handful of captions in and a digit out.
   *
   * 🔴 EVERY FAILURE IS `unknown`, NEVER `none`. No session, no reply, a thrown error — all keep
   * the picture the licence gate chose. See `FigureVerdict` for why those two must not be the same
   * value: a judge outage that blanked every picture would be a worse bug than the one it fixes.
   */
  judge: async (concept, captions) => {
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return { verdict: "unknown" };
      const { postChatCompletion } = await import("@/lib/workspace/chat-api");
      const reply = await postChatCompletion(
        uid,
        [{ content: relevancePrompt(concept, captions.map((caption) => ({ caption }))), role: "user" }],
        // 🔴 THE CHEAPEST MODEL AND A TINY CAP. The answer is one digit; anything longer is a model
        // explaining itself, and `readRelevanceChoice` reads the first integer out of that anyway.
        { decision: { model: "deepseek-chat", route: "conversation", searchWeb: false }, maxTokens: 8 },
      );
      return readRelevanceChoice(reply.text, Math.min(captions.length, MAX_JUDGED));
    } catch {
      return { verdict: "unknown" };
    }
  },
  own: ownFigures,
  token: async () => {
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  },
};

/**
 * The same answer, with every figure request stamped with what the reference lane chose.
 *
 * Returns the input unchanged when there is nothing to look up, when the text is not JSON, or when
 * the route cannot be reached. 🔴 WITH ONE DELIBERATE EXCEPTION: when the route DID answer, an
 * unresolved subject still goes through `applyResolvedFigures`, because the apply pass is also the
 * strip pass — a model-written `asset` must not survive a lookup that found nothing better.
 */
export async function resolveFigures(
  text: string,
  deps: FigureLookupDeps = REAL,
  signal?: AbortSignal,
): Promise<string> {
  if (!mightResolveFigure(text)) return text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  const subjects = collectFigureSubjects(parsed);
  if (subjects.length === 0) return text;

  const results = await resolveSubjects(subjects, deps, signal);
  if (!results) return text;

  try {
    return JSON.stringify(applyResolvedFigures(parsed, results));
  } catch {
    return text;
  }
}

/**
 * Subjects in, one resolution each out, addressed by position.
 *
 * 🔴 SPLIT OUT OF `resolveFigures` SO THE LADDER HAS ONE OWNER. Own material first, then the
 * licence-gated route, then the relevance judge. `resolveFigures` above is now only the FINDING
 * (walking a JSON answer for `figure` subjects) and the APPLYING; everything that decides what a
 * learner may be shown lives here, so a second caller cannot walk a shorter ladder by accident.
 *
 * Returns null when nothing could be resolved at all, so a caller can leave its text untouched.
 */
export async function resolveSubjects(
  subjects: readonly string[],
  deps: FigureLookupDeps = REAL,
  signal?: AbortSignal,
): Promise<FigureResolution[] | null> {
  if (subjects.length === 0) return null;

  // 🔴🔴 THE LEARNER'S OWN MATERIAL IS ASKED FIRST, AND WHAT IT ANSWERS NEVER LEAVES THE ACCOUNT.
  // `PROVENANCE_LADDER` has ranked `source_figure` above everything since it was written; until now
  // nothing could produce one for a figure request, so every subject went to the open corpus even
  // when the student's own slide held it. Their lecture's diagram is the one they will be examined
  // on, and it costs no third-party request to show.
  //
  // 🔴 A SUBJECT THEY OWN IS NOT SENT ONWARD AT ALL. The remaining subjects are what the route
  // sees, so a learner asking about their own material does not have its wording handed to an
  // image repository to satisfy a request already answered.
  const mine = deps.own ? await deps.own(subjects).catch(() => subjects.map(() => null)) : subjects.map(() => null);
  const missing = subjects.filter((_subject, index) => !mine[index]);

  const fetched = missing.length > 0 ? await lookUp(missing, deps, signal) : [];
  // A route failure loses only the subjects the route was for; the learner's own pictures stand.
  if (!fetched && !mine.some(Boolean)) return null;

  const judged = fetched ? await judgeOffers(missing, fetched, deps) : null;

  // Re-interleave by position: callers pair results to requests by index.
  let next = 0;
  return subjects.map((subject, index) => {
    const own = mine[index];
    // 🔴 THE JUDGE NEVER SEES THE LEARNER'S OWN FIGURE. It was chosen by matching their material,
    // not by a repository's full-text search, and a model second-guessing their own lecture slide
    // is the one place this check could take a picture away that was right by construction.
    if (own) return { asset: own, ok: true };
    const routed = judged?.[next];
    next += 1;
    return routed ?? { detail: `no picture of "${subject}" could be looked up`, ok: false, reason: "lookup-failed" };
  });
}

/**
 * The relevance gate: every allowed candidate for a subject, narrowed to the one that depicts it.
 *
 * 🔴 NO JUDGE MEANS NO CHANGE. Without `deps.judge` this returns exactly what the route chose,
 * which is what every caller got before this existed.
 *
 * 🔴 A JUDGE THAT FAILS KEEPS THE PICTURE. A thrown error, a timeout or an unreadable reply leaves
 * the route's own choice standing rather than silently turning every answer picture-less: the judge
 * is a filter on a working lane, and a broken filter must not be able to close the lane. Only a
 * judge that ANSWERED, and answered "none", removes a picture.
 */
async function judgeOffers(
  subjects: readonly string[],
  offers: readonly FigureOffer[],
  deps: FigureLookupDeps,
): Promise<FigureResolution[]> {
  const judge = deps.judge;
  if (!judge) return offers.map(asResolution);
  return Promise.all(
    offers.map(async (offer, index) => {
      if (!offer.ok) return offer;
      const pool = [offer.asset, ...offer.alternatives];
      if (pool.length === 0) return asResolution(offer);
      try {
        const verdict = await judge(
          subjects[index] ?? "",
          pool.slice(0, MAX_JUDGED).map((asset) => asset.caption ?? fileNameOf(asset.assetPath)),
        );
        if (verdict.verdict === "none") {
          return {
            detail: `nothing found for "${subjects[index] ?? ""}" was a picture of it`,
            ok: false as const,
            reason: "not-a-picture-of-it",
          };
        }
        // `unknown` keeps the licence gate's own choice — see `FigureVerdict`.
        if (verdict.verdict === "unknown") return asResolution(offer);
        return { asset: pool[verdict.index] ?? offer.asset, ok: true as const };
      } catch {
        return asResolution(offer);
      }
    }),
  );
}

function asResolution(offer: FigureOffer): FigureResolution {
  return offer.ok ? { asset: offer.asset, ok: true } : offer;
}

/** A last-resort description for a candidate the provider gave no caption at all. */
function fileNameOf(url: string): string {
  const last = url.split("/").pop() ?? url;
  return decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
}

async function lookUp(
  subjects: readonly string[],
  deps: FigureLookupDeps,
  signal?: AbortSignal,
): Promise<FigureOffer[] | null> {
  const timeout = new AbortController();
  const deadline = setTimeout(() => timeout.abort(), deps.timeoutMs ?? REFERENCE_IMAGE_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const token = deps.token ? await deps.token().catch(() => null) : null;
    const response = await deps.fetch(REFERENCE_IMAGE_ROUTE, {
      body: JSON.stringify({ subjects }),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      method: "POST",
      signal: timeout.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const results =
      typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).results)
        ? ((body as Record<string, unknown>).results as unknown[])
        : null;
    // 🔴 THE LENGTHS MUST MATCH OR NOTHING IS APPLIED. Results are addressed by POSITION, so a
    // short array would stamp a nephron diagram onto the caption for a gram stain.
    if (!results || results.length !== subjects.length) return null;
    return results.map(readResult);
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}

function readResult(value: unknown): FigureOffer {
  if (typeof value !== "object" || value === null) {
    return { detail: "the route returned something unreadable", ok: false, reason: "malformed-result" };
  }
  const result = value as Record<string, unknown>;
  if (result.ok !== true) {
    return {
      detail: typeof result.detail === "string" ? result.detail : "",
      ok: false,
      reason: typeof result.reason === "string" ? result.reason : "unknown",
    };
  }
  const asset = readAsset(result.asset);
  if (!asset) {
    return { detail: "a resolution arrived without a usable licensed asset", ok: false, reason: "malformed-result" };
  }
  // 🔴 A MALFORMED ALTERNATIVE IS DROPPED, NEVER FATAL. The chosen asset already validated; losing
  // a runner-up costs the judge one option, and failing the whole subject over one would make an
  // additive field able to break a lookup that used to work.
  const alternatives = Array.isArray(result.alternatives)
    ? result.alternatives.map(readAsset).filter((entry): entry is CandidateAsset => entry !== null)
    : [];
  return { alternatives, asset, ok: true };
}

/**
 * One picture from the route, or null.
 *
 * 🔴 THE ROUTE IS OUR OWN AND IS STILL CHECKED ON ARRIVAL. A deploy skew must degrade to "no
 * picture", never to an <img> pointing somewhere the allow list has never heard of, and never to a
 * shown picture whose licence object did not actually make the trip.
 */
function readAsset(value: unknown): CandidateAsset | null {
  if (typeof value !== "object" || value === null) return null;
  const { assetPath, caption, licence, provenance } = value as Record<string, unknown>;
  const licenceRecord = typeof licence === "object" && licence !== null ? (licence as Record<string, unknown>) : null;
  if (
    typeof assetPath !== "string" ||
    !allowedAssetUrl(assetPath) ||
    provenance !== "reference_image" ||
    !licenceRecord ||
    typeof licenceRecord.licence !== "string" ||
    !licenceRecord.licence.trim() ||
    typeof licenceRecord.source !== "string" ||
    !licenceRecord.source.trim()
  ) {
    return null;
  }
  return {
    assetPath,
    ...(typeof caption === "string" && caption.trim() ? { caption: caption.trim() } : {}),
    licence: {
      ...(typeof licenceRecord.attribution === "string" && licenceRecord.attribution.trim()
        ? { attribution: licenceRecord.attribution.trim() }
        : {}),
      licence: licenceRecord.licence.trim(),
      source: licenceRecord.source.trim(),
      ...(typeof licenceRecord.url === "string" && licenceRecord.url.trim() ? { url: licenceRecord.url.trim() } : {}),
    },
    provenance: "reference_image",
  };
}
