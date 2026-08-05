// Take a photograph of something and have the app read it (owner 2026-07-24:
// "need to add option for camera — taking photo should be analyzed and even
// saved to library if it's a note").
//
// The shape of this, and why it is this shape:
//
//  1. The picture is UPLOADED to a private per-user bucket, so it outlives the
//     phone's temporary camera file and can be shown in a note months later.
//  2. The picture is READ by the server's Gemini vision path, reached through
//     /api/notebooks/extract/file — the SAME endpoint the web app already uses
//     for PDFs and Word documents. There is no phone-only image route: one
//     chokepoint means one place where "how do we read a file" is answered.
//  3. What comes back is TEXT, and text is all the chat wire has ever carried.
//     The transcript rides the existing attachedDoc lane (chat-thread.ts's
//     buildAttachmentContext) exactly like an attached Library note, so nothing
//     in the metered valve had to learn about images at all.
//
// The picture is sent twice — once to storage, once to the extractor — rather
// than uploaded once and fetched back server-side. That costs a few megabytes
// on a good connection and buys a genuinely stateless extract route: it holds
// no service key, reads no bucket, and cannot be turned into a way to read
// somebody else's objects.
import * as FileSystem from "expo-file-system/legacy";
import { APP_API_BASE, deviceKey } from "./chat";
import { generateUuidV4 } from "@/lib/chat-threads";
import {
  PHOTO_BUCKET,
  PHOTO_MAX_BYTES,
  PHOTO_URL_TTL_SECONDS,
  photoNoteTitle,
  photoObjectPath,
  photoUploadError,
} from "@/lib/photo-note";
import { fileLibrarySource } from "./librarySources";
import { supabase } from "./supabase";

/** A photograph that has been stored and read. */
export interface ReadPhoto {
  /** Stable object path inside the bucket — the durable reference. Kept beside
   *  the URL so a future viewer can mint a fresh one without re-uploading. */
  storagePath: string;
  /** Signed URL good for a year (see PHOTO_URL_TTL_SECONDS) — what a note body
   *  and a chat thumbnail actually point at. */
  imageUrl: string;
  /** What the picture said. Never empty: an unreadable picture throws instead,
   *  so no caller has to handle a successful-but-blank read. */
  text: string;
  /** A title drawn from the transcript, safe to use as a note name. */
  title: string;
}

/** Thrown with a sentence a student can act on — every caller shows `message`
 *  directly, so there is no place where an HTTP number reaches the screen. */
class PhotoError extends Error {}

/**
 * Store one photograph and read it.
 *
 * Order matters: the upload happens FIRST. If reading fails (no light, nothing
 * written on the board, the vision provider having a bad minute) the picture is
 * already safe in the bucket, and a retry costs one request instead of two. The
 * reverse order would throw away a photograph the student may not be able to
 * take again — the lecturer has moved on.
 */
export async function storeAndReadPhoto(uid: string, uri: string): Promise<ReadPhoto> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.id !== uid) {
    throw new PhotoError("Sign in again to use the camera.");
  }

  // Checked here rather than left to storage's own 413: the bucket, the
  // server's vision ceiling and PHOTO_MAX_BYTES are deliberately one number, so
  // an oversized shot can be refused before a multi-megabyte upload starts.
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new PhotoError("That photo is no longer on this phone.");
  if (info.size > PHOTO_MAX_BYTES) throw new PhotoError(photoUploadError(413));

  const storagePath = photoObjectPath(uid, generateUuidV4());
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  // uploadAsync streams straight from disk rather than reading the file into a
  // base64 string first — same reason the recording upload does (api/chat.ts).
  const upload = await FileSystem.uploadAsync(`${base}/storage/v1/object/${PHOTO_BUCKET}/${storagePath}`, uri, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "image/jpeg",
    },
    httpMethod: "POST",
  });
  if (upload.status !== 200) throw new PhotoError(photoUploadError(upload.status));

  // Signed with the STUDENT's session, under the bucket's own policies — a URL
  // for someone else's object simply cannot be minted here.
  const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, PHOTO_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new PhotoError("Saved the photo, but couldn't open it. Try again.");
  }

  // 🔴 THE PICTURE IS NOT SENT TWICE ANY MORE. It used to be uploaded to the
  // bucket here and then uploaded AGAIN, in full, as a multipart body to the
  // extract route — the same megabytes over a phone connection, twice. Now the
  // bytes that are already in the bucket are simply NAMED: the row filed below
  // is the reference the route resolves. A phone photo of a lecture slide is
  // routinely over the ~4.5 MB the old multipart path could reach at all.
  const sourceId = await fileLibrarySource(uid, {
    bucket: PHOTO_BUCKET,
    fileName: photoFileName(storagePath),
    mime: "image/jpeg",
    sizeBytes: info.size,
    storagePath,
  });

  const read = await readPhotoText(uid, uri, sourceId);
  return { imageUrl: signed.data.signedUrl, storagePath, text: read.text, title: photoNoteTitle(read.title) };
}

/** A displayable name for a photo, whose object key is a bare uuid. */
function photoFileName(storagePath: string): string {
  return storagePath.split("/").pop() ?? "photo.jpg";
}

/**
 * Read the picture the extract endpoint already has.
 *
 * `sourceId` present: the route fetches the object from storage itself — no
 * upload, no size ceiling. Absent (the row could not be filed): fall back to
 * posting the bytes, which still works for a small photo and gives the student
 * a real answer instead of a failure.
 */
async function readPhotoText(
  uid: string,
  uri: string,
  sourceId: string | null,
): Promise<{ text: string; title: string | null }> {
  const key = await deviceKey(uid);
  // The route gates on a `nmk_` device key, NOT on the Supabase session token —
  // the same bearer the chat wire uses. Sending the access token here would 401
  // every time, and the message would blame the camera.
  if (!key) throw new PhotoError("This device needs to re-connect to your account. Try again.");

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
        mimeType: "image/jpeg",
        parameters: {},
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      });
    }
  } catch {
    throw new PhotoError("Couldn't reach the reader. Check your connection and try again.");
  }

  const parsed = (() => {
    try {
      return JSON.parse(response.body) as { text?: string; title?: string; error?: string };
    } catch {
      return null;
    }
  })();
  if (response.status !== 200 || !parsed?.text) {
    // The route writes student-readable errors ("Couldn't read anything in that
    // picture…", "Reading photos isn't switched on…"), so they surface as-is.
    // A non-JSON body means the platform answered, not us — say something true
    // rather than repeating a generic apology.
    throw new PhotoError(parsed?.error ?? photoUploadError(response.status));
  }
  return { text: parsed.text, title: parsed.title ?? null };
}
