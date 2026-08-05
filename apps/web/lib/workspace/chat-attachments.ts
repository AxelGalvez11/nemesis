"use client";

import { courseFolderSegment, matchCourse, UNSORTED_FOLDER, UNTRUSTED_CONTENT_RULE, wrapUntrusted } from "@nemesis/shared";

import { ingestObjectKey, MAX_SOURCE_BYTES } from "@/lib/notebooks/ingest-ref";
import { supabase } from "@/lib/supabase";
import { deviceKey } from "@/lib/workspace/chat-api";
import { loadKnownCourses } from "@/lib/workspace/agent-tools";
import { findOrCreateLibrarySourceRow } from "@/lib/workspace/library-sources";
import { isSlimmableOfficeName, OFFICE_SLIM_THRESHOLD_BYTES, slimOfficeArchive } from "@/lib/workspace/office-slim";
import type { SessionAttachment } from "@/lib/workspace/sessions-store";

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
export const MAX_ATTACHMENT_CHARS = 60_000;
export const MAX_TOTAL_CHARS = 150_000;
/** Formats whose original is stored and filed as a Library source.
 *  `.md`/`.txt` joined 2026-08-05: they were read inline and then thrown away,
 *  so a student who pasted in a set of typed lecture notes got an answer and no
 *  Library row — the file never existed as far as the workspace was concerned.
 *  They take the same Inbox → course-refile path as the rest. */
export const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".pptx", ".md", ".txt"];
/** Pictures the server can read (lib/vision/gemini.ts). HEIC is here because it
 *  is what an iPhone writes, and a photo mailed to yourself and dropped in here
 *  is still a HEIC. */
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"];

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

function attachmentRecord(file: File): SessionAttachment {
  return {
    name: relativePath(file) || file.name,
    kind: isImage(file) ? "image" : "file",
    ...(file.type ? { mime: file.type } : {}),
  };
}

/** Bucket ceiling for a stored chat document — the library-sources bucket
 *  refuses anything larger, so don't burn an upload round-trip finding out. */
const MAX_STORED_DOCUMENT_BYTES = 50 * 1024 * 1024;

/** The mime the bucket allowlist expects per document kind. The browser's own
 *  file.type is usually right but arrives empty from some drag sources. */
const DOCUMENT_MIME: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
};

/** Which storage bucket a persisted attachment lives in — images have their
 *  own bucket; documents share the Library's sources bucket (same 50 MB cap,
 *  same owner-only policies). The preview dialog re-signs through this. */
export function attachmentBucket(attachment: Pick<SessionAttachment, "mime">): string {
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
 * save documents and are they readable?") up to the bucket's 50 MB ceiling —
 * an oversized original is skipped, its text still reaches the model. */
async function persistChatAttachment(file: File, uid: string | null): Promise<SessionAttachment> {
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
}

/**
 * Most a file may weigh and still be POSTed as a form.
 *
 * 🔴 THIS IS A PLATFORM LIMIT, NOT A PRODUCT ONE. Vercel refuses a request body
 * over ~4.5 MB at the edge, before any of our code runs — measured against
 * production 2026-08-05: 4.4 MB reached the handler, 4.6 MB got a plain-text
 * FUNCTION_PAYLOAD_TOO_LARGE. Anything above this goes to storage first and is
 * read by reference, which has no such ceiling. Set below the real edge so our
 * own JSON error wins the race and the student is told something true.
 */
const MAX_INLINE_UPLOAD_BYTES = 4 * 1024 * 1024;

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
export async function extractFile(
  file: File,
  uid: string | null,
  opts: { sourceId?: string | null; folderPath?: string } = {},
): Promise<ExtractedFile> {
  const key = uid ? await deviceKey(uid) : null;
  if (!key || !uid) throw new Error("Sign in to read this attachment.");

  // A deck over the STORAGE ceiling is almost entirely pictures; its words fit
  // in under 1 MB. Strip the media in the browser and send THAT, so the file is
  // read instead of refused (owner's 123.8 MB immunology deck: slimmed to
  // 0.11 MB, all 37 slides extracted).
  //
  // 🔴 The threshold used to be 24 MB, chosen against a 25 MB route limit that
  // was never real. That stripped the pictures out of every deck over 24 MB —
  // and did nothing for the 5-to-24 MB decks that were failing. It is now the
  // bucket's own ceiling, so a 30 MB lecture keeps its figures.
  let payload = file;
  if (isSlimmableOfficeName(file.name) && file.size > OFFICE_SLIM_THRESHOLD_BYTES) {
    try {
      const slimmed = slimOfficeArchive(new Uint8Array(await file.arrayBuffer()));
      if (slimmed.byteLength < file.size) payload = new File([slimmed as BlobPart], file.name, { type: file.type });
    } catch {
      // Not a real zip, or hostile contents — the route's own guards decide.
    }
  }

  if (payload.size > MAX_SOURCE_BYTES) {
    throw new Error(extractErrorFor(413, file.name));
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  let response: Response;

  // Already filed by the caller, or small enough to post directly. A small file
  // with no row still takes the multipart path — one round trip, and nothing is
  // stored for a document the student never asked us to keep.
  const sourceId = opts.sourceId ?? null;
  if (!sourceId && payload.size <= MAX_INLINE_UPLOAD_BYTES) {
    const form = new FormData();
    form.append("file", payload);
    response = await fetch("/api/notebooks/extract/file", { body: form, headers, method: "POST" });
  } else {
    const id = sourceId ?? (await uploadForIngest(payload, uid, opts.folderPath ?? ""));
    if (!id) throw new Error(`Couldn't upload ${file.name}. Check your connection and try again.`);
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
    error?: string;
  } | null;
  if (!response.ok || !body?.text) throw new Error(body?.error ?? extractErrorFor(response.status, file.name));
  return { bytes: body.bytes, kind: body.kind, readBy: body.readBy, text: body.text, title: body.title ?? null };
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
export function fitAttachmentBlocks(
  sources: readonly AttachmentSource[],
  perFile = MAX_ATTACHMENT_CHARS,
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
    const clipped = full.slice(0, Math.min(perFile, total - used));
    const notice = clipped.length < full.length
      ? `\n\n[Truncated: ${clipped.length.toLocaleString()} of ${full.length.toLocaleString()} characters shown. The rest of this file was NOT sent to you. If the student's question depends on the part you cannot see, say so plainly rather than answering as though you read the whole file.]`
      : "";
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
      ? `\nStored in the student's Library as source ${source.sourceId} — when writing notes from this file, cite passages inline as [n](?source=${source.sourceId}).`
      : "";
    // Header OUTSIDE the fence (chat-skills.ts matches on it, and the student's
    // own filename belongs to the app), content INSIDE it. The label is repeated
    // on the fence line by wrapUntrusted so the model can tell two fenced blocks
    // apart without leaving the fence.
    blocks.push(
      `### Attachment: ${source.label}\nType: ${source.type || "unknown"}${sourceLine}\n\n` +
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
export function draftAttachmentRecords(files: readonly File[]): SessionAttachment[] {
  return files.map((file) => attachmentRecord(file));
}

export async function prepareChatAttachments(text: string, files: readonly File[], uid: string | null) {
  const displayText = chatDisplayText(text, files);
  if (!files.length) return { attachments: [] as SessionAttachment[], displayText, sources: [] as AttachmentSource[], wireText: text.trim() };

  const attachments = await Promise.all(files.map((file) => persistChatAttachment(file, uid)));
  // All files extract AT ONCE. This used to be one await per file, which for
  // four lecture PDFs meant four full server round-trips end to end — minutes
  // of nothing happening on screen (owner 2026-08-03: "the chat lags behind
  // when user uploads files"). Promise.all keeps the order of `files`, which
  // fitAttachmentBlocks depends on for its budget arithmetic.
  const sources: AttachmentSource[] = await Promise.all(files.map(async (file, index) => {
    let content = "";
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
        content = (await extractFile(file, uid, { sourceId: attachments[index]?.sourceId })).text;
      }
      else content = "File attached; no text extractor is available for this format.";
    } catch (cause) {
      content = cause instanceof Error ? cause.message : "This attachment could not be read.";
    }
    return { content, label: relativePath(file) || file.name, type: file.type };
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
