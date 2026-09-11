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
// The LEGACY entry point, same as photos.ts. `uploadAsync` and the
// `FileSystemUploadType` enum it needs live only there — the SDK 54 rewrite of
// expo-file-system dropped them from the main export, so importing the modern
// one type-errors on the enum and would fail at runtime on the call.
import * as FileSystem from "expo-file-system/legacy";

import { APP_API_BASE, deviceKey } from "./chat";
import { fileLibrarySource } from "./librarySources";
import { supabase } from "./supabase";
// The app's own uuid helper — Math.random based, honestly documented as such,
// and already what the photo upload names its objects with. Deliberately reused
// rather than reaching for `crypto.getRandomValues`, which React Native does not
// guarantee and which would throw at the moment a student picks a file.
import { MAX_INLINE_UPLOAD_BYTES } from "@nemesis/shared";

import { generateUuidV4 } from "@/lib/chat-threads";
import {
  DOCUMENT_PICKER_TYPES,
  documentChipTitle,
  documentMime,
  documentRefusal,
} from "@/lib/document-kind";
import type { DocumentModel, ExtractionCoverage } from "@nemesis/shared";

/** A message already written for the student — surfaced as-is, never wrapped. */
export class DocumentError extends Error {}

export interface ReadDocument {
  /** What the chip shows: the file's own name. */
  title: string;
  /** The extracted text, already structured by the server's reader. */
  text: string;
  /**
   * Widened for canvas attachment (api/canvas-sources.ts), additive — every field below is new
   * and every existing caller of `pickAndReadDocument` still gets exactly what it got before.
   *
   * The parser's own title line — the route's `title`, before `documentChipTitle` throws it away
   * for a name derived purely from the filename. `title` above stays the chip label; this is what
   * `documentTitle(extractedTitle, name)` needs to build a `CanvasSource` the way the web does.
   */
  extractedTitle: string | null;
  /** Whatever the extractor reported — "pdf" | "docx" | "pptx" | "image" — or absent. */
  kind?: string;
  coverage?: ExtractionCoverage;
  model?: DocumentModel;
  /** The `library_sources.id` this reached, when filing worked — the same id `uploadDocument`
   *  already computes, now handed back instead of only used internally. */
  librarySourceId: string | null;
  /** The picked asset's own identity, for building a `PendingAttachmentItem` without re-picking. */
  uri: string;
  /** The RAW file name, extension and all — never `title` (already humanized) or
   *  `extractedTitle` (the parser's own line). This is `file.name` in the web's
   *  `documentTitle(extracted.title, file.name)`; passing the chip title here instead would
   *  double-humanize a name `documentTitle` already knows how to read. */
  name: string;
  size: number | null;
  mimeType: string;
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

  const read = await readDocumentText(uid, asset.uri, asset.name, mime, asset.size ?? null);
  return {
    ...read,
    title: documentChipTitle(asset.name),
  };
}

/**
 * Put the file in the student's own storage and file the row that names it.
 *
 * 🔴 THIS IS WHY A LECTURE DECK NOW WORKS AT ALL. The old path POSTed the file's
 * bytes to the extract route, and Vercel refuses a request body over ~4.5 MB
 * before any of our code runs — so a normal 5-to-30 MB lecture PDF never
 * arrived and the student was told "Couldn't read that file. Try again."
 *
 * Returns the row id, or null when the upload could not be done — including the
 * case this lane never had to think about before: the document picker only ever
 * needed a DEVICE KEY, so a phone whose Supabase session has expired could still
 * read documents. It still can, via the multipart fallback, for anything small.
 */
async function uploadDocument(uid: string, uri: string, name: string, mime: string): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session || session.user.id !== uid) return null;

    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) throw new DocumentError("That file is no longer on this phone.");

    const extension = name.toLowerCase().match(/\.(pdf|docx|pptx)$/)?.[1] ?? "";
    const storagePath = `${uid}/${generateUuidV4()}${extension ? `.${extension}` : ""}`;
    const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
    // Streams from disk rather than reading the file into a base64 string, the
    // same reason the photo and recording uploads do it this way.
    const upload = await FileSystem.uploadAsync(`${base}/storage/v1/object/library-sources/${storagePath}`, uri, {
      headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": mime },
      httpMethod: "POST",
    });
    if (upload.status !== 200) return null;

    return await fileLibrarySource(uid, {
      bucket: "library-sources",
      fileName: name,
      mime,
      sizeBytes: info.size,
      storagePath,
    });
  } catch (cause) {
    if (cause instanceof DocumentError) throw cause;
    return null;
  }
}

/** Read the file, by reference when we could store it, by value when we could not. Returns
 *  everything `ReadDocument` promises except the chip `title` — the caller (`pickAndReadDocument`)
 *  fills that in from the file name, the one thing it knows that this function does not. */
async function readDocumentText(
  uid: string,
  uri: string,
  name: string,
  mime: string,
  size: number | null,
): Promise<Omit<ReadDocument, "title">> {
  const key = await deviceKey(uid);
  // Same gate as the camera: the route checks a `nmk_` device key, NOT the Supabase
  // access token. Sending the session token 401s every time and the message would
  // blame the file.
  if (!key) throw new DocumentError("This device needs to re-connect to your account. Try again.");

  const sourceId = await uploadDocument(uid, uri, name, mime);
  // No reference AND too big to post directly: say the real reason rather than
  // letting the platform answer with something the app cannot even parse.
  if (!sourceId && size !== null && size > MAX_INLINE_UPLOAD_BYTES) {
    throw new DocumentError("Sign in again to add a file this large.");
  }

  let response: { status: number; body: string };
  try {
    if (sourceId) {
      const sent = await fetch(`${APP_API_BASE}/api/notebooks/extract/file`, {
        body: JSON.stringify({ sourceId }),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        method: "POST",
      });
      response = { body: await sent.text(), status: sent.status };
    } else {
      response = await FileSystem.uploadAsync(`${APP_API_BASE}/api/notebooks/extract/file`, uri, {
        fieldName: "file",
        headers: { Authorization: `Bearer ${key}` },
        httpMethod: "POST",
        mimeType: mime,
        parameters: { filename: name },
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      });
    }
  } catch {
    throw new DocumentError("Couldn't reach the reader. Check your connection and try again.");
  }

  const parsed = (() => {
    try {
      return JSON.parse(response.body) as {
        text?: string;
        title?: string;
        error?: string;
        kind?: string;
        coverage?: ExtractionCoverage;
        model?: DocumentModel;
      };
    } catch {
      return null;
    }
  })();
  if (response.status !== 200 || !parsed?.text) {
    // The route writes student-readable errors ("This PDF has no selectable text…",
    // "That file is too large (25 MB max)."), so they surface unchanged.
    throw new DocumentError(parsed?.error ?? "Couldn't read that file. Try again.");
  }
  return {
    coverage: parsed.coverage,
    extractedTitle: parsed.title ?? null,
    kind: parsed.kind,
    librarySourceId: sourceId,
    mimeType: mime,
    name,
    model: parsed.model,
    size,
    text: parsed.text,
    uri,
  };
}
