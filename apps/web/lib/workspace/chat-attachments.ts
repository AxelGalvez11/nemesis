"use client";

import type { ReadPhase } from "@/lib/workspace/read-progress";
import {
  courseFolderSegment,
  coverageNoticeForModel,
  matchCourse,
  readCoverage,
  readDocumentModel,
  SOURCE_HEADER,
  UNSORTED_FOLDER,
  UNTRUSTED_CONTENT_RULE,
  wrapUntrusted,
  type DocumentModel,
  type ExtractionCoverage,
} from "@nemesis/shared";

import { ingestObjectKey, MAX_INLINE_UPLOAD_BYTES, MAX_SOURCE_BYTES, maxSourceLabel } from "@/lib/notebooks/ingest-ref";
import { READABLE_EXTENSIONS } from "@/lib/notebooks/readable-formats";
import { supabase } from "@/lib/supabase";
import { deviceKey } from "@/lib/workspace/chat-api";
import { loadKnownCourses } from "@/lib/workspace/agent-tools";
import { findOrCreateLibrarySourceRow } from "@/lib/workspace/library-sources";
import { isSlimmableOfficeName } from "@/lib/workspace/office-slim";
import type { ChatAttachment } from "@/lib/workspace/chat-message";

// Sized for a real lecture deck, which is the main thing students attach.
// The old 12k/22k pair silently discarded the back half of any substantial
// deck — a 60-slide lecture with speaker notes runs well past it — and the
// student was never told, so a confident answer about "the whole lecture" was
// really an answer about its first third.
//
// The ceiling that matters is the model's context, not these numbers:
// deepseek-chat and deepseek-reasoner both carry 64k tokens (~256k chars).
// 🔴 The TOTAL was 90k until 2026-08-03, and it is why four attached syllabi
// came back as "I could only see two — the others didn't come through": two
// big files filled the budget and the rest landed in the "Not read" block,
// working as designed and useless in practice. 150k chars is ~38k tokens,
// which with HISTORY_CHAR_BUDGET (60k chars) and a skill packet (5k) still
// fits the window; the server valve's own caps remain the final authority.
// 🔴 60k was a PER-FILE ceiling BELOW the total, so a single attachment could
// be cut with most of the turn's budget still unspent. Measured on the owner's
// real 57-slide lecture (2026-08-06): 62,040 characters against a 60,000 cap —
// the ending was dropped to save 2,040 characters while 88,000 of the 150,000
// total went unused. A per-file limit under the total only makes sense to stop
// one file starving another, and `total - used` already does that, in order.
// Kept as the historical figure the regression test measures against.
export const LEGACY_PER_FILE_CHARS = 60_000;
export const MAX_TOTAL_CHARS = 150_000;
/** @deprecated The per-file ceiling is the whole remaining budget now. */
export const MAX_ATTACHMENT_CHARS = MAX_TOTAL_CHARS;
/** Formats whose original is stored and filed as a Library source.
 *  `.md`/`.txt` joined 2026-08-05: they were read inline and then thrown away,
 *  so a student who pasted in a set of typed lecture notes got an answer and no
 *  Library row — the file never existed as far as the workspace was concerned.
 *  They take the same Inbox → course-refile path as the rest.
 *
 *  🔴 The `library-sources` STORAGE BUCKET must allow `text/markdown` and
 *  `text/plain` for this to do anything. Its allowed_mime_types listed only
 *  pdf/docx/pptx/images/audio as of 2026-08-05; until that is widened the upload
 *  is rejected and persistChatAttachment falls back to metadata-only — the same
 *  no-row behaviour as before, so this degrades safely rather than lying. */
/** Pictures the server can read (lib/vision/gemini.ts). HEIC is here because it
 *  is what an iPhone writes, and a photo mailed to yourself and dropped in here
 *  is still a HEIC. */
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"];

/** The bare extensions above, for the filter that splits documents from pictures. `.gif`, `.bmp`
 *  and the TIFFs are deliberately NOT here: no vision model accepts them, so they travel the
 *  document lane to a reader that can rasterise them first.
 *
 *  🔴 DECLARED BEFORE `DOCUMENT_EXTENSIONS`, WHICH READS IT AT MODULE LOAD. It was written after,
 *  and `tsc --noEmit` passed clean: a `const` used before its initialiser is a runtime temporal
 *  dead zone, not a type error. Every test in this file died on import with one message. */
const IMAGE_ONLY = new Set(IMAGE_EXTENSIONS.map((extension) => extension.slice(1)));

// 🔴 DERIVED, BECAUSE A HAND-WRITTEN COPY OF THIS LIST IS THE GATE THAT SILENTLY DROPS FILES. This
// is not merely what the picker offers — `persistChatAttachment` looks a dropped file up here, and
// a file that is not found is attached to the message and NEVER STORED as a source. So an
// extension missing from this list produces a chat that appears to work and a Library that never
// learns the document exists. One list now: `readable-formats.ts`.
export const DOCUMENT_EXTENSIONS = READABLE_EXTENSIONS
  .filter((extension) => !IMAGE_ONLY.has(extension))
  .map((extension) => `.${extension}`);


export interface ChatAttachmentGroup {
  /** Stable for the lifetime of the selected File objects. */
  key: string;
  label: string;
  kind: "file" | "folder";
  files: readonly File[];
}

function relativePath(file: File): string {
  return file.webkitRelativePath.trim().replace(/^\/+/, "");
}

/**
 * Browser folder selection returns one File per descendant. Group those files
 * by root directory so the composer and sent message show the directory once,
 * while the model still receives the readable files inside it.
 */
export function groupChatAttachments(files: readonly File[]): ChatAttachmentGroup[] {
  const groups: ChatAttachmentGroup[] = [];
  const folders = new Map<string, File[]>();

  for (const [index, file] of files.entries()) {
    const path = relativePath(file);
    const slash = path.indexOf("/");
    if (slash > 0) {
      const folder = path.slice(0, slash);
      const existing = folders.get(folder);
      if (existing) existing.push(file);
      else {
        const children = [file];
        folders.set(folder, children);
        groups.push({ key: `folder:${folder}`, kind: "folder", label: folder, files: children });
      }
      continue;
    }
    groups.push({ key: `file:${index}:${file.name}:${file.lastModified}`, kind: "file", label: file.name, files: [file] });
  }

  return groups;
}

/** Anki exports. Not text, and never will be — a .apkg is a zip around a
 *  SQLite database, so the extractor has nothing to say about it. Dropping one
 *  into chat used to answer "no text extractor is available for this format",
 *  which is true and useless: the app has a whole reviewed importer for exactly
 *  this file. The composer routes these there instead. */
export const DECK_PACKAGE_EXTENSIONS = [".apkg", ".colpkg"];

export function isDeckPackage(file: File) {
  const name = file.name.toLowerCase();
  return DECK_PACKAGE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/** Split a selection into the decks that go to the Study importer and the rest
 *  that go to the model as text. Pure, so the routing rule is testable. */
export function partitionImportables(files: readonly File[]): { decks: File[]; rest: File[] } {
  const decks: File[] = [];
  const rest: File[] = [];
  for (const file of files) (isDeckPackage(file) ? decks : rest).push(file);
  return { decks, rest };
}

export function isImage(file: File) {
  const name = file.name.toLowerCase();
  if (IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension))) return true;
  // A browser that reports the type but a filename without an extension (a
  // pasted screenshot) is still an image.
  return /^image\/(png|jpe?g|webp|heic|heif)$/.test(file.type.toLowerCase());
}

function attachmentRecord(file: File): ChatAttachment {
  return {
    name: relativePath(file) || file.name,
    kind: isImage(file) ? "image" : "file",
    ...(file.type ? { mime: file.type } : {}),
  };
}

/** Bucket ceiling for a stored chat document — the library-sources bucket
 *  refuses anything larger, so don't burn an upload round-trip finding out.
 *
 *  🔴 IT IS THE SHARED CONSTANT, NOT A COPY OF IT. This was `50 * 1024 * 1024`
 *  written out here, a fifth private restatement of a number that already has
 *  one home — and it survived the move to 200 MiB silently, because a hard-coded
 *  limit never fails a test, it just quietly refuses files it should have kept.
 *  A 118 MiB lecture would have uploaded to the bucket and then been dropped
 *  from chat storage by this line alone. Import the ceiling; never retype it. */
const MAX_STORED_DOCUMENT_BYTES = MAX_SOURCE_BYTES;

/** The mime the bucket allowlist expects per document kind. The browser's own
 *  file.type is usually right but arrives empty from some drag sources.
 *
 *  🔴 EVERY entry in DOCUMENT_EXTENSIONS needs one, and the `library-sources`
 *  bucket needs to accept it. An extension listed as importable but missing
 *  from here uploads under whatever the browser guessed, the bucket rejects it
 *  on its allowlist, and the failure is SILENT: the file still reads inline in
 *  chat, so it looks like it worked, but no source row is ever written. That is
 *  precisely how `.md` behaved before 2026-08-05. chat-attachments.test.ts pins
 *  the two lists against each other; the bucket half can only be checked in
 *  production. */
export const DOCUMENT_MIME: Record<string, string> = {
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // The vendor-read formats. 🔴 THE REGISTERED TYPE, NOT A PLAUSIBLE ONE — the bucket allowlist
  // matches this string exactly, and a near-miss is the silent no-row failure this map's header
  // describes. Apple's three have no IANA registration at all, so the bundle types Finder writes
  // are used; they are what arrives in `file.type` on a Mac.
  ".doc": "application/msword",
  ".ppt": "application/vnd.ms-powerpoint",
  ".xls": "application/vnd.ms-excel",
  ".pages": "application/vnd.apple.pages",
  ".key": "application/vnd.apple.keynote",
  ".numbers": "application/vnd.apple.numbers",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".rtf": "application/rtf",
  ".epub": "application/epub+zip",
  ".html": "text/html",
  ".htm": "text/html",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

/** Which storage bucket a persisted attachment lives in — images have their
 *  own bucket; documents share the Library's sources bucket (same cap,
 *  same owner-only policies). The preview dialog re-signs through this. */
export function attachmentBucket(attachment: Pick<ChatAttachment, "mime">): string {
  return attachment.mime?.startsWith("image/") ? "library-images" : "library-sources";
}

function attachmentId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keep attachments as first-class conversation history. Text extraction lets
 * the model read a file, but it cannot make the original reappear on a second
 * device or in a preview popup; that requires one private durable object plus
 * its metadata in chat_messages.meta.attachments. Images always stored; PDF /
 * Word / PowerPoint originals stored since 2026-08-04 (owner: "does the webapp
 * save documents and are they readable?") up to the bucket's ceiling —
 * an oversized original is skipped, its text still reaches the model. */
async function persistChatAttachment(file: File, uid: string | null): Promise<ChatAttachment> {
  const base = attachmentRecord(file);
  if (!uid) return base;

  if (isImage(file)) {
    const extension = file.name.toLowerCase().match(/\.(png|jpe?g|webp|heic|heif)$/)?.[1] ?? "jpg";
    const storagePath = `${uid}/chat/${attachmentId()}.${extension}`;
    try {
      const uploaded = await supabase.storage.from("library-images").upload(storagePath, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (uploaded.error) return base;
      const signed = await supabase.storage.from("library-images").createSignedUrl(storagePath, 31_536_000);
      // A picture gets a row too, so it has the SAME kind of handle a document
      // has. Without one, a photo over the inline limit would be uploaded a
      // second time by the extractor just to obtain an id. The row records which
      // bucket holds it, which is why library_sources gained a `bucket` column.
      // Inbox, like a document: a photographed page is course material too, and
      // refileChatSource moves it once vision has read it. Anything left over
      // sits visibly in Inbox instead of loose at the Library root.
      const sourceId = await findOrCreateLibrarySourceRow(
        uid,
        file,
        file.type || "image/jpeg",
        UNSORTED_FOLDER,
        storagePath,
        "library-images",
      );
      return {
        ...base,
        storagePath,
        ...(sourceId ? { sourceId } : {}),
        ...(signed.data?.signedUrl ? { url: signed.data.signedUrl } : {}),
      };
    } catch {
      return base;
    }
  }

  const extension = DOCUMENT_EXTENSIONS.find((ext) => file.name.toLowerCase().endsWith(ext));
  if (!extension || file.size > MAX_STORED_DOCUMENT_BYTES) return base;
  const mime = DOCUMENT_MIME[extension] ?? file.type;
  const storagePath = `${uid}/chat/${attachmentId()}${extension}`;
  try {
    const uploaded = await supabase.storage.from("library-sources").upload(storagePath, file, {
      contentType: mime,
      upsert: false,
    });
    if (uploaded.error) return base;
    const signed = await supabase.storage.from("library-sources").createSignedUrl(storagePath, 31_536_000);
    // The stored document is also FILED as a Library source (owner
    // 2026-08-04: uploads are course material — notes made from them cite
    // them with [n](?source=<id>) pills, and syllabi/lectures belong in the
    // Library, not just in a chat bucket). Deduped by name+size, so
    // re-attaching the same file reuses its row.
    //
    // Filed into INBOX, not the root: at this point only the file NAME is
    // known, so course matching would misfire. prepareChatAttachments upgrades
    // the folder to the matched course once the text has been extracted
    // (refileChatSource below); an unmatched document stays honestly in Inbox.
    const sourceId = await findOrCreateLibrarySourceRow(uid, file, mime, UNSORTED_FOLDER, storagePath, "library-sources");
    return {
      ...base,
      mime,
      storagePath,
      ...(sourceId ? { sourceId } : {}),
      ...(signed.data?.signedUrl ? { url: signed.data.signedUrl } : {}),
    };
  } catch {
    return base;
  }
}

/** Anything the server-side extractor can turn into text: a document, or now a
 *  photograph. Named for what it does rather than for documents alone, because
 *  a picture of a page is not a document and is extracted the same way. */
export function isExtractable(file: File) {
  const name = file.name.toLowerCase();
  return DOCUMENT_EXTENSIONS.some((extension) => name.endsWith(extension)) || isImage(file);
}

function isReadableText(file: File) {
  if (file.type.startsWith("text/")) return true;
  return /\.(md|mdx|txt|csv|json|ts|tsx|js|jsx|py|java|c|cpp|h|css|html|xml|yaml|yml|sql)$/i.test(file.name);
}

export interface ExtractedFile {
  text: string;
  /** The server's best title — for a picture this comes from what was read, not
   *  from the filename, because "IMG_4821.HEIC" is not a title. */
  title: string | null;
  /** The vision model, present only when the file had to be READ as pixels. */
  readBy?: string;
  /** What the server decided the file IS, after sniffing its magic bytes — which
   *  is more reliable than the extension, and is why a lecture PDF whose name had
   *  lost its ".pdf" is now readable. */
  kind?: "pdf" | "docx" | "pptx" | "image";
  /** Bytes actually read. */
  bytes?: number;
  /**
   * 🔴 WHAT WAS READ, AND WHAT WAS NOT. The route has computed this all along;
   * this type did not have the field, so it was dropped at the boundary and had
   * ZERO consumers repo-wide. A 40-of-300-page vision pass therefore reached the
   * student, the note generator and the chat model as a complete read.
   *
   * Optional only because a response from an older deployment will not carry
   * one. A MISSING record means "unknown", never "complete" — read it with
   * `readCoverage`, and when it is null say nothing rather than claiming a full
   * read on the strength of a field that was not there.
   */
  coverage?: ExtractionCoverage;
  /**
   * The document's STRUCTURE — units, typed blocks, heading paths, table grids, geometry.
   *
   * 🔴 THIS FIELD IS THE FOURTH TIME THIS EXACT MISTAKE HAS BEEN CAUGHT, AND THE PATTERN IS
   * WORTH NAMING. The parser has produced a `DocumentModel` since Phase 3. It was dropped at
   * the function boundary (a Word reader whose structure was rendered to a string and
   * returned), then at the persistence boundary (a model computed and never written), then
   * at the route boundary (a route holding its own copy of the parser's decisions) — each
   * found and fixed. This is the client boundary: the route computes the model, hands it to
   * `persistParse`, and returns a response this type had no field for, so every interactive
   * consumer — chat, Canvas, Library import, syllabus import — received a flat string and
   * had to guess the structure back out of it.
   *
   * Optional for two independent reasons, and they must not be collapsed:
   *   * a response from an older deployment will not carry one, and
   *   * a format may genuinely produce none — an image has no structural pass at all, and a
   *     PDF the structural reader could not open falls back to `unpdf`.
   *
   * 🔴 ABSENT MEANS "UNKNOWN", NEVER "THIS DOCUMENT HAS NO STRUCTURE". A consumer that read
   * it the second way would file a two-column paper as prose. The rule is the one `coverage`
   * already follows: when the field is missing, fall back — never conclude.
   */
  model?: DocumentModel;
  /**
   * The filed `library_sources.id`, when this upload became a durable source.
   *
   * 🔴 THIS IS WHAT MAKES ANYTHING OUTLIVE THE REQUEST. A small file posted as a form has no
   * stored row, so nothing extracted from it can be anchored to anything a second session could
   * find again — a knowledge object built from it would point at browser state. Present only on
   * the by-reference lane; absent means "this material was read but not kept".
   */
  librarySourceId?: string;
  /**
   * The `parsed_documents` row this extraction was recorded as, when one was written.
   *
   * 🔴 THE ROUTE HAS RETURNED THIS ALL ALONG AND THIS TYPE HAD NO FIELD FOR IT — the same
   * boundary defect as `model`, one field over. It is what lets anything derived from a document
   * say WHICH STORED PARSE it came from, which is the difference between a citation that can be
   * re-opened and a sentence that says "from your syllabus".
   *
   * Absent on the multipart lane (a small file with no `sourceId` is parsed and not persisted) and
   * when the bookkeeping write failed. Absent means NO RECORD — never "the record says it was
   * fine".
   */
  parsedDocumentId?: string;
}

/**
 * Put the bytes in storage and file the row that names them, both under this
 * user's own RLS session. Returns the row id — the ONLY handle the server will
 * accept — or null when either half failed.
 *
 * This is the canonical upload. Every lane funnels here so a file is uploaded
 * exactly once and every later operation refers to the same object.
 */
async function uploadForIngest(file: File, uid: string, folderPath: string): Promise<string | null> {
  const image = isImage(file);
  const bucket = image ? "library-images" : "library-sources";
  const mime = fileMime(file);
  try {
    const key = ingestObjectKey(uid, file.name);
    const { error } = await supabase.storage.from(bucket).upload(key, file, {
      contentType: mime || undefined,
      upsert: false,
    });
    if (error) return null;
    const sourceId = await findOrCreateLibrarySourceRow(uid, file, mime, folderPath, key, bucket);
    // The object is useless without a row: the server resolves the path FROM the
    // row, so an orphaned object can never be read. Remove it rather than leave
    // bytes nothing can reach.
    if (!sourceId) {
      await supabase.storage.from(bucket).remove([key]).catch(() => undefined);
      return null;
    }
    return sourceId;
  } catch {
    return null;
  }
}

/** The mime the bucket allowlist expects. A browser's own `file.type` is usually
 *  right but arrives empty from some drag sources, and an upload with no content
 *  type is refused by the allowlist. */
function fileMime(file: File): string {
  if (file.type) return file.type;
  const extension = DOCUMENT_EXTENSIONS.find((ext) => file.name.toLowerCase().endsWith(ext));
  return (extension && DOCUMENT_MIME[extension]) || "";
}

/**
 * What went wrong, in words a student can act on.
 *
 * The old code did `response.json().catch(() => null)` and fell back to
 * "Couldn't read X." — which meant the ONE failure that actually happened in
 * production, the platform's plain-text 413, arrived as a shrug. A non-JSON
 * body is not "no information": the status code says plenty.
 */
function extractErrorFor(status: number, fileName: string): string {
  if (status === 413) return `${fileName} is too large to upload (${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)} MB max).`;
  if (status === 403) return `${fileName} couldn't be read — it isn't filed under this account.`;
  if (status === 404) return `${fileName} finished uploading but couldn't be found. Try adding it again.`;
  if (status === 415) return `${fileName} isn't a file we can read. Add a photo, a PDF, Word, or PowerPoint.`;
  if (status === 401) return "This device needs to re-connect to your account. Try again.";
  if (status === 503) return "That service is busy right now. Try again in a moment.";
  if (status >= 500) return `Something broke while reading ${fileName}. Try again.`;
  return `Couldn't read ${fileName}.`;
}

/**
 * Send one file to the extract chokepoint and get its text back.
 *
 * Small files still go as a form — one round trip, unchanged behaviour. Large
 * ones are uploaded to private storage first and named by reference, because
 * they physically cannot reach the function any other way.
 *
 * `sourceId` lets a lane that has ALREADY uploaded the original say so, instead
 * of paying to send the same thirty megabytes twice. That is the normal case:
 * chat and Library import both file the row before extracting.
 *
 * Throws with a student-readable message.
 */
/**
 * Which lane a request takes, decided from what is actually true rather than what was asked for.
 *
 * 🔴 FILING IS BEST-EFFORT, AND A FILE THAT COULD NOT BE FILED IS STILL READ. `keep` deliberately
 * does not appear here — only its OUTCOME does, as `filedSourceId`. A `keep` request whose upload
 * was refused falls back to the lane that has always worked, because throwing would turn a
 * document that used to open into one the student simply cannot add.
 *
 * And a refusal is not hypothetical: the storage bucket has a mime allowlist, and `fileMime`
 * returns "" for a file the browser reported no type for whose extension we do not recognise —
 * which includes a case this codebase deliberately supports, a lecture PDF whose name has lost its
 * ".pdf" and is identified by sniffing its bytes on the server. That file went inline before and
 * must keep going inline.
 *
 * What is lost in the fallback is durability, and the caller can SEE that it was lost, because
 * `librarySourceId` comes back absent — which every consumer already reads as "not re-findable",
 * never as "filed somewhere".
 */
export function uploadLane(input: {
  /** A row the caller already had. */
  sourceId: string | null;
  /** The row filing produced, or null when filing was not asked for or did not work. */
  filedSourceId: string | null;
  size: number;
}): "inline" | "by-reference" {
  // A row exists, so the server can read the bytes from it — always the better lane.
  if (input.filedSourceId ?? input.sourceId) return "by-reference";
  // No row and too big to post: by reference is the only way, and it is allowed to fail loudly.
  if (input.size > MAX_INLINE_UPLOAD_BYTES) return "by-reference";
  return "inline";
}

export async function extractFile(
  file: File,
  uid: string | null,
  opts: {
    sourceId?: string | null;
    folderPath?: string;
    /**
     * File this upload even when it is small enough to post inline.
     *
     * 🔴 THE DEFAULT IS DELIBERATELY NOT TO KEEP, AND THAT DEFAULT IS RIGHT FOR CHAT. A photo
     * dropped into a conversation to ask one question should not silently become a permanent
     * document. But it is wrong for anything whose output has to survive the session: a canvas
     * cites its source weeks later, and a knowledge object extracted from it must be anchored to
     * a row a SECOND canvas can find. Without a filed row the anchor points at browser state and
     * cross-session learning cannot work at all — so the caller says which it wants, explicitly.
     */
    keep?: boolean;
    /**
     * Called as each step of this read genuinely finishes, so a card can draw an arc.
     *
     * 🔴 THE CALLS ARE FACTS, NOT ESTIMATES. Each one fires immediately after the work it names
     * has returned, and there is nothing between them: no timer creeping the arc forward while a
     * step runs. `lib/workspace/read-progress.ts` argues why at length, and its own test refuses
     * a clock. A caller that passes nothing costs nothing.
     *
     * 🔴 IT MUST NEVER THROW INTO THIS FUNCTION. A surface whose setState went wrong cannot be
     * allowed to fail a read that has already succeeded, so every call is wrapped.
     */
    onPhase?: (phase: ReadPhase) => void;
  } = {},
): Promise<ExtractedFile> {
  const say = (phase: ReadPhase) => {
    try {
      opts.onPhase?.(phase);
    } catch {
      // A reporting failure is never a read failure.
    }
  };
  const key = uid ? await deviceKey(uid) : null;
  if (!key || !uid) throw new Error("Sign in to read this attachment.");
  say("authorised");

  // 🔴 AN OVERSIZED DECK IS REFUSED. IT IS NOT SILENTLY EMPTIED OF ITS PICTURES.
  //
  // This used to call slimOfficeArchive(): a deck over the storage ceiling had
  // every image deleted in the browser and the remains — 0.11 MB of the owner's
  // 123.8 MB immunology lecture — uploaded, stored and parsed. The extractor
  // succeeded, all 37 slides came back, and nothing anywhere recorded that 57
  // figures had been thrown away. The model then answered about that lecture as
  // if it had seen the whole thing, and neither the student nor we could tell.
  //
  // That is worse than rejecting the file, so it now rejects the file. A source
  // must never enter Nemesis incomplete while presenting as complete.
  //
  // This is a SAFETY PATCH, not the answer. The answer is lossless
  // normalization: the same lecture repacks to 24.0 MiB with all 57 figures
  // intact, because its media is uncompressed twice over — raw pixels inside zip
  // entries that were never deflated. Once that lands, nothing reaches this
  // refusal that did not deserve to. If a destructive fallback ever returns it
  // has to carry its damage in the source's own metadata — assets removed, why,
  // and what the reader can no longer be asked — so retrieval can say the
  // figures were unavailable instead of reasoning from their absence. See
  // docs/document-normalization.md, tiers 1 and 4.
  const payload = file;
  if (payload.size > MAX_SOURCE_BYTES) {
    throw new Error(
      // 🔴 THIS SENTENCE USED TO EXPLAIN A DESIGN DECISION INSTEAD OF NAMING A LIMIT. It read
      // "Nemesis won't strip its pictures out to fit — you'd get an answer built on a lecture it
      // only half read", which tells a learner holding a lecture they need to study about our
      // internal trade-off and gives them nothing to do about it. What they need is the number,
      // their number, and the one move that works. The reasoning belongs in this comment.
      `${file.name} is ${Math.round(payload.size / 1024 / 1024)} MB — over the ${maxSourceLabel()} limit. Splitting the deck in half usually gets both parts through.`,
    );
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  let response: Response;

  // Already filed by the caller, or small enough to post directly. A small file
  // with no row still takes the multipart path — one round trip, and nothing is
  // stored for a document the student never asked us to keep.
  const sourceId = opts.sourceId ?? null;
  let filedSourceId: string | null = sourceId;

  // Filing is attempted first when the caller asked for it, so its OUTCOME — not its intention —
  // is what decides the lane. See `uploadLane`.
  if (!sourceId && opts.keep) {
    filedSourceId = await uploadForIngest(payload, uid, opts.folderPath ?? "");
    // 🔴 REPORTED EVEN WHEN FILING CAME BACK NULL. The bytes went up and came back refused, which
    // took exactly as long as a successful upload; the read then falls through to the inline lane
    // and carries on. An arc that ignored the time a failed upload cost would stall on precisely
    // the files that took longest.
    say("uploaded");
  }

  if (uploadLane({ filedSourceId, size: payload.size, sourceId }) === "inline") {
    const form = new FormData();
    form.append("file", payload);
    response = await fetch("/api/notebooks/extract/file", { body: form, headers, method: "POST" });
  } else {
    const id = filedSourceId ?? (await uploadForIngest(payload, uid, opts.folderPath ?? ""));
    if (!id) throw new Error(`Couldn't upload ${file.name}. Check your connection and try again.`);
    filedSourceId = id;
    say("uploaded");
    response = await fetch("/api/notebooks/extract/file", {
      body: JSON.stringify({ sourceId: id }),
      headers: { ...headers, "Content-Type": "application/json" },
      method: "POST",
    });
  }

  const body = (await response.json().catch(() => null)) as {
    text?: string;
    title?: string;
    readBy?: string;
    kind?: ExtractedFile["kind"];
    bytes?: number;
    coverage?: unknown;
    model?: unknown;
    parsedDocumentId?: unknown;
    error?: string;
  } | null;
  if (!response.ok || !body?.text) throw new Error(body?.error ?? extractErrorFor(response.status, file.name));
  // 🔴 AFTER THE REFUSAL, NOT BEFORE IT. A failed extract must never complete the arc: the card is
  // about to become the failed state, and a full circle behind a "couldn't read" is a card
  // disagreeing with itself.
  say("read");
  // 🔴🔴 PICTURES NOBODY LOOKED AT GET LOOKED AT. Figure DETECTION runs on the upload path and
  // figure READING does not — `lookAtFigures` is off there on purpose, because up to 40 vision
  // calls in the request is latency the student waits through (see ParseOptions). The background
  // worker does read them, and NOTHING EVER ASKED IT TO: measured 2026-08-31, nine of the owner's
  // documents sat with "not-examined" figures for weeks, `parse_enqueued_at` null on every one.
  // Queuing one by hand described all eight of its pictures in 14 seconds.
  //
  // 🔴 A DATABASE FUNCTION, NOT `enqueueParse`. That path needs SUPABASE_SERVICE_ROLE_KEY, which is
  // a revoked legacy JWT on Vercel awaiting rotation; this is the #918 pattern — the privileged
  // step lives in Postgres, granted to `authenticated`, driven by the learner's own session. It is
  // a no-op unless the row is theirs and genuinely has unexamined figures.
  //
  // 🔴 FIRE AND FORGET, DELIBERATELY. The document is already usable; this only improves it. A
  // failure here must never turn a successful upload into a failed one.
  const unexamined = readCoverage(body.coverage)?.figures.reasons["not-examined"] ?? 0;
  if (filedSourceId && unexamined > 0) {
    void supabase.rpc("request_figure_pass", { p_source_id: filedSourceId }).then(undefined, () => undefined);
  }

  return {
    bytes: body.bytes,
    kind: body.kind,
    readBy: body.readBy,
    text: body.text,
    title: body.title ?? null,
    // 🔴 THE TWO IDS ARE REPORTED SEPARATELY BECAUSE THEY CAN DISAGREE. The row id comes from our
    // own upload; the parse id comes from the server and is absent when `persistParse` failed —
    // which it is allowed to do, because a student who cannot add their lecture over a bookkeeping
    // write has lost more than the record was worth. A caller must be able to tell "filed and
    // parsed" from "filed, parse not recorded"; collapsing them would let an extractor anchor to a
    // source whose canonical model was never stored.
    ...(filedSourceId ? { librarySourceId: filedSourceId } : {}),
    // Validated rather than cast: this crossed the wire as JSON, and a shape
    // that does not check out must become `undefined` (unknown) rather than a
    // half-built record that later reads as a claim about the document.
    coverage: readCoverage(body.coverage) ?? undefined,
    // Same rule, same reason. A model that fails validation becomes `undefined`,
    // which every consumer must read as "structure unknown, use the text" — not
    // as "this document has no structure".
    model: readDocumentModel(body.model) ?? undefined,
    // A uuid or nothing. Checked rather than cast for the same reason as the two above.
    parsedDocumentId: typeof body.parsedDocumentId === "string" && body.parsedDocumentId
      ? body.parsedDocumentId
      : undefined,
  };
}

/** Marks the trailing line of a sent message that lists what was attached. */
export const ATTACHMENT_SUMMARY_PREFIX = "Attachments: ";

function attachmentSummary(files: readonly File[]) {
  if (!files.length) return "";
  const labels = groupChatAttachments(files).map((group) => group.kind === "folder" ? `${group.label}/` : group.label);
  return `\n\n${ATTACHMENT_SUMMARY_PREFIX}${labels.join(", ")}`;
}

/**
 * Split a sent message into what the student typed and what they attached, so
 * the transcript can render files as cards instead of a line of prose.
 *
 * Only the LAST line is considered, because that is the one attachmentSummary
 * appends — a message whose own text happens to begin "Attachments: " keeps it
 * as text rather than being silently reinterpreted as a file list.
 */
export function splitAttachmentSummary(content: string): { body: string; attachments: string[] } {
  const parse = (line: string, body: string) => {
    // A summary is ONE line; anything after a newline is the student's own text.
    if (line.includes("\n")) return null;
    const attachments = line.split(", ").map((name) => name.trim()).filter(Boolean);
    return attachments.length ? { attachments, body } : null;
  };

  // Attached with nothing typed. prepareChatAttachments trims the message, so
  // the separating blank line is GONE and the summary is the entire content —
  // the common case, and the one a fixture written by hand tends to miss.
  if (content.startsWith(ATTACHMENT_SUMMARY_PREFIX)) {
    const parsed = parse(content.slice(ATTACHMENT_SUMMARY_PREFIX.length), "");
    if (parsed) return parsed;
  }

  // Attached alongside a message: the summary is the trailing line. Only the
  // LAST one counts, so prose that happens to begin "Attachments: " stays text.
  const cut = content.lastIndexOf(`\n\n${ATTACHMENT_SUMMARY_PREFIX}`);
  if (cut !== -1) {
    const parsed = parse(content.slice(cut + 2 + ATTACHMENT_SUMMARY_PREFIX.length), content.slice(0, cut).trim());
    if (parsed) return parsed;
  }

  return { attachments: [], body: content };
}

export interface AttachmentSource {
  label: string;
  type: string;
  content: string;
  /** Library source row for this file — teaches the model the ?source= id
   *  its note citations must use. */
  sourceId?: string;
  /**
   * What the extractor managed to read. Absent means UNKNOWN (an older
   * deployment, or a file read by a path that does not report) — never
   * "complete".
   */
  coverage?: ExtractionCoverage;
}

/**
 * Fit extracted attachment text into the wire budget.
 *
 * Pure, so the budget rules can be tested without File objects or a network —
 * and separate from the reading above because the rule that matters here is a
 * disclosure rule, not an extraction one: when the budget bites, SAY SO. A
 * silent `.slice()` is what let the model answer about a lecture it had only
 * partly seen, with no way for the student to know which part was missing.
 */
/**
 * Say where a clipped file stopped, in the units the document itself uses.
 *
 * 🔴 The old notice counted CHARACTERS, which the model cannot map onto a
 * lecture. Given "60,000 of 62,040 characters" plus a coverage tally that
 * happened to say 46 notes pages, it told the owner the deck was cut off at
 * slide 46. The real boundary was slide 55. A confident, wrong location is
 * worse than none — so when the text carries slide markers, name the slide.
 *
 * The marker COUNT is not usable: a slide with no text at all is dropped from
 * the joined text, marker and all, so 57 slides can leave 56 markers. Only the
 * numbers are trusted, and only to say "up to N" — a statement that stays true
 * even when the sequence has a gap. PDFs and Word carry no such markers, so
 * they fall back to characters, with the share shown.
 */
export function describeTruncation(full: string, clipped: string): string {
  const marks: { at: number; n: number }[] = [];
  const re = /^## Slide (\d+)\b/gm;
  for (let m = re.exec(full); m; m = re.exec(full)) marks.push({ at: m.index, n: Number(m[1]) });

  const lastSent = marks.filter((mark) => mark.at < clipped.length).at(-1)?.n;
  const highest = marks.at(-1)?.n;
  if (marks.length >= 2 && lastSent !== undefined && highest !== undefined && highest > lastSent) {
    return `\n\n[Truncated. You received this file up to slide ${lastSent}. Slides after ${lastSent} (the file goes to ${highest}) were NOT sent to you. If the student's question touches those slides, say plainly that you were not given them rather than answering as though you read the whole deck.]`;
  }
  const share = Math.round((clipped.length / full.length) * 100);
  return `\n\n[Truncated: ${clipped.length.toLocaleString()} of ${full.length.toLocaleString()} characters shown (${share}%). The rest of this file was NOT sent to you. Do not guess which section is missing — say plainly that the tail was not given to you if the student's question depends on it.]`;
}

export function fitAttachmentBlocks(
  sources: readonly AttachmentSource[],
  // Defaults to the whole remaining budget. A ceiling below the total only
  // starves a file for no gain — `total - used` below already keeps one file
  // from eating another's share, in the order they were attached.
  perFile: number | null = null,
  total = MAX_TOTAL_CHARS,
): string[] {
  const blocks: string[] = [];
  const skipped: string[] = [];
  let used = 0;

  for (const source of sources) {
    if (used >= total) {
      skipped.push(source.label);
      continue;
    }
    const full = source.content.trim();
    const clipped = full.slice(0, Math.min(perFile ?? total, total - used));
    const notice = clipped.length < full.length ? describeTruncation(full, clipped) : "";
    // 🔴 TWO DIFFERENT GAPS, BOTH DISCLOSED, AND THEY ARE NOT THE SAME GAP.
    //
    //   `notice` above  — the text exists but did not fit in this prompt.
    //   `gap` below     — the text does NOT exist: pages nobody could read,
    //                     figures nobody could see, a source clipped at
    //                     extraction. No later prompt can recover it.
    //
    // Collapsing them into one sentence would tell the model to "ask a narrower
    // question" about content that is simply not in the system.
    const gap = source.coverage ? coverageNoticeForModel(source.coverage) : null;
    const gapNotice = gap ? `\n\n${gap}` : "";
    // The rule rides the FIRST block only, not every one. It has to sit inside an
    // attachment block rather than above them all, because chat-routing.ts splits
    // the wire text at the first "### Attachment: " marker to recover what the
    // student actually typed — anything placed before that marker would be
    // classified as part of their message and routed on.
    const rule = blocks.length === 0 ? `${UNTRUSTED_CONTENT_RULE}\n\n` : "";
    // A filed document teaches the model its citation id here, in the app's
    // own header (never inside the untrusted fence) — this is what lets
    // "make notes from this lecture" produce pills that open the original.
    const sourceLine = source.sourceId
      ? `\n${SOURCE_HEADER}${source.sourceId} — when writing notes from this file, cite passages inline as [n](?source=${source.sourceId}).`
      : "";
    // Header OUTSIDE the fence (chat-skills.ts matches on it, and the student's
    // own filename belongs to the app), content INSIDE it. The label is repeated
    // on the fence line by wrapUntrusted so the model can tell two fenced blocks
    // apart without leaving the fence.
    // 🔴 THE COVERAGE LINE GOES OUTSIDE THE FENCE. It is OUR measurement of the
    // file, not something the file said — and the fence exists precisely to mark
    // everything inside it as words a stranger wrote. A document that contained
    // the sentence "all pages were read successfully" must never be able to
    // impersonate this line.
    blocks.push(
      `### Attachment: ${source.label}\nType: ${source.type || "unknown"}${sourceLine}${gapNotice}\n\n` +
      rule +
      wrapUntrusted(source.label, `${clipped}${notice}`),
    );
    used += clipped.length;
  }

  if (skipped.length) {
    blocks.push(`### Not read\nThese attachments did not fit and were not sent to you: ${skipped.join(", ")}. Tell the student you could not read them, and offer to take them one at a time.`);
  }

  return blocks;
}

/** The sent message as the transcript should show it — the typed text plus the
 *  one-line attachment summary. Synchronous, so the message can appear the
 *  instant Send is pressed instead of after extraction. */
export function chatDisplayText(text: string, files: readonly File[]): string {
  return `${text.trim()}${attachmentSummary(files)}`.trim();
}

/** Least extracted text worth running a course match against. Below this a
 *  "match" is usually the filename echoing one word of a course title. */
const MIN_REFILE_TEXT = 200;

/** What actually happened to one source's filing. Returned, not whispered:
 *  "organized" may only be claimed when `moved` came back with a folder. */
export type RefileOutcome =
  | { folder: string; sourceId: string; status: "moved" }
  | { reason: string; sourceId: string; status: "failed" }
  | { sourceId: string; status: "already_filed" | "no_match" | "too_little_text" };

/**
 * Move a just-extracted chat source from Inbox to its matched course folder.
 *
 * Owner 2026-08-05, acceptance test 9: an upload whose filename AND body both
 * said "PHCY 2114" — a course Nemesis already knew from the calendar — sat in
 * Inbox, and the whole session issued ZERO updates to library_sources. This used
 * to be `void refileChatSource(...)`: abandoned promise, every branch silent, no
 * way to tell "no course matched" apart from "it never ran". Now it is awaited
 * and every branch names itself, so the difference is visible in one place.
 *
 * Still never throws — a filing miss must not break a send — but a failure is
 * now a `failed` outcome with a reason rather than an empty catch.
 */
export async function refileChatSource(sourceId: string, text: string): Promise<RefileOutcome> {
  if (text.trim().length < MIN_REFILE_TEXT) return { sourceId, status: "too_little_text" };
  try {
    const matched = matchCourse(text.slice(0, 20_000), await loadKnownCourses());
    if (!matched) return { sourceId, status: "no_match" };
    const folder = courseFolderSegment(matched.course);
    const { data, error } = await supabase
      .from("library_sources")
      .update({ folder_path: folder })
      .eq("id", sourceId)
      .eq("folder_path", UNSORTED_FOLDER) // never fight a folder the student (or librarian) already chose
      .select("id");
    if (error) {
      console.warn("Library refile skipped:", error.message);
      return { reason: error.message, sourceId, status: "failed" };
    }
    // No row came back: the guard above matched nothing, so it had already been
    // filed somewhere deliberate. Not a failure, and not something to overwrite.
    if (!data?.length) return { sourceId, status: "already_filed" };
    return { folder, sourceId, status: "moved" };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn("Library refile skipped:", reason);
    return { reason, sourceId, status: "failed" };
  }
}

/** Chip metadata alone — names and kinds, no storage round-trip. This is what
 *  the optimistic message carries while prepareChatAttachments is still
 *  running; the durable records (images gain signed URLs) replace it after. */
export function draftAttachmentRecords(files: readonly File[]): ChatAttachment[] {
  return files.map((file) => attachmentRecord(file));
}

export async function prepareChatAttachments(text: string, files: readonly File[], uid: string | null) {
  const displayText = chatDisplayText(text, files);
  if (!files.length) return { attachments: [] as ChatAttachment[], displayText, sources: [] as AttachmentSource[], wireText: text.trim() };

  const attachments = await Promise.all(files.map((file) => persistChatAttachment(file, uid)));
  // All files extract AT ONCE. This used to be one await per file, which for
  // four lecture PDFs meant four full server round-trips end to end — minutes
  // of nothing happening on screen (owner 2026-08-03: "the chat lags behind
  // when user uploads files"). Promise.all keeps the order of `files`, which
  // fitAttachmentBlocks depends on for its budget arithmetic.
  const sources: AttachmentSource[] = await Promise.all(files.map(async (file, index) => {
    let content = "";
    // 🔴 THE FIELD THAT USED TO BE THROWN AWAY ON THIS LINE. `extractFile(...).text`
    // discarded the whole record, which is how a partly-read lecture reached the
    // model looking whole.
    let coverage: ExtractionCoverage | undefined;
    try {
      if (isReadableText(file)) content = await file.text();
      // A picture goes to the same extractor as a document now: the server reads it with a
      // multimodal model and hands back a transcript (or, for a picture with no text in it, a
      // description). This is what used to be the "image pixels are not yet sent to the model"
      // apology — the pixels still never reach the chat model, but what is IN them does.
      //
      // The row id from the persist pass above is handed straight to the extractor, so a
      // thirty-megabyte deck is uploaded ONCE and everything afterwards refers to that one
      // object. Without this the extractor would upload its own copy of the same bytes.
      else if (isExtractable(file)) {
        const extracted = await extractFile(file, uid, { sourceId: attachments[index]?.sourceId });
        content = extracted.text;
        coverage = extracted.coverage;
      }
      else content = "File attached; no text extractor is available for this format.";
    } catch (cause) {
      content = cause instanceof Error ? cause.message : "This attachment could not be read.";
    }
    return { content, coverage, label: relativePath(file) || file.name, type: file.type };
  }));

  // Marry each file's text to its Library source id (persistChatAttachment
  // and the extraction map share the order of `files`), so the wire blocks
  // can teach the model what to cite.
  const sourcedBlocks = sources.map((source, index) => {
    const sourceId = attachments[index]?.sourceId;
    return sourceId ? { ...source, sourceId } : source;
  });

  // Filing upgrade: persist only knew the file NAME, so the stored source sat in
  // Inbox. Now the text exists — a clear course match moves it under that
  // course; no match leaves it honestly in Inbox rather than confidently
  // misfiled (owner 2026-08-05).
  //
  // AWAITED, not fire-and-forget. As `void refileChatSource(...)` this produced
  // no database write at all in the production acceptance pass and left no trace
  // explaining why. The cost is one short update running alongside extraction
  // that has already finished; the gain is that the folder is settled before the
  // turn is composed, so what the model is told about the file is true.
  const refiled = await Promise.all(
    sourcedBlocks.map((block) =>
      "sourceId" in block && block.sourceId
        ? refileChatSource(block.sourceId, `${block.label}\n${block.content}`)
        : null,
    ),
  );

  return {
    attachments,
    displayText,
    // Per-file filing outcomes, same order as `files`. Nothing may be described
    // as organized unless the matching entry says "moved".
    refiled: refiled.filter((outcome): outcome is RefileOutcome => outcome !== null),
    // Per-file extracted text, in the same order as `files` — the caller's
    // content gates (is this a syllabus?) read these instead of re-extracting.
    sources: sourcedBlocks,
    wireText: `${text.trim()}\n\n${fitAttachmentBlocks(sourcedBlocks).join("\n\n")}`.trim(),
  };
}
