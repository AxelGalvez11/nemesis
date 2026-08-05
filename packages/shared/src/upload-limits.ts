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
 * (supabase/migrations/20260804010000_library_sources_files.sql:67) exactly, so
 * a file that uploads can always be read and a file that would fail to upload is
 * refused before the transfer starts rather than after it.
 *
 * 🔴 THIS IS A POLICY, NOT AN ARCHITECTURAL LIMIT. Nothing in the ingestion path
 * reads it to decide HOW a file travels — the bytes go browser → storage →
 * server either way. Raising it means raising the bucket policy and, past a few
 * hundred megabytes, moving the PARSE off a 300-second function. The transport
 * already scales; the parse is the wall. See docs/document-intelligence.md §7.
 */
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

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
