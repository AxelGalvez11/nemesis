/**
 * Every file extension Nemesis can read, in one place, with nothing imported.
 *
 * 🔴 THE DEFECT CLASS THIS DELETES: THE PICKER AND THE PARSER WERE TWO LISTS AND THEY DRIFTED.
 * `ACCEPTED_MATERIAL` (what the canvas file dialog offers), `LIBRARY_IMPORT_ACCEPT` (what the
 * Library dialog offers) and `kindFor` (what the server can actually read) were each written out
 * by hand. Every one of them has been wrong at least once, and the failure is invisible from the
 * inside:
 *
 *   - `.heif` was missing from the canvas list while the reader handled it, so the OS picker
 *     GREYED OUT half of a learner's camera roll. No request was made, no log line was written,
 *     nothing to find afterwards.
 *   - `.xlsx` went the other way: the parser learned spreadsheets, one door learned with it, and
 *     the door every interactive upload used kept answering 415. See `format-doors.test.ts`.
 *
 * Both directions are silent. A format offered but unreadable fails after the upload; a format
 * readable but unoffered can never be tried at all. So the list is written ONCE and everything
 * else is derived from it — `kindFor` decides with it, the pickers are built from it, and
 * `readable-formats.test.ts` holds the two together.
 *
 * 🔴 NO IMPORTS, AND THAT IS LOAD-BEARING. `parse-document.ts` pulls in pdf.js, fflate and the
 * vision client; a client component that imported the extension list from there would drag all of
 * it into the browser bundle. This file is strings.
 */

/** Formats with a reader of our own: free, local, and better than a vendor at their own format. */
export const NATIVE_EXTENSIONS = [
  "pdf",
  "docx", "pptx", "xlsx",
  "csv", "md", "markdown", "txt",
  "png", "jpg", "jpeg", "webp", "heic", "heif",
] as const;

/**
 * Formats only the extraction vendor reads. See `VENDOR_ONLY_EXTENSIONS` in parse-document for why
 * each one is here and why the list is curated rather than a catch-all.
 */
export const VENDOR_EXTENSIONS = [
  "doc", "ppt", "xls",
  "pages", "key", "numbers",
  "odt", "odp", "ods",
  "rtf", "epub", "html", "htm",
  "gif", "bmp", "tif", "tiff",
] as const;

/** Everything, in the order a person would scan it. */
export const READABLE_EXTENSIONS: readonly string[] = [...NATIVE_EXTENSIONS, ...VENDOR_EXTENSIONS];

/**
 * The `accept` attribute for a file input.
 *
 * 🔴 EXTENSIONS, AND MIME TYPES ONLY WHERE THEY EARN IT. A file dialog matches on either, and the
 * extension is the half that always works: browsers disagree about the MIME type of a .docx, and
 * several of the formats above (.pages, .key, .numbers) have no registered type at all, so a
 * MIME-only list would grey them out on the machines most likely to hold them. The image types are
 * spelled out as well because a camera roll picker matches on type rather than on filename.
 */
export const READABLE_ACCEPT: string = [
  ...READABLE_EXTENSIONS.map((extension) => `.${extension}`),
  "application/pdf",
  "text/markdown",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
].join(",");
