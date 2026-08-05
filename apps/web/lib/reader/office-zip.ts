"use client";

// Opening a .docx or .pptx in the BROWSER.
//
// The server-side equivalent (lib/notebooks/office.ts) imports node:crypto at
// module scope, so it cannot be reused here. This is the small part of it the
// reader actually needs — unzip, read a part as text, read a part as a blob URL
// — with the same bounds, because an Office file is still a zip and a zip can
// still be a bomb.

import { strFromU8, unzipSync } from "fflate";

/** Matches lib/notebooks/office.ts. A deck of a few hundred megabytes of
 *  uncompressed XML is already past anything real; past this it is an attack. */
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

export interface OfficeArchive {
  files: Record<string, Uint8Array>;
  /** A part as text, or null when it is not in the archive. */
  text: (name: string) => string | null;
}

export function openOfficeArchive(bytes: ArrayBuffer): OfficeArchive {
  let total = 0;
  let entries = 0;
  const files = unzipSync(new Uint8Array(bytes), {
    filter: (file) => {
      entries += 1;
      total += file.originalSize ?? 0;
      if (entries > MAX_ENTRIES) throw new Error("This file has too many parts to open safely.");
      if (total > MAX_TOTAL_BYTES) throw new Error("This file unpacks to more than Nemesis will open.");
      return true;
    },
  });

  return {
    files,
    text: (name: string) => {
      const data = files[name];
      return data ? strFromU8(data) : null;
    },
  };
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

/** A picture inside the archive, as an object URL the page can show. Returns
 *  null for formats no browser draws (EMF, WMF, TIFF) rather than handing back
 *  a URL that renders as a broken image — the caller says so instead.
 *
 *  🔴 SVG is deliberately excluded even though browsers draw it: an SVG from an
 *  uploaded document is untrusted markup that can carry script, and an object
 *  URL for it would be same-origin. */
export function officeImageUrl(archive: OfficeArchive, name: string | null): string | null {
  if (!name) return null;
  const data = archive.files[name];
  if (!data) return null;
  const extension = name.split(".").pop()?.toLocaleLowerCase() ?? "";
  const mime = IMAGE_MIME[extension];
  if (!mime || extension === "svg") return null;
  // A fresh copy: fflate hands back views onto one shared buffer, and Blob
  // would otherwise keep the whole archive alive for every picture.
  return URL.createObjectURL(new Blob([data.slice()], { type: mime }));
}
