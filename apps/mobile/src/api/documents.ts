// Picking a lecture off the phone and getting its text back.
//
// This is the entry point the phone never had: the composer could attach a note that
// was ALREADY in the Library, or a photograph, but there was no way to hand it the
// PDF/Word/PowerPoint a lecturer actually distributes. Everything downstream of the
// upload already existed — /api/notebooks/extract/file reads all three kinds, and the
// text lands in the SAME one-shot attachment chip the Library picker and the camera
// fill, because a deck, a photograph and an attached note are the same thing once
// they are text (the shape settled by the camera work, owner 2026-07-24).
//
// Deliberately a near-copy of ./photos.ts's upload half rather than a shared helper:
// the two differ in picker, mime and error wording, and the photo path's comments
// record why each line is the way it is. The parts worth testing are pure and live in
// @/lib/document-kind.
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

import { APP_API_BASE, deviceKey } from "./chat";
import {
  DOCUMENT_PICKER_TYPES,
  documentChipTitle,
  documentMime,
  documentRefusal,
} from "@/lib/document-kind";

/** A message already written for the student — surfaced as-is, never wrapped. */
export class DocumentError extends Error {}

export interface ReadDocument {
  /** What the chip shows: the file's own name. */
  title: string;
  /** The extracted text, already structured by the server's reader. */
  text: string;
}

/**
 * Open the system file picker and return the chosen file's text, or null when the
 * student backed out. Refusals (wrong kind, too big) throw a DocumentError carrying
 * a sentence meant to be shown verbatim.
 */
export async function pickAndReadDocument(uid: string): Promise<ReadDocument | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    // Copying into the app's cache is what makes the URI readable by uploadAsync;
    // a raw provider URI from Files can be unreadable by the time we POST it.
    copyToCacheDirectory: true,
    multiple: false,
    type: [...DOCUMENT_PICKER_TYPES],
  });
  if (picked.canceled) return null;

  const asset = picked.assets?.[0];
  if (!asset) return null;

  const refusal = documentRefusal(asset.name, asset.size ?? null);
  if (refusal) throw new DocumentError(refusal);

  const mime = documentMime(asset.name);
  if (!mime) throw new DocumentError("Add a PDF, Word or PowerPoint file.");

  return {
    text: await readDocumentText(uid, asset.uri, asset.name, mime),
    title: documentChipTitle(asset.name),
  };
}

/** POST the file to the shared extract endpoint and get its text back. */
async function readDocumentText(uid: string, uri: string, name: string, mime: string): Promise<string> {
  const key = await deviceKey(uid);
  // Same gate as the camera: the route checks a `nmk_` device key, NOT the Supabase
  // access token. Sending the session token 401s every time and the message would
  // blame the file.
  if (!key) throw new DocumentError("This device needs to re-connect to your account. Try again.");

  let response: { status: number; body: string };
  try {
    response = await FileSystem.uploadAsync(`${APP_API_BASE}/api/notebooks/extract/file`, uri, {
      fieldName: "file",
      headers: { Authorization: `Bearer ${key}` },
      httpMethod: "POST",
      mimeType: mime,
      // A lecture deck is far bigger than a photo, so this is the one call in the
      // app where a slow connection is normal. The route itself caps at 25 MB.
      parameters: { filename: name },
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    });
  } catch {
    throw new DocumentError("Couldn't reach the reader. Check your connection and try again.");
  }

  const parsed = (() => {
    try {
      return JSON.parse(response.body) as { text?: string; title?: string; error?: string };
    } catch {
      return null;
    }
  })();
  if (response.status !== 200 || !parsed?.text) {
    // The route writes student-readable errors ("This PDF has no selectable text…",
    // "That file is too large (25 MB max)."), so they surface unchanged.
    throw new DocumentError(parsed?.error ?? "Couldn't read that file. Try again.");
  }
  return parsed.text;
}
