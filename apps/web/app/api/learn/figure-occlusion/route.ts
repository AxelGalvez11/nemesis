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

import { bearerFrom, verifyDeviceKey } from "@/lib/device-key";
import { allowedAssetUrl, findReferenceImages } from "@/lib/learn/reference-images";
import { REFERENCE_REGISTRY } from "@/lib/learn/reference-registry";
import { REFERENCE_SHELF } from "@/lib/learn/reference-shelf";
import { chooseAsset } from "@/lib/learn/visual-provenance";
import { imageSize } from "@/lib/notebooks/image-dimensions";
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
    return NextResponse.json({ detail: choice.detail, ok: false, reason: choice.reason }, { status: 200 });
  }

  const { assetPath } = choice.asset;
  // Belt and braces: `chooseAsset` already refuses anything unlicensed, and this refuses anything
  // off the allow list before our server fetches it.
  if (!allowedAssetUrl(assetPath)) {
    return NextResponse.json({ ok: false, reason: "no-trusted-asset" }, { status: 200 });
  }

  let bytes: Uint8Array;
  let contentType: string;
  try {
    const picture = await fetch(assetPath, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!picture.ok) return NextResponse.json({ ok: false, reason: "image-unreachable" }, { status: 200 });
    const buffer = await picture.arrayBuffer();
    // 🔴 CHECKED AFTER THE DOWNLOAD, BECAUSE Content-Length IS OPTIONAL. A repository that streams
    // without one would otherwise walk straight past a size gate keyed on the header.
    if (buffer.byteLength > VISION_MAX_BYTES) {
      return NextResponse.json({ ok: false, reason: "image-too-large" }, { status: 200 });
    }
    bytes = new Uint8Array(buffer);
    contentType = picture.headers.get("content-type") ?? "";
  } catch {
    return NextResponse.json({ ok: false, reason: "image-unreachable" }, { status: 200 });
  }

  const mime = visionMime(assetPath, contentType);
  if (!mime) return NextResponse.json({ ok: false, reason: "image-unreadable" }, { status: 200 });

  // 🔴🔴 THE SIZE IS MEASURED FROM THE BYTES, NEVER ASKED OF THE MODEL. `OCCLUSION_VISION_PROMPT`
  // explicitly tells it "Do NOT report the image's size", because it does not reliably know and
  // will confidently say 1024 for a 3024-wide picture — which puts every mask somewhere wrong in
  // a way that reads to the learner as "this feature is broken". Reading the header costs nothing
  // and is the only trustworthy source.
  const size = imageSize(bytes);
  if (!size) return NextResponse.json({ ok: false, reason: "image-unreadable" }, { status: 200 });

  const seen = await readImage(bytes, mime, {
    prompt: OCCLUSION_VISION_PROMPT,
    spend: { admin: adminClient(), scope: { operation: "figure-occlusion" }, userId: check.userId },
  });
  if (!seen?.text) return NextResponse.json({ ok: false, reason: "vision-failed" }, { status: 200 });

  const boxes = parseSuggestedBoxes(jsonFrom(seen.text));
  // A real answer, not a failure: most pictures are not labelled diagrams, and saying so lets the
  // caller fall back to showing the picture plainly rather than retrying.
  if (boxes.length === 0) return NextResponse.json({ ok: false, reason: "no-labelled-parts" }, { status: 200 });
  // 🔴 REFUSE A WRONG-SCALE REPLY RATHER THAN RESCALING IT. Models answer this in 0-1, 0-100 and
  // 0-1000 depending on the day, and guessing wrong puts every mask confidently in the wrong place.
  if (!looksNormalized(boxes)) return NextResponse.json({ ok: false, reason: "wrong-scale" }, { status: 200 });

  return NextResponse.json({
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
  });
}
