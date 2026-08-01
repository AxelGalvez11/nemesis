// Choosing a picture off the phone for image cloze, rather than only taking one
// (owner 2026-07-31: "allow users to choose photos from photo gallery or files").
//
// FILES, NOT THE PHOTO LIBRARY, AND THAT IS A DELIBERATE HALF. Reaching the
// gallery means expo-image-picker, which is a NATIVE module: adding one changes
// the app's runtime fingerprint, so build 26 would stop receiving over-the-air
// updates entirely and every other fix would sit behind a TestFlight release.
// expo-document-picker is already in the build (the chat's "Add a file" uses it),
// so this half ships today. The owner chose that trade on 2026-07-31; the gallery
// is queued behind the next native build.
//
// Pure on purpose — the picker call itself lives in the sheet, the rules live
// here where they can be tested. Same split as lib/document-kind.ts.

/** What the system picker will offer. JPEG and PNG only: everything downstream —
 *  the storage upload, the vision reader, and both apps' renderers — is written
 *  for those two, and a HEIC that uploaded and then rendered as a broken box
 *  would be a worse answer than not offering it. */
export const STUDY_IMAGE_PICKER_TYPES = ["image/jpeg", "image/png"] as const;

/** Shown verbatim when the picked file is not one we can use. */
export const STUDY_IMAGE_REFUSAL = "Pick a JPEG or PNG image.";

/**
 * The content type to upload a picked image under, or null to refuse it.
 *
 * 🔴 THE UPLOAD USED TO SAY image/jpeg NO MATTER WHAT, because the only source
 * was the camera and the camera only makes JPEGs. A PNG stored under a JPEG
 * content type is a picture that may or may not draw depending on which client
 * opens it, which is exactly the kind of failure nobody can reproduce.
 *
 * The picker's own `mimeType` is trusted first and the file extension is the
 * fallback: iOS fills that field reliably, other providers sometimes do not.
 */
export function pickedImageMime(fileName: string, declared?: string | null): string | null {
  const clean = (declared ?? "").trim().toLowerCase();
  if (clean === "image/jpeg" || clean === "image/jpg") return "image/jpeg";
  if (clean === "image/png") return "image/png";
  const ext = /\.([a-z0-9]+)$/.exec(fileName.trim().toLowerCase())?.[1] ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return null;
}

/** The extension the stored object should carry, so the file in the bucket
 *  matches what is actually in it. */
export function imageExtensionFor(mime: string): string {
  return mime === "image/png" ? "png" : "jpg";
}
