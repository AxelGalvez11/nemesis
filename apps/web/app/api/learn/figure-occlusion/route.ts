// Where a subject becomes a picture WITH ITS PARTS FOUND — the input to an occlusion question.
//
// 🔴 THE SIBLING OF `/api/learn/reference-image`, AND IT DOES THAT ROUTE'S JOB PLUS ONE STEP.
// Finding a licensed picture for a subject is identical work, done by the identical helpers, so
// the licence decision is still `chooseAsset`'s and a caller still cannot ask this route for an
// arbitrary URL. What is added is the step that makes the picture ASKABLE: a vision read that
// finds the labelled parts and where they sit.
//
// 🔴🔴 IT IS A SEPARATE ROUTE BECAUSE IT COSTS MONEY AND THE OTHER ONE DOES NOT. `reference-image`
// is a search: unauthenticated, four subjects a call, cheap. This one bills a vision read per
// picture, so it takes the device-key gate `/api/study/occlusion` uses, writes a spend row, and
// accepts ONE subject per call. Folding it in as a flag would have put a paid model call behind
// an open door, which is the exact hole that route's own header warns about.
//
// 🔴 THE VISION PROMPT AND THE PARSER ARE THE ONES THE HAND EDITOR ALREADY USES. Same
// `OCCLUSION_VISION_PROMPT`, same `parseSuggestedBoxes`, same `looksNormalized` scale refusal.
// A second prompt for "find the labelled parts" would be a second definition of what a label is,
// and the two would answer differently on the same picture.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { bearerFrom, verifyDeviceKey } from "@/lib/device-key";
import { allowedAssetUrl, findReferenceImages } from "@/lib/learn/reference-images";
import { REFERENCE_REGISTRY } from "@/lib/learn/reference-registry";
import { REFERENCE_SHELF } from "@/lib/learn/reference-shelf";
import { chooseAsset } from "@/lib/learn/visual-provenance";
import { imageSize } from "@/lib/notebooks/image-dimensions";
import { smallerThumbnail } from "@/lib/learn/occlusion-source";
import { adminClient } from "@/lib/server";
import { readImage, visionConfigured, visionMime, VISION_MAX_BYTES } from "@/lib/vision/read";
import { jsonFrom, looksNormalized, OCCLUSION_VISION_PROMPT, parseSuggestedBoxes } from "@nemesis/shared";

export const runtime = "nodejs";
/** A repository search plus a vision read. The vision half is the slow one. */
export const maxDuration = 60;

const CURATED = [...REFERENCE_REGISTRY, ...REFERENCE_SHELF];

/** How long the repository search gets. Matches `/api/learn/reference-image`. */
const SEARCH_TIMEOUT_MS = 8000;

/** How long fetching the chosen picture's bytes gets. */
const IMAGE_TIMEOUT_MS = 10000;

/**
 * How long the vision read gets.
 *
 * 🔴 THE THREE BUDGETS MUST ADD UP TO LESS THAN `maxDuration`, WITH ROOM TO SPARE. 8 + 10 + 38 is
 * 56 of 60, and the four left over are for everything that is not waiting: the JSON, the spend
 * insert, cold start. Before this existed the read was unbounded and the PLATFORM ended the
 * request — a 504 with an HTML body, which a client can only read as "no diagram, no reason".
 */
const VISION_BUDGET_MS = 38000;

const USER_AGENT = "NemesisLearn/1.0 (https://enternemesis.com)";

async function repositoryFetch(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  return { json: () => response.json() as Promise<unknown>, ok: response.ok, status: response.status };
}

export async function POST(request: Request): Promise<NextResponse> {
  // 🔴 THE ONLY THING BETWEEN A MADE-UP STRING AND A VISION BILL ON OUR KEY.
  const check = await verifyDeviceKey(bearerFrom(request.headers.get("authorization")));
  if (!check.ok) {
    return check.reason === "unavailable"
      ? NextResponse.json({ error: "Can't check this device right now. Try again in a moment." }, { status: 503 })
      : NextResponse.json({ error: "This device needs to re-connect to your account. Try again." }, { status: 401 });
  }
  if (!visionConfigured()) {
    return NextResponse.json({ ok: false, reason: "vision-off" }, { status: 200 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }
  const subject = typeof body === "object" && body !== null ? (body as Record<string, unknown>).subject : null;
  if (typeof subject !== "string" || !subject.trim()) {
    return NextResponse.json({ error: "expected { subject: string }" }, { status: 400 });
  }

  // 🔴🔴 THE CACHE IS WHAT MAKES THIS QUICK (owner 2026-08-25: *"I need image occlusion and
  // diagrams to come clean and quick"*). The work below is a repository search, an image download
  // and a vision read: tens of seconds, genuinely. But it is the SAME work every time — "nephron"
  // resolves to one Commons diagram whose printed labels sit where they sat yesterday — so the
  // second learner to ask, and the first one asking again, pay nothing.
  const admin = adminClient();
  const key = cacheKey(subject);
  const hit = await readCache(admin, key);
  if (hit) return NextResponse.json(hit);

  const candidates = await findReferenceImages(
    { concept: subject.trim(), limit: 4 },
    { fetch: repositoryFetch, registry: CURATED },
  );
  // 🔴 `accuracyBearing` IS TRUE HERE, AND IT IS NOT TRUE FOR AN ILLUSTRATION. The learner is
  // about to be GRADED against what this picture shows — a wrong label under a box is scored as
  // their mistake. That is the difference `visual-provenance.ts` exists to draw, so a picture
  // good enough to look at is not automatically good enough to be marked against.
  const choice = chooseAsset({ accuracyBearing: true, candidates });
  if (!choice.ok) {
    return refuse(admin, key, choice.reason, choice.detail);
  }

  const chosenPath = choice.asset.assetPath;
  // `chooseAsset` already refuses anything unlicensed; this refuses anything off the allow list
  // before our server fetches it.
  if (!allowedAssetUrl(chosenPath)) return refuse(admin, key, "no-trusted-asset");

  // 🔴🔴🔴 TRY THE SMALL ONE, FALL BACK TO THE ONE WE WERE GIVEN. Wikimedia only serves widths it
  // has ALREADY RENDERED, and which ones those are is unpredictable per file — measured on this
  // very diagram, 2026-08-25: 960px and 1280px answer, while 640, 800, 1024 and 1200 all return
  // 400. The first cut of this rewrote every URL to a fixed 800px and returned it as fact. Every
  // lookup then died at `image-unreachable` in 1.4 seconds, which from the outside was
  // indistinguishable from "no diagram exists". A guess is fine; a guess treated as certainty is
  // the bug.
  //
  // 🔴 `assetPath` ENDS UP AS WHICHEVER CANDIDATE ANSWERED, because that is the picture the masks
  // are measured against and therefore the only one that may be displayed. Reading a small
  // rendering and showing a large one would put every box in the right place on the wrong picture.
  const smaller = smallerThumbnail(chosenPath);
  const attempts = smaller && allowedAssetUrl(smaller) ? [smaller, chosenPath] : [chosenPath];

  let bytes: Uint8Array | null = null;
  let contentType = "";
  let assetPath = chosenPath;
  for (const candidate of attempts) {
    try {
      const picture = await fetch(candidate, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      });
      if (!picture.ok) continue;
      const buffer = await picture.arrayBuffer();
      // 🔴 CHECKED AFTER THE DOWNLOAD, BECAUSE Content-Length IS OPTIONAL. A repository that
      // streams without one would walk straight past a size gate keyed on the header. Oversize is
      // not fatal here — trying the smaller rendering next is the entire point of the list.
      if (buffer.byteLength > VISION_MAX_BYTES) continue;
      bytes = new Uint8Array(buffer);
      contentType = picture.headers.get("content-type") ?? "";
      assetPath = candidate;
      break;
    } catch {
      // Move to the next candidate. Only running out of them is a refusal.
    }
  }
  if (!bytes) return refuse(admin, key, "image-unreachable");

  const mime = visionMime(assetPath, contentType);
  if (!mime) return refuse(admin, key, "image-unreadable");

  // 🔴🔴 THE SIZE IS MEASURED FROM THE BYTES, NEVER ASKED OF THE MODEL. `OCCLUSION_VISION_PROMPT`
  // explicitly tells it "Do NOT report the image's size", because it does not reliably know and
  // will confidently say 1024 for a 3024-wide picture — which puts every mask somewhere wrong in
  // a way that reads to the learner as "this feature is broken". Reading the header costs nothing
  // and is the only trustworthy source.
  const size = imageSize(bytes);
  if (!size) return refuse(admin, key, "image-unreadable");

  // 🔴🔴 VISION GETS AN EXPLICIT BUDGET, NOT THE REST OF THE FUNCTION'S LIFE. Without one it runs
  // until the PLATFORM kills the request, and the caller gets a 504 — an HTML error page rather
  // than a JSON answer, which the client can only read as "no diagram" with no reason attached.
  // Bounded here, an over-long read comes back as a clean `vision-slow` and everything downstream
  // behaves the way it does for every other refusal.
  const seen = await readImage(bytes, mime, {
    prompt: OCCLUSION_VISION_PROMPT,
    signal: AbortSignal.timeout(VISION_BUDGET_MS),
    spend: { admin, scope: { operation: "figure-occlusion" }, userId: check.userId },
  });
  if (!seen?.text) return refuse(admin, key, "vision-failed");

  const boxes = parseSuggestedBoxes(jsonFrom(seen.text));
  // A real answer, not a failure: most pictures are not labelled diagrams, and saying so lets the
  // caller fall back to showing the picture plainly rather than retrying.
  if (boxes.length === 0) return refuse(admin, key, "no-labelled-parts");
  // 🔴 REFUSE A WRONG-SCALE REPLY RATHER THAN RESCALING IT. Models answer this in 0-1, 0-100 and
  // 0-1000 depending on the day, and guessing wrong puts every mask confidently in the wrong place.
  if (!looksNormalized(boxes)) return refuse(admin, key, "wrong-scale");

  const answer: FigureOcclusionAnswer = {
    asset: {
      assetPath,
      ...(choice.asset.caption ? { caption: choice.asset.caption } : {}),
      licence: choice.asset.licence,
      provenance: choice.asset.provenance,
    },
    boxes,
    height: size.height,
    ok: true,
    width: size.width,
  };
  await writeCache(admin, key, answer);
  return NextResponse.json(answer);
}

// ─────────────────────────────────────────────────────────────────── the cache

/** What crosses back, hit or miss. */
type FigureOcclusionAnswer =
  | {
      ok: true;
      asset: { assetPath: string; caption?: string; licence: unknown; provenance: string };
      boxes: unknown[];
      width: number;
      height: number;
    }
  | { ok: false; reason: string; detail?: string };

/**
 * The cache key.
 *
 * 🔴 CASE AND SPACING ONLY. "Nephron", "nephron" and "  nephron " are one subject; "kidney" is a
 * different one and must stay different. Anything cleverer — stemming, synonyms, dropping "the" —
 * would start MERGING subjects, and a merge here serves one diagram under another's name.
 */
function cacheKey(subject: string): string {
  return subject.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

/**
 * How long a stored answer stands.
 *
 * 🔴 A REFUSAL EXPIRES SOONER THAN A HIT, because the two age differently. A diagram's printed
 * labels do not move, so a hit is good for a long time. A refusal often means the repositories had
 * nothing *yet*, or a provider was briefly down — retrying that next month is worth one read.
 */
const HIT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const REFUSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A stored answer, or null.
 *
 * 🔴 IT NEVER THROWS AND NEVER BLOCKS. A cache that can fail the request it was added to speed up
 * is a downgrade. Every error path here returns null, which costs one re-read and nothing else.
 */
async function readCache(admin: SupabaseClient, key: string): Promise<FigureOcclusionAnswer | null> {
  try {
    const { data, error } = await admin
      .from("figure_occlusion_cache")
      .select("ok,reason,asset_path,width,height,boxes,licence,caption,created_at,hits")
      .eq("subject", key)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    const age = Date.now() - new Date(String(row.created_at)).getTime();
    const fresh = row.ok === true ? age < HIT_TTL_MS : age < REFUSAL_TTL_MS;
    if (!Number.isFinite(age) || !fresh) return null;

    // Counted, not awaited: the number is for a later look at what is worth keeping warm, and a
    // learner must never wait on bookkeeping.
    void admin
      .from("figure_occlusion_cache")
      .update({ hits: (typeof row.hits === "number" ? row.hits : 0) + 1 })
      .eq("subject", key)
      .then(() => undefined);

    if (row.ok !== true) {
      return { ok: false, reason: typeof row.reason === "string" ? row.reason : "unknown" };
    }
    // 🔴 A STORED ROW IS RE-CHECKED LIKE ANY OTHER INPUT. It was written by an earlier version of
    // this route, which is a different program: a row missing its width would otherwise reach the
    // renderer as `viewBox="0 0 undefined undefined"` and draw the empty framed box this codebase
    // has already shipped once.
    const assetPath = typeof row.asset_path === "string" ? row.asset_path : "";
    const width = typeof row.width === "number" ? row.width : 0;
    const height = typeof row.height === "number" ? row.height : 0;
    if (!assetPath || !allowedAssetUrl(assetPath) || width <= 0 || height <= 0 || !Array.isArray(row.boxes)) return null;
    return {
      asset: {
        assetPath,
        ...(typeof row.caption === "string" && row.caption ? { caption: row.caption } : {}),
        licence: row.licence,
        provenance: "reference_image",
      },
      boxes: row.boxes,
      height,
      ok: true,
      width,
    };
  } catch {
    return null;
  }
}

/** Store an answer. Swallows its own failures, for the same reason `readCache` does. */
async function writeCache(admin: SupabaseClient, key: string, answer: FigureOcclusionAnswer): Promise<void> {
  try {
    // 🔴 ONE ROW SHAPE FOR BOTH OUTCOMES, WITH NULLS RATHER THAN ABSENCES. A refusal upserted over
    // an older hit must CLEAR that hit's picture — omitting the columns would leave the stale
    // asset in place beside `ok: false`, which is a row that contradicts itself.
    await admin.from("figure_occlusion_cache").upsert(
      {
        asset_path: answer.ok ? answer.asset.assetPath : null,
        boxes: answer.ok ? answer.boxes : null,
        caption: answer.ok ? answer.asset.caption ?? null : null,
        created_at: new Date().toISOString(),
        height: answer.ok ? answer.height : null,
        hits: 0,
        licence: answer.ok ? answer.asset.licence : null,
        ok: answer.ok,
        reason: answer.ok ? null : answer.reason,
        subject: key,
        width: answer.ok ? answer.width : null,
      },
      { onConflict: "subject" },
    );
  } catch {
    // A cache that cannot be written is a slow product, not a broken one.
  }
}

/**
 * Refusals that mean "there is nothing here", as opposed to "we did not manage it".
 *
 * 🔴🔴🔴 ONLY THESE ARE CACHED, AND THE DISTINCTION IS THE DIFFERENCE BETWEEN A CACHE AND A
 * POISON. Caching a durable refusal saves a pointless search every time somebody asks about a
 * subject that genuinely has no labelled diagram — the common case, and the whole reason refusals
 * are stored at all.
 *
 * Caching a TRANSIENT one is a disaster in slow motion. A vision read that ran long, a repository
 * that was briefly down, a thumbnail width Wikimedia declined to render: each is a momentary
 * failure, and storing it would take that subject off the menu for a week for every learner on the
 * product. It nearly happened — a bad thumbnail rewrite wrote `image-unreachable` for "nephron",
 * and until that row was deleted by hand, nobody could have been asked about a kidney.
 */
const DURABLE_REFUSALS = new Set(["no-candidates", "no-trusted-asset", "no-labelled-parts", "vision-off"]);

/** Record why no diagram, and say so. */
async function refuse(admin: SupabaseClient, key: string, reason: string, detail?: string): Promise<NextResponse> {
  const answer: FigureOcclusionAnswer = { ok: false, reason, ...(detail ? { detail } : {}) };
  if (DURABLE_REFUSALS.has(reason)) await writeCache(admin, key, answer);
  return NextResponse.json(answer, { status: 200 });
}
