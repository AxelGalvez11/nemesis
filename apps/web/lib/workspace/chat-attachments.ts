"use client";

import { deviceKey } from "@/lib/workspace/chat-api";

const MAX_ATTACHMENT_CHARS = 12_000;
const MAX_TOTAL_CHARS = 22_000;
const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".pptx"];

function isDocument(file: File) {
  const name = file.name.toLowerCase();
  return DOCUMENT_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function isReadableText(file: File) {
  if (file.type.startsWith("text/")) return true;
  return /\.(md|mdx|txt|csv|json|ts|tsx|js|jsx|py|java|c|cpp|h|css|html|xml|yaml|yml|sql)$/i.test(file.name);
}

async function extractDocument(file: File, uid: string | null): Promise<string> {
  const key = uid ? await deviceKey(uid) : null;
  if (!key) throw new Error("Sign in to read this attachment.");
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/notebooks/extract/file", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const body = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!response.ok || !body?.text) throw new Error(body?.error ?? `Couldn't read ${file.name}.`);
  return body.text;
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
      else if (isDocument(file)) content = await extractDocument(file, uid);
      else if (file.type.startsWith("image/")) {
        content = "Image attached. The current text model can identify the filename and media type, but image pixels are not yet sent to the model.";
      } else {
        content = "File attached; no text extractor is available for this format.";
      }
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
