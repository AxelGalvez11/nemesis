// The pure half of "take a photo of it" (owner 2026-07-24: "need to add option
// for camera — taking photo should be analyzed and even saved to library if
// it's a note"). Object paths, note bodies, titles, and the error lines the
// student actually reads. No react-native imports — Deno-tests like the rest of
// src/lib; the I/O half lives in api/photos.ts.

/** Private bucket created by 20260724210000_library_images_bucket.sql. Its RLS
 *  policies key on the FIRST path segment being the user id, so every object
 *  path here has to start with the uid or the upload is refused. */
export const PHOTO_BUCKET = "library-images";

/**
 * Where one photograph lives.
 *
 * `<uid>/<uuid>.jpg` — the uid first because that is literally what the bucket
 * policy checks, and a uuid rather than a name because two photos of the same
 * whiteboard taken a minute apart must not collide.
 */
export function photoObjectPath(uid: string, id: string): string {
  return `${uid}/${id}.jpg`;
}

/**
 * How long the URL baked into a note stays good: one year.
 *
 * The bucket is private, so the picture is reached through a signed URL, and a
 * signed URL has an expiry. The study surface signs for an hour because it
 * signs at render time, every time. A NOTE is different — its body is written
 * once and read for as long as the student keeps it, so an hour-long URL would
 * mean a note whose picture is a broken box by dinnertime, permanently, with no
 * way to tell from the text that anything was lost.
 *
 * A year-long signed URL is a capability: whoever holds it can fetch that one
 * object, and nothing else — the bucket still refuses listing, and a URL for
 * someone else's object cannot be minted at all, because the phone signs with
 * the student's own session under the same policies. That is a real trade
 * against a fully private read, made deliberately, and it beats the alternative
 * of writing a URL that is guaranteed to rot.
 */
export const PHOTO_URL_TTL_SECONDS = 365 * 24 * 60 * 60;

/** The largest photo we will try to send. EQUAL to the bucket's file_size_limit
 *  and to VISION_MAX_BYTES on the server, so the three agree: anything that
 *  uploads can be read, and anything too big is refused here with a sentence
 *  about the photo rather than an HTTP number from two layers away. */
export const PHOTO_MAX_BYTES = 14 * 1024 * 1024;

/** Longest title we will lift out of what the picture said. A transcript's
 *  first line can be a whole paragraph; a note list needs a name. */
const TITLE_MAX_CHARS = 60;

/**
 * A note title from the server's reading of the picture.
 *
 * The server derives it from the transcript (a camera filename is worthless),
 * but the transcript is prose written by whoever wrote on the whiteboard, so it
 * arrives with heading marks, list bullets, trailing colons and any length at
 * all. This is the part that has to survive being turned into a FILE PATH:
 * library notes are stored at `Folder/Title.md`, so a title carrying a slash
 * would silently create a folder.
 */
export function photoNoteTitle(raw: string | null | undefined): string {
  const stripped = (raw ?? "")
    .replace(/^\s*#{1,6}\s*/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/[\\/:]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim();
  // A line of pure punctuation ("###", "---") is markdown furniture, not a
  // name — and a note called "###" is worse than one called "Photo note".
  if (!/[\p{L}\p{N}]/u.test(stripped)) return "Photo note";
  if (stripped.length <= TITLE_MAX_CHARS) return stripped;
  // Cut on a word boundary when there is one near the limit, so a title reads
  // like a phrase rather than a truncation.
  const cut = stripped.slice(0, TITLE_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > TITLE_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * The note body: the photograph, then what it said.
 *
 * The picture goes FIRST and stays in the note for good. A transcript alone
 * would be a note the student cannot check — machine reading of handwriting is
 * wrong sometimes, and the only way to see that it is wrong is to look at the
 * original. Keeping the image is also the whole reason the storage bucket
 * exists; a note that dropped it would make the upload pointless.
 */
export function photoNoteBody(text: string, imageUrl: string, storagePath = ""): string {
  const body = text.trim();
  const url = imageUrl.trim();
  const path = storagePath.trim();
  // The object path rides in the image's TITLE, which is the one place markdown
  // has for a caption that no renderer draws: markdown-it puts it on the <img>
  // as an attribute, and react-native-markdown-display ignores it entirely. An
  // HTML comment would have been the obvious hiding place and is the wrong one —
  // the phone's parser runs with `html: false`, so `<!-- … -->` would print on
  // screen as literal text.
  //
  // It is here because the URL above it has an EXPIRY. A signed URL is the only
  // way a private bucket can be read by a plain markdown renderer, and one that
  // lasts a year still ends. Without the path recorded, a URL that stops
  // resolving is unrecoverable — nothing would say which object it pointed at,
  // and the note would be permanently holding a broken image with no way back.
  // With it, re-signing is a lookup.
  const image = url ? `![Photo](${url}${path ? ` "${path.replace(/"/g, "")}"` : ""})` : "";
  return [image, body].filter(Boolean).join("\n\n") + "\n";
}

/** The bucket object path recorded by photoNoteBody, if this note has one.
 *  The inverse of the title trick above — what a re-signer would call. */
export function photoPathInNote(body: string): string | null {
  const match = /^!\[Photo\]\([^)\s]+\s+"([^"]+)"\)/m.exec(body);
  return match ? match[1] : null;
}

/** What the chat turn carries: the same transcript, under a title that says
 *  where it came from, so the model is not told a photo is a Library note. */
export function photoAttachmentTitle(title: string): string {
  return `Photo: ${title}`;
}

/**
 * One student-readable line for a failed upload.
 *
 * Storage answers with bare HTTP, and "413" on a screen is not an explanation.
 * 401/403 is the same self-repairing device-key story the chat wire tells, so
 * it uses the same words.
 */
export function photoUploadError(status: number): string {
  if (status === 401 || status === 403) return "This device needs to re-connect to your account. Try again — it repairs itself.";
  if (status === 413) return "That photo is too large to send.";
  if (status === 415) return "That photo is in a format the app can't read.";
  if (status >= 500) return "Couldn't reach storage right now. Try again in a moment.";
  return "Couldn't save that photo. Try again.";
}

/** The canned question a photo asks when the student typed nothing. Open on
 *  purpose: the picture could be a slide, a page, a diagram or a broken piece of
 *  lab equipment, and a narrower prompt would tell the model what to see. */
export const PHOTO_ANALYSIS_ASK = "Read this photo and explain what it shows.";

/**
 * What a turn actually asks, given what was typed and whether a photo is riding
 * along.
 *
 * This rule used to live inside the camera handler, because a photo SENT ITSELF
 * the moment it was taken and that handler was the only place a turn could be
 * built from a picture. The photo now attaches and waits (owner 2026-07-30,
 * matching ChatGPT), so the rule moved to the send path — and moving it is
 * exactly the kind of change that quietly loses a case, hence the tests.
 *
 * Two things it has to keep true: a student's own words always beat the canned
 * ask, and a photo with an empty composer is still a real question rather than a
 * dead button.
 */
export function photoTurnText(typed: string, photoAttached: boolean): string {
  const clean = typed.trim();
  if (clean) return clean;
  return photoAttached ? PHOTO_ANALYSIS_ASK : "";
}
