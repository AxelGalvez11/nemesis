// Suggesting occlusion masks for a slide or diagram.
//
// A SIBLING of /api/notebooks/extract/file, deliberately not a mode on it. That
// route is the single chokepoint for Library import, notebook upload and chat
// attachments on both clients; adding a branch to it puts three working lanes at
// risk for one new one. This route shares its auth, its size limit and its
// vision helper, and owns nothing else.
//
// 🔴 IT RETURNS FRACTIONS, NOT PIXELS, AND NEVER THE IMAGE'S SIZE. Masks are
// stored in natural image pixels, but a vision model does not reliably know how
// wide an image is — it will invent 1024 for a 3024-wide photo. The client
// measures the real image and multiplies. See packages/shared/occlusion-suggest.
import { NextResponse } from "next/server";

import { bearerFrom, verifyDeviceKey } from "@/lib/device-key";
import { readWithVision, visionConfigured, visionMime, VISION_MAX_BYTES } from "@/lib/vision/gemini";
import {
  jsonFrom,
  looksNormalized,
  OCCLUSION_VISION_PROMPT,
  parseSuggestedBoxes,
} from "@nemesis/shared";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  // Same gate as the extract route, and for the same reason: this route forwards
  // the header nowhere, so this line is the only thing between a made-up string
  // and a Gemini bill on our key.
  const check = await verifyDeviceKey(bearerFrom(req.headers.get("authorization")));
  if (!check.ok) {
    return check.reason === "unavailable"
      ? NextResponse.json({ error: "Can't check this device right now. Try again in a moment." }, { status: 503 })
      : NextResponse.json({ error: "This device needs to re-connect to your account. Try again." }, { status: 401 });
  }

  if (!visionConfigured()) {
    return NextResponse.json(
      { error: "Reading images isn't switched on for this workspace yet." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Couldn't read that upload. Try again." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image was attached." }, { status: 400 });
  }
  const mime = visionMime(file.name, file.type);
  if (!mime) {
    return NextResponse.json({ error: "That file isn't an image Nemesis can look at." }, { status: 415 });
  }
  if (file.size > VISION_MAX_BYTES) {
    return NextResponse.json({ error: "That image is too large to read. Try a smaller one." }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const seen = await readWithVision(bytes, mime, { prompt: OCCLUSION_VISION_PROMPT });
  if (!seen?.text) {
    return NextResponse.json({ error: "Couldn't read that image. Try again." }, { status: 502 });
  }

  const boxes = parseSuggestedBoxes(jsonFrom(seen.text));
  if (boxes.length === 0) {
    // A real answer, not a failure: plenty of images have nothing worth hiding.
    return NextResponse.json({ boxes: [], note: "No labelled parts to hide were found in that image." });
  }
  // 🔴 REFUSE A RESPONSE IN THE WRONG SCALE rather than trying to rescale it.
  // Models answer this in 0–1, 0–100 and 0–1000 depending on the day, and
  // guessing wrong puts every mask confidently in the wrong place — which the
  // student reads as "this feature does not work". One retry is cheaper.
  if (!looksNormalized(boxes)) {
    return NextResponse.json(
      { error: "The reading came back in the wrong units. Try that image again." },
      { status: 502 },
    );
  }
  return NextResponse.json({ boxes });
}
