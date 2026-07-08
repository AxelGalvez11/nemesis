// Shared download-filename slugger for the export routes (was copy-pasted in all three). PURE.
export function safeFilename(title: string, ext: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report";
  return `${base}.${ext}`;
}
