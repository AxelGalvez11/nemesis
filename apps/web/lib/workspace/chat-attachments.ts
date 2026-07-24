"use client";

import { deviceKey } from "@/lib/workspace/chat-api";

const MAX_ATTACHMENT_CHARS = 12_000;
const MAX_TOTAL_CHARS = 22_000;
export const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".pptx"];
/** Pictures the server can read (lib/vision/gemini.ts). HEIC is here because it
 *  is what an iPhone writes, and a photo mailed to yourself and dropped in here
 *  is still a HEIC. */
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"];

export function isImage(file: File) {
  const name = file.name.toLowerCase();
  if (IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension))) return true;
  // A browser that reports the type but a filename without an extension (a
  // pasted screenshot) is still an image.
  return /^image\/(png|jpe?g|webp|heic|heif)$/.test(file.type.toLowerCase());
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
  const form = new FormData();
  form.append("file", file);
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

function attachmentSummary(files: readonly File[]) {
  if (!files.length) return "";
  return `\n\nAttachments: ${files.map((file) => file.name).join(", ")}`;
}

export async function prepareChatAttachments(text: string, files: readonly File[], uid: string | null) {
  const displayText = `${text.trim()}${attachmentSummary(files)}`.trim();
  if (!files.length) return { displayText, wireText: text.trim() };

  const blocks: string[] = [];
  let used = 0;
  for (const file of files) {
    if (used >= MAX_TOTAL_CHARS) break;
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
    const remaining = MAX_TOTAL_CHARS - used;
    const clipped = content.trim().slice(0, Math.min(MAX_ATTACHMENT_CHARS, remaining));
    blocks.push(`### Attachment: ${file.name}\nType: ${file.type || "unknown"}\n\n${clipped}`);
    used += clipped.length;
  }

  return {
    displayText,
    wireText: `${text.trim()}\n\n${blocks.join("\n\n")}`.trim(),
  };
}
