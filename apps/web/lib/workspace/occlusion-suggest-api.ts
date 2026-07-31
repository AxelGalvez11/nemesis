import {
  droppedSummary,
  looksNormalized,
  parseSuggestedBoxes,
  scaleBoxes,
  type OcclusionShape,
} from "@nemesis/shared";

import { supabase } from "@/lib/supabase";
import { deviceKey } from "@/lib/workspace/chat-api";

export interface SuggestedMasks {
  shapes: OcclusionShape[];
  /** One line about anything skipped, or "" when nothing was. Shown, never swallowed. */
  note: string;
}

export class OcclusionSuggestError extends Error {}

/**
 * Ask the server to find the labelled parts of a picture and hand back masks.
 *
 * 🔴 `width`/`height` ARE THE MEASURED ONES — the editor loaded the image and
 * read its natural size. Never the model's idea of them: it does not reliably
 * know how many pixels wide a photo is, and believing it puts every mask
 * somewhere wrong in a way that reads as "this feature is broken".
 *
 * The user id is resolved here rather than passed in, so the editor component
 * does not have to hold one it otherwise never needs.
 */
export async function suggestOcclusionMasks(
  file: File,
  width: number,
  height: number,
  makeId: (index: number) => string,
): Promise<SuggestedMasks> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new OcclusionSuggestError("Sign in to read images.");
  const key = await deviceKey(uid);
  if (!key) throw new OcclusionSuggestError("This browser needs to re-connect to your account. Try again.");

  const body = new FormData();
  body.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/study/occlusion", {
      body,
      headers: { Authorization: `Bearer ${key}` },
      method: "POST",
    });
  } catch {
    throw new OcclusionSuggestError("Couldn't reach the reader. Check your connection and try again.");
  }

  const parsed = (await response.json().catch(() => null)) as
    | { boxes?: unknown; error?: string; note?: string }
    | null;
  if (!response.ok || !parsed) {
    throw new OcclusionSuggestError(parsed?.error ?? "Couldn't read that image. Try again.");
  }

  const boxes = parseSuggestedBoxes(parsed.boxes);
  if (boxes.length === 0) {
    return { note: parsed.note ?? "Nothing to hide was found in that image.", shapes: [] };
  }
  // Checked again client-side: the route already refuses a wrong-scale reply,
  // and this keeps that true if the route ever changes under a cached page.
  if (!looksNormalized(boxes)) {
    throw new OcclusionSuggestError("The reading came back in the wrong units. Try that image again.");
  }
  const { dropped, shapes } = scaleBoxes(boxes, width, height, makeId);
  return { note: droppedSummary(dropped), shapes };
}
