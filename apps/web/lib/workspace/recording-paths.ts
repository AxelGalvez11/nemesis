// Every path a recording ever writes to, in one place.
//
// 🔴 THIS MODULE EXISTS BECAUSE THE CONTRACT WAS ENCODED IN TWO PLACES AND ONE OF THEM WAS
// WRONG. The `recordings` bucket's RLS is, on select, insert AND delete:
//
//     bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text
//
// So the FIRST path segment must be the caller's own id — that single rule is what stops one
// account reaching another's audio, and it is also what silently refuses a write that gets it
// wrong. The multipart uploader built its own paths as `parts/<session>/…`, whose first segment
// is the literal string "parts", and every part upload was therefore rejected by the database.
// Nothing surfaced: the capture loop treats a failed upload as something to retry, so the
// feature looked healthy and stored nothing at all.
//
// The lesson is not "that one function had a bug". It is that a rule enforced by the database
// was being restated, by hand, in more than one file. So it is stated once, here, and every
// caller goes through it.
//
// 🔴 DO NOT BUILD A RECORDING PATH ANYWHERE ELSE. If a new one is needed, add it here so it
// inherits `ownerPrefix` and is covered by the test that asserts the first segment.

/** The one rule the bucket enforces. Everything below is built from it. */
function ownerPrefix(userId: string): string {
  const owner = userId.trim();
  if (!owner) {
    // A recording with no owner has nowhere it is allowed to go. Failing loudly here is far
    // better than writing to a path the database will refuse without telling anyone.
    throw new Error("A recording path needs the signed-in user's id.");
  }
  return owner;
}

/** Where one part of an in-progress recording lands.
 *
 *  Named arguments rather than positional: the previous signature was
 *  `(sessionId, index, extension)` and grew a `userId` at the front, which is exactly the shape
 *  of change that silently swaps two strings at a call site.
 *
 *  🔴 The sequence is ZERO-PADDED so a lexical listing is also the correct order. That is a
 *  SAFEGUARD, not the ordering rule — assembly sorts numerically by the manifest's sequence (see
 *  `assemblyOrder`). It matters because a recovery that ever falls back to listing storage would
 *  otherwise join part10 before part2, and the result still plays. */
export function recordingPartPath(input: {
  userId: string;
  recordingId: string;
  sequence: number;
  extension: string;
}): string {
  const sequence = String(Math.max(0, Math.trunc(input.sequence))).padStart(5, "0");
  return `${ownerPrefix(input.userId)}/recordings/${input.recordingId}/parts/${sequence}.${input.extension}`;
}

/** Where the assembled recording lands — the file the transcription pipeline is handed. */
export function recordingFinalPath(input: {
  userId: string;
  recordingId: string;
  extension: string;
}): string {
  return `${ownerPrefix(input.userId)}/recordings/${input.recordingId}/recording.${input.extension}`;
}

/** The folder holding one recording's parts, for a bulk delete. */
export function recordingPartsPrefix(input: { userId: string; recordingId: string }): string {
  return `${ownerPrefix(input.userId)}/recordings/${input.recordingId}/parts`;
}

/** Does this path satisfy the bucket's policy for this user?
 *
 *  The server re-checks with this because it reads using the service role, which BYPASSES the
 *  RLS above. A path taken from a request body is never trusted: without this check, naming
 *  someone else's object would hand back their audio. */
export function isOwnedPath(path: string, userId: string): boolean {
  const owner = userId.trim();
  return owner.length > 0 && path.split("/")[0] === owner;
}
