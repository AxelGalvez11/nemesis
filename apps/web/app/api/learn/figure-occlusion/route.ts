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
import { labelQuality, smallerThumbnail } from "@/lib/learn/occlusion-source";
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
const VISION_BUDGET_MS = 20000;

/**
 * When to stop starting NEW pictures.
 *
 * 🔴 A WALL CLOCK, NOT A COUNT, because three attempts at their individual ceilings would blow the
 * function. `MAX_PICTURES` bounds the money; this bounds the time. Whatever has been read by now
 * is what the learner gets, and a subject that ran out of clock is a TRANSIENT refusal — never
 * cached — so the next ask picks up where this one stopped.
 */
const KEEP_TRYING_UNTIL_MS = 38000;

/**
 * How many different pictures may be read before giving up on a subject.
 *
 * 🔴 THREE. Each one costs a vision read, so this is the ceiling on what a first-ever ask can
 * spend — and with `figure_occlusion_cache` behind it, that is paid once per subject across every
 * learner who will ever ask. One would be cheaper and is exactly what produced the nephron
 * question the owner rejected: the top hit for a subject is often a numbered-key diagram, and the
 * good one is second or third.
 */
const MAX_PICTURES = 3;

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

  const found = await findReferenceImages(
    { concept: subject.trim(), limit: MAX_PICTURES + 2 },
    { fetch: repositoryFetch, registry: CURATED },
  );

  // 🔴🔴🔴 SEVERAL PICTURES ARE TRIED, AND AN UNSUITABLE ONE IS REJECTED RATHER THAN USED.
  // Owner 2026-08-25: *"make sure the images that it uses for image occlusion actually have the
  // content in it… the one for the nephron actually didn't even have proper labels."* He was
  // right, and the failure was mine: the first cut read ONE picture, filtered its unusable labels
  // out, and built a question from whatever survived.
  //
  // The real nephron diagram labels its parts `1 2 3 … 12` and prints the names in a key beside
  // the figure. What survived filtering was the KEY ("F: Filtration") and two orientation words —
  // so the box covered a legend line, and the question tested nothing about a kidney. The picture
  // was wrong for this job, and the right response was to try the next one.
  //
  // 🔴 EACH ATTEMPT COSTS A VISION READ, WHICH IS WHY THE CACHE MATTERS AND WHY THIS IS BOUNDED.
  // Three at most, paid once per subject across every learner who ever asks.
  let lastRefusal = "no-labelled-parts";
  let tried = 0;

  const startedAt = Date.now();
  for (const candidate of found) {
    if (tried >= MAX_PICTURES || Date.now() - startedAt > KEEP_TRYING_UNTIL_MS) break;
    // 🔴 `accuracyBearing` IS TRUE, AND IT IS NOT TRUE FOR AN ILLUSTRATION. The learner is about
    // to be GRADED against what this picture shows — a wrong label under a box is scored as their
    // mistake. `chooseAsset` runs per candidate so each is licence-checked on its own merits.
    const choice = chooseAsset({ accuracyBearing: true, candidates: [candidate] });
    if (!choice.ok) {
      lastRefusal = choice.reason;
      continue;
    }
    const chosenPath = choice.asset.assetPath;
    if (!allowedAssetUrl(chosenPath)) {
      lastRefusal = "no-trusted-asset";
      continue;
    }

    // 🔴🔴 TRY THE SMALL RENDERING, FALL BACK TO THE ONE WE WERE GIVEN. Wikimedia only serves
    // widths it has ALREADY RENDERED, and which ones is unpredictable per file — measured on the
    // nephron figure: 960px and 1280px answer, while 640, 800, 1024 and 1200 all return 400. An
    // earlier cut rewrote to a fixed 800px and returned it as fact; every lookup then died at
    // `image-unreachable` in 1.4s, which looked exactly like "no diagram exists".
    //
    // 🔴 `assetPath` IS WHICHEVER ONE ANSWERED, because that is the picture the masks are measured
    // against and therefore the only one that may be displayed.
    const smaller = smallerThumbnail(chosenPath);
    const renderings = smaller && allowedAssetUrl(smaller) ? [smaller, chosenPath] : [chosenPath];

    let bytes: Uint8Array | null = null;
    let contentType = "";
    let assetPath = chosenPath;
    for (const rendering of renderings) {
      try {
        const picture = await fetch(rendering, {
          headers: { "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        });
        if (!picture.ok) continue;
        const buffer = await picture.arrayBuffer();
        // 🔴 CHECKED AFTER THE DOWNLOAD, BECAUSE Content-Length IS OPTIONAL. Oversize is not fatal
        // — trying the smaller rendering next is the entire point of the list.
        if (buffer.byteLength > VISION_MAX_BYTES) continue;
        bytes = new Uint8Array(buffer);
        contentType = picture.headers.get("content-type") ?? "";
        assetPath = rendering;
        break;
      } catch {
        // Next rendering.
      }
    }
    if (!bytes) {
      lastRefusal = "image-unreachable";
      continue;
    }

    const mime = visionMime(assetPath, contentType);
    // 🔴🔴 THE SIZE IS MEASURED FROM THE BYTES, NEVER ASKED OF THE MODEL. The prompt explicitly
    // tells it not to report the size, because it does not reliably know and will say 1024 for a
    // 3024-wide picture — which puts every mask somewhere wrong.
    const size = mime ? imageSize(bytes) : null;
    if (!mime || !size) {
      lastRefusal = "image-unreadable";
      continue;
    }

    tried += 1;
    // 🔴🔴🔴 GEMINI FIRST, AND THIS IS THE LINE THAT MADE THE FEATURE WORK. DeepSeek REASONS over
    // an image before answering — 18,642 output tokens and 135 SECONDS on one molecular figure, by
    // its own module's measurement. A labelled diagram is precisely that pathological case, and
    // "list the labelled boxes" is precisely where the reasoning buys nothing. Measured live:
    // DeepSeek-first took 34s on a good run and blew the 38s budget on the next; Gemini answers in
    // about seven.
    const seen = await readImage(bytes, mime, {
      prefer: "gemini",
      prompt: OCCLUSION_VISION_PROMPT,
      signal: AbortSignal.timeout(VISION_BUDGET_MS),
      spend: { admin, scope: { operation: "figure-occlusion" }, userId: check.userId },
    });
    if (!seen?.text) {
      lastRefusal = "vision-failed";
      continue;
    }

    const boxes = parseSuggestedBoxes(jsonFrom(seen.text));
    if (boxes.length === 0) {
      lastRefusal = "no-labelled-parts";
      continue;
    }
    // 🔴 REFUSE A WRONG-SCALE REPLY RATHER THAN RESCALING IT. Models answer this in 0-1, 0-100 and
    // 0-1000 depending on the day, and guessing wrong puts every mask confidently in the wrong
    // place.
    if (!looksNormalized(boxes)) {
      lastRefusal = "wrong-scale";
      continue;
    }
    // 🔴🔴🔴 THE GATE THE OWNER ASKED FOR. A picture whose parts are numbered, or which names too
    // few of them, is not a picture you can be tested on — so it is REJECTED and the next
    // candidate is read instead.
    const quality = labelQuality(boxes);
    if (!quality.usable) {
      lastRefusal = "unlabelled-picture";
      continue;
    }

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

  // Every candidate was read and none of them could be asked about.
  return refuse(admin, key, lastRefusal);
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
const DURABLE_REFUSALS = new Set([
  "no-candidates",
  "no-trusted-asset",
  "no-labelled-parts",
  "vision-off",
  // 🔴 "every picture for this subject is a numbered-key diagram" is a fact about what the
  // repositories hold, not a hiccup. Re-reading three pictures on every ask to rediscover it is
  // exactly the waste the cache exists to stop.
  "unlabelled-picture",
]);

/** Record why no diagram, and say so. */
async function refuse(admin: SupabaseClient, key: string, reason: string, detail?: string): Promise<NextResponse> {
  const answer: FigureOcclusionAnswer = { ok: false, reason, ...(detail ? { detail } : {}) };
  if (DURABLE_REFUSALS.has(reason)) await writeCache(admin, key, answer);
  return NextResponse.json(answer, { status: 200 });
}
