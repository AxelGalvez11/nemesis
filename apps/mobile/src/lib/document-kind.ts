// What the phone will hand to the reader, and what it refuses before spending an
// upload on it. PURE — no expo imports — so it is Deno-testable; the picking and
// uploading live in api/documents.ts.
//
// The kinds here mirror the server's exactly (apps/web/app/api/notebooks/extract/
// file/route.ts): PDF, Word and PowerPoint. Anything else is refused HERE, with the
// file's own extension named, rather than uploaded and refused with a 415 after the
// student has waited for a 20 MB transfer.

/** Upload ceiling. The route's own MAX_BYTES is 25 MB and it answers 413 past that;
 *  checking first turns a wasted upload into an instant, specific message. */
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

/** The UTIs the iOS picker offers. Broad `item` is deliberately NOT used — the
 *  picker should grey out what the reader cannot read. */
export const DOCUMENT_PICKER_TYPES = [
  "com.adobe.pdf",
  "org.openxmlformats.wordprocessingml.document",
  "org.openxmlformats.presentationml.presentation",
] as const;

const MIMES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** The mime to send for a chosen file, or null when the reader cannot read it.
 *  Extension-led because iOS hands back a `content://`-style URI whose reported
 *  type is often a generic octet-stream. PURE. */
export function documentMime(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return MIMES[ext] ?? null;
}

/** Why a file was refused, in the student's words — or null when it is fine. PURE. */
export function documentRefusal(name: string, size: number | null): string | null {
  if (!documentMime(name)) {
    const ext = name.includes(".") ? name.toLowerCase().split(".").pop() : null;
    // .doc/.ppt are the near-misses worth naming: they are the OLD binary formats,
    // and "save as .docx" is a fix the student can actually carry out.
    if (ext === "doc" || ext === "ppt" || ext === "xls") {
      return `.${ext} is the older format. Open it and save as .${ext}x, then add it again.`;
    }
    return ext ? `Nemesis can't read .${ext} files yet. Add a PDF, Word or PowerPoint file.` : "Add a PDF, Word or PowerPoint file.";
  }
  if (size !== null && size > DOCUMENT_MAX_BYTES) {
    // A file one byte over rounds to "25.0 MB", and "that file is 25.0 MB, the limit
    // is 25 MB" reads as a bug rather than a limit. Say "just over" whenever the
    // rounded size lands on the cap.
    const shown = formatMb(size);
    return shown === formatMb(DOCUMENT_MAX_BYTES)
      ? "That file is just over the 25 MB limit."
      : `That file is ${shown} — the limit is 25 MB.`;
  }
  return null;
}

/** "31.4 MB", for a refusal message. PURE. */
export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The attachment chip's label: the file's own name without its extension, which is
 *  what the student recognises, capped so a long export filename cannot push the
 *  chip off the composer. PURE. */
export function documentChipTitle(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").trim();
  return (stem || name).slice(0, 120);
}
