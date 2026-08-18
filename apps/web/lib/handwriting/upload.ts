// Is this uploaded thing an image Nemesis can look at, and is it small enough to send?
//
// 🔴 ONE CHECK, TWO ROUTES, BECAUSE A PER-DOOR CAPABILITY LIST IS THIS CODEBASE'S NAMED DRIFT.
// `canvas-composer.tsx`'s own comment records the last time this happened: the Sources panel and
// the front door accepted spreadsheets while the composer refused them, so one control told a
// learner their file was unsupported and another told them it was fine. `/api/handwriting/analyze`
// and `/api/handwriting/work` take the same uploads for the same reason, and a copy of this logic
// in each is the same defect waiting to be introduced by whichever one is edited next.
//
// 🔴 THE ERROR STRINGS ARE PART OF THE CONTRACT, NOT DECORATION. They are shown to the learner
// verbatim by the capture surface, so they are plain, carry no em dash, and say what to do next.

import { visionMime, VISION_MAX_BYTES } from "@/lib/vision/gemini";

export type UploadCheck =
  | { ok: true; file: File; mime: string }
  | { ok: false; status: number; error: string };

/**
 * Whether one form field holds an image worth spending a vision call on. PURE, apart from reading
 * the `File`'s own metadata.
 *
 * 🔴 THE STATUS CODES ARE DIFFERENT ON PURPOSE — 400 for nothing attached, 415 for a file that is
 * not an image, 413 for one that is too big. A single 400 for all three would leave the surface
 * unable to say anything more useful than "that did not work", and "your photo is too large" is a
 * problem a learner can actually fix.
 */
export function checkImageUpload(value: FormDataEntryValue | null): UploadCheck {
  if (!(value instanceof File)) {
    return { error: "No image was attached.", ok: false, status: 400 };
  }
  const mime = visionMime(value.name, value.type);
  if (!mime) {
    return { error: "That file isn't an image Nemesis can look at.", ok: false, status: 415 };
  }
  if (value.size > VISION_MAX_BYTES) {
    return { error: "That image is too large to read. Try a smaller one.", ok: false, status: 413 };
  }
  return { file: value, mime, ok: true };
}
