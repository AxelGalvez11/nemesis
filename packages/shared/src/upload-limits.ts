/**
 * How large an uploaded source may be — ONE number, for every surface.
 *
 * 🔴 THIS LIVES HERE BECAUSE IT WAS WRONG IN FOUR PLACES AT ONCE. The web route
 * said 25 MB, the web notebook dialog told students "up to 25 MB", the phone's
 * own gate said 25 MB, and the phone's refusal sentence had "25 MB" typed into
 * the prose twice. The real ceiling was ~4.5 MB, imposed by Vercel on the
 * request body before any of that code ran — so every one of those numbers was
 * confidently wrong, and a student who read the label and picked a 12 MB lecture
 * waited through an upload that could never have succeeded.
 *
 * A limit that appears in more than one file will eventually disagree with
 * itself. Import it; never retype it.
 *
 * Both the web app and the Expo app depend on @nemesis/shared, so this is the
 * one module both can reach. Pure, no imports.
 */

/**
 * The product's upload ceiling.
 *
 * Matches the `library-sources` bucket's `file_size_limit`
 * (supabase/migrations/20260805080000_upload_ceiling_200mb.sql) exactly, so a
 * file that uploads can always be read and a file that would fail to upload is
 * refused before the transfer starts rather than after it.
 *
 * WHY 200 MiB. A real PHCY lecture — 37 ordinary slides — weighs 118.1 MiB,
 * because its 57 embedded TIFFs are uncompressed pixels sitting inside zip
 * entries that were never deflated either. Re-deflating the identical bytes
 * takes it to 24.0 MiB, but a derivative can only be built from an original we
 * were allowed to keep, so the ceiling has to clear the ORIGINAL. 200 MiB clears
 * that lecture with headroom and still refuses a runaway file.
 *
 * 🔴 THIS IS A POLICY, NOT AN ARCHITECTURAL LIMIT, AND RAISING IT MUST NOT RAISE
 * ANYTHING ELSE. Nothing in the ingestion path reads it to decide HOW a file
 * travels: the bytes go browser → storage → server either way, and the server
 * reads them back FROM storage. MAX_INLINE_UPLOAD_BYTES below stays at 4 MiB
 * because that one is the platform's, not ours. No handler may start buffering a
 * whole 200 MiB file in memory because this number moved. Past a few hundred
 * megabytes the PARSE, not the transport, is the wall — see
 * docs/document-intelligence.md §7.
 *
 * 🔴 THERE IS A THIRD CEILING ABOVE THIS ONE AND IT IS NOT IN THE DATABASE.
 * Supabase enforces a PROJECT-WIDE upload limit that caps every bucket
 * regardless of the bucket's own `file_size_limit`, and no migration can move
 * it — it lives in the dashboard under Project Settings → Storage → "Upload file
 * size limit". It was 50 MiB while this bucket's row already read 200, so the
 * bucket agreed and uploads still failed.
 *
 * Raised by the owner and RE-PROBED against production 2026-08-05, because a
 * dashboard save is not evidence that anything propagated:
 *
 *     55 MiB → 200 OK      190 MiB → 200 OK
 *    100 MiB → 200 OK      199 MiB → 200 OK
 *    150 MiB → 200 OK      205 MiB → 413 EntityTooLarge
 *
 * All three now agree at 200 MiB. The real 118.1 MiB lecture uploads in 21 s and
 * comes back with an IDENTICAL sha256, so the round trip is byte-exact.
 *
 * If uploads ever start failing below this number again, check that project
 * setting FIRST: it is the only one of the three that no code in this repository
 * can see, and it fails as a 413 that names the object rather than the setting.
 */
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

/**
 * Most a file may weigh and still be sent as a multipart request body.
 *
 * A PLATFORM limit, not a product one: Vercel refuses a larger body at the edge,
 * as plain text a JSON client cannot even parse. Set below the real ~4.5 MB edge
 * so our own error wins the race and says something true. Anything above this
 * must be uploaded to storage and passed by reference.
 */
export const MAX_INLINE_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * The ceiling as a student should read it: a whole number of megabytes.
 *
 * Deliberately NOT the same formatter used for a file's own size — "the limit is
 * 50.0 MB" reads like a measurement rather than a rule, while "your file is
 * 12.4 MB" should keep its decimal because it is one.
 */
export function maxSourceLabel(): string {
  return `${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)} MB`;
}
