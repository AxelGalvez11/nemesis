"use client";

import { UNTRUSTED_CONTENT_RULE, wrapUntrusted } from "@nemesis/shared";

import { supabase } from "@/lib/supabase";
import { deviceKey } from "@/lib/workspace/chat-api";
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
export const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".pptx"];
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
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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
      if (signed.error || !signed.data?.signedUrl) return { ...base, storagePath };
      return { ...base, storagePath, url: signed.data.signedUrl };
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
    return { ...base, mime, storagePath, ...(signed.data?.signedUrl ? { url: signed.data.signedUrl } : {}) };
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
}

/** Send one file to the extract chokepoint and get its text back. Throws with a
 *  student-readable message — the route writes those, so they surface as-is. */
export async function extractFile(file: File, uid: string | null): Promise<ExtractedFile> {
  const key = uid ? await deviceKey(uid) : null;
  if (!key) throw new Error("Sign in to read this attachment.");
  // A deck bigger than the route's 25 MB ceiling is almost entirely pictures;
  // its words fit in under 1 MB. Strip the media in the browser and send THAT,
  // so the file is read instead of refused (owner's 123.8 MB immunology deck:
  // slimmed to 0.11 MB, all 37 slides extracted). Slimming failure falls back
  // to the original — the route then answers with its own honest error.
  let payload = file;
  if (isSlimmableOfficeName(file.name) && file.size > OFFICE_SLIM_THRESHOLD_BYTES) {
    try {
      const slimmed = slimOfficeArchive(new Uint8Array(await file.arrayBuffer()));
      if (slimmed.byteLength < file.size) payload = new File([slimmed as BlobPart], file.name, { type: file.type });
    } catch {
      // Not a real zip, or hostile contents — the route's own guards decide.
    }
  }
  const form = new FormData();
  form.append("file", payload);
  const response = await fetch("/api/notebooks/extract/file", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const body = (await response.json().catch(() => null)) as {
    text?: string;
    title?: string;
    readBy?: string;
    error?: string;
  } | null;
  if (!response.ok || !body?.text) throw new Error(body?.error ?? `Couldn't read ${file.name}.`);
  return { readBy: body.readBy, text: body.text, title: body.title ?? null };
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
    // Header OUTSIDE the fence (chat-skills.ts matches on it, and the student's
    // own filename belongs to the app), content INSIDE it. The label is repeated
    // on the fence line by wrapUntrusted so the model can tell two fenced blocks
    // apart without leaving the fence.
    blocks.push(
      `### Attachment: ${source.label}\nType: ${source.type || "unknown"}\n\n` +
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
  const sources: AttachmentSource[] = await Promise.all(files.map(async (file) => {
    let content = "";
    try {
      if (isReadableText(file)) content = await file.text();
      // A picture goes to the same extractor as a document now: the server reads it with a
      // multimodal model and hands back a transcript (or, for a picture with no text in it, a
      // description). This is what used to be the "image pixels are not yet sent to the model"
      // apology — the pixels still never reach the chat model, but what is IN them does.
      else if (isExtractable(file)) content = (await extractFile(file, uid)).text;
      else content = "File attached; no text extractor is available for this format.";
    } catch (cause) {
      content = cause instanceof Error ? cause.message : "This attachment could not be read.";
    }
    return { content, label: relativePath(file) || file.name, type: file.type };
  }));

  return {
    attachments,
    displayText,
    // Per-file extracted text, in the same order as `files` — the caller's
    // content gates (is this a syllabus?) read these instead of re-extracting.
    sources,
    wireText: `${text.trim()}\n\n${fitAttachmentBlocks(sources).join("\n\n")}`.trim(),
  };
}
