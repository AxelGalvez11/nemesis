// Reading a photo or drawing of a learner's handwritten or hand-drawn work.
//
// A SIBLING of /api/study/occlusion, deliberately: same shape (auth, size limit, vision helper),
// different prompt and a different parser, because the job is the same kind of thing — turn one
// uploaded image into a structured, ungraded observation — over a different subject.
//
// 🔴 AUTH IS BEARER, NOT DEVICE-KEY. /api/study/occlusion uses verifyDeviceKey because it serves
// the mobile app directly. This route is called from the web Canvas composer, a signed-in
// workspace session, which is exactly what /api/v1/library/search authenticates with — so this
// route matches that, not the mobile route it otherwise resembles.
//
// 🔴 THIS ROUTE NEVER RETURNS A VERDICT. Its only job is to hand back what analyzeHandwriting
// produced — a HandwritingObservation, optionally with ElementMatch rows if the caller supplied
// expected elements to match against. Deciding what any of it MEANS for the learner is not done
// here, is not done in lib/handwriting, and is explicitly out of scope for this change — see the
// handoff notes in the task report.
import { NextResponse } from "next/server";

import { analyzeHandwriting } from "@/lib/handwriting/vision";
import { matchExpectedElements } from "@/lib/handwriting/match-elements";
import { verifyBearer } from "@/lib/server";
import { visionConfigured, visionMime, VISION_MAX_BYTES } from "@/lib/vision/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

/** How many expected elements one request may ask to match — a defensive cap, the same reasoning
 *  as every other list ceiling in this codebase (MAX_SUGGESTED_BOXES, MAX_ITEMS). */
const MAX_EXPECTED_ELEMENTS = 30;

function parseExpectedElements(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .slice(0, MAX_EXPECTED_ELEMENTS);
}

export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });

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
  const observation = await analyzeHandwriting(bytes, mime);
  // null is the infra-failure path (unconfigured, oversized, provider outage) — distinct from a
  // real, structured abstention, which is a 200 with `observation.abstained === true`.
  if (!observation) {
    return NextResponse.json({ error: "Couldn't read that image. Try again." }, { status: 502 });
  }

  const expectedElements = parseExpectedElements(form.get("expectedElements"));
  const matches = expectedElements.length > 0 ? matchExpectedElements(observation, expectedElements) : [];

  return NextResponse.json({ matches, observation });
}
