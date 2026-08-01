import * as FileSystem from "expo-file-system/legacy";
import {
  droppedSummary,
  looksNormalized,
  parseSuggestedBoxes,
  scaleBoxes,
  type OcclusionShape,
} from "@nemesis/shared";
import { APP_API_BASE, deviceKey } from "./chat";

export interface SuggestedMasks {
  shapes: OcclusionShape[];
  /** One line about anything skipped, or "" when nothing was. Shown, never swallowed. */
  note: string;
}

export class OcclusionSuggestError extends Error {}

/**
 * Ask the server to find the labelled parts of a picture and hand back masks.
 *
 * 🔴 THE SIZES PASSED IN ARE THE MEASURED ONES. `width`/`height` come from the
 * editor, which loaded the actual image — never from the model, which does not
 * reliably know how many pixels wide a photo is. The server returns fractions
 * of the image and this multiplies them. Getting that backwards puts every mask
 * in the wrong place and looks like the feature simply not working.
 */
export async function suggestOcclusionMasks(
  uid: string,
  uri: string,
  width: number,
  height: number,
  makeId: (index: number) => string,
  /** The picture's real content type — JPEG unless it came from Files as a PNG.
   *  The reader is handed the bytes with this label, and a PNG announced as a
   *  JPEG is a read that fails for a reason nothing on screen could explain. */
  mime = "image/jpeg",
): Promise<SuggestedMasks> {
  const key = await deviceKey(uid);
  if (!key) throw new OcclusionSuggestError("This device needs to re-connect to your account. Try again.");

  let response: { status: number; body: string };
  try {
    response = await FileSystem.uploadAsync(`${APP_API_BASE}/api/study/occlusion`, uri, {
      fieldName: "file",
      headers: { Authorization: `Bearer ${key}` },
      httpMethod: "POST",
      mimeType: mime,
      parameters: {},
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    });
  } catch {
    throw new OcclusionSuggestError("Couldn't reach the reader. Check your connection and try again.");
  }

  const parsed = (() => {
    try {
      return JSON.parse(response.body) as { boxes?: unknown; error?: string; note?: string };
    } catch {
      return null;
    }
  })();
  if (response.status !== 200 || !parsed) {
    // The route writes student-readable errors, so they surface as-is.
    throw new OcclusionSuggestError(parsed?.error ?? "Couldn't read that image. Try again.");
  }

  const boxes = parseSuggestedBoxes(parsed.boxes);
  if (boxes.length === 0) {
    return { note: parsed.note ?? "Nothing to hide was found in that image.", shapes: [] };
  }
  // Checked again on the client: the server already refuses a wrong-scale
  // response, and this is the line that keeps that true if the route ever
  // changes underneath a shipped app.
  if (!looksNormalized(boxes)) {
    throw new OcclusionSuggestError("The reading came back in the wrong units. Try that image again.");
  }
  const { dropped, shapes } = scaleBoxes(boxes, width, height, makeId);
  return { note: droppedSummary(dropped), shapes };
}
