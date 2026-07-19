// Shared source-extraction helpers, used by both the "+" finder dialog and the drag-and-drop dropzone
// on the Context card so they run the exact same path: mint the device key, POST the file/URL to the
// Node extract route, then write the resulting text row through the store (RLS-scoped). Each throws a
// student-readable Error on failure; callers own their own busy/error UI.

import type { NotebookSourceKind } from "@/lib/notebooks/api";
import { deviceKey } from "@/lib/workspace/chat-api";

type AddExtracted = (
  notebookId: string,
  input: { kind: "url" | "pdf" | "docx" | "pptx" | "youtube"; name: string; content: string; sourceUrl?: string | null; bytes?: number | null },
) => Promise<void>;

/** Accepted upload extensions (kept in sync with the file extract route's sniffing). */
export const ACCEPTED_FILE_EXTS = [".pdf", ".docx", ".pptx"] as const;

export function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_FILE_EXTS.some((ext) => name.endsWith(ext));
}

export async function extractAndAddFile(opts: {
  uid: string | null;
  notebookId: string;
  file: File;
  addExtracted: AddExtracted;
}): Promise<void> {
  const key = opts.uid ? await deviceKey(opts.uid) : null;
  if (!key) throw new Error("Sign in to add a file.");
  const fd = new FormData();
  fd.append("file", opts.file);
  const res = await fetch("/api/notebooks/extract/file", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  const body = (await res.json().catch(() => null)) as
    | { kind?: NotebookSourceKind; title?: string; text?: string; bytes?: number; error?: string }
    | null;
  if (!res.ok || !body?.text || !body.kind) throw new Error(body?.error ?? "Couldn't read that file.");
  await opts.addExtracted(opts.notebookId, {
    kind: body.kind as "pdf" | "docx" | "pptx",
    name: body.title ?? opts.file.name,
    content: body.text,
    bytes: body.bytes ?? opts.file.size,
  });
}

export async function extractAndAddUrl(opts: {
  uid: string | null;
  notebookId: string;
  url: string;
  addExtracted: AddExtracted;
}): Promise<void> {
  const key = opts.uid ? await deviceKey(opts.uid) : null;
  if (!key) throw new Error("Sign in to add a web link.");
  const res = await fetch("/api/notebooks/extract/url", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: opts.url }),
  });
  const body = (await res.json().catch(() => null)) as
    | { title?: string; text?: string; sourceUrl?: string; bytes?: number; error?: string }
    | null;
  if (!res.ok || !body?.text) throw new Error(body?.error ?? "Couldn't read that page.");
  await opts.addExtracted(opts.notebookId, {
    kind: "url",
    name: body.title ?? opts.url,
    content: body.text,
    sourceUrl: body.sourceUrl ?? opts.url,
    bytes: body.bytes ?? null,
  });
}
