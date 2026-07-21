// Anki .apkg media manifest parsing. The zip stores media as numbered files
// ("0", "1", …) plus a "media" manifest mapping numbers back to real
// filenames. Legacy exports store the manifest as JSON; the newest format
// (alongside collection.anki21b) stores it as zstd-compressed protobuf
// (MediaEntries: repeated { name, size, sha1 }, where the list index IS the
// zip entry name). Pure and dependency-injected so tests build fixtures.

/** zstd frames always open with this magic number. */
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function isZstd(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && ZSTD_MAGIC.every((byte, index) => bytes[index] === byte);
}

function readVarint(bytes: Uint8Array, at: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let pos = at;
  while (pos < bytes.length) {
    const byte = bytes[pos];
    pos += 1;
    if (byte === undefined) break;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { next: pos, value };
    shift += 7;
    if (shift > 49) break;
  }
  throw new Error("Bad varint in media manifest.");
}

/** Walk one protobuf MediaEntry message and return its `name` field. */
function readEntryName(bytes: Uint8Array): string | null {
  let pos = 0;
  while (pos < bytes.length) {
    const tag = readVarint(bytes, pos);
    pos = tag.next;
    const field = Math.floor(tag.value / 8);
    const wire = tag.value % 8;
    if (wire === 2) {
      const len = readVarint(bytes, pos);
      const start = len.next;
      const end = start + len.value;
      if (end > bytes.length) return null;
      if (field === 1) return new TextDecoder().decode(bytes.subarray(start, end));
      pos = end;
    } else if (wire === 0) {
      pos = readVarint(bytes, pos).next;
    } else if (wire === 5) {
      pos += 4;
    } else if (wire === 1) {
      pos += 8;
    } else {
      return null;
    }
  }
  return null;
}

function parseProtobufManifest(bytes: Uint8Array): Map<string, string> {
  const names = new Map<string, string>();
  let pos = 0;
  let index = 0;
  while (pos < bytes.length) {
    const tag = readVarint(bytes, pos);
    pos = tag.next;
    const field = Math.floor(tag.value / 8);
    const wire = tag.value % 8;
    if (wire !== 2) throw new Error("Bad media manifest structure.");
    const len = readVarint(bytes, pos);
    const start = len.next;
    const end = start + len.value;
    if (end > bytes.length) throw new Error("Truncated media manifest.");
    if (field === 1) {
      const name = readEntryName(bytes.subarray(start, end));
      if (name) names.set(String(index), name);
      index += 1;
    }
    pos = end;
  }
  return names;
}

/** Parse a .apkg "media" manifest into a map of zip entry name ("0", "1", …)
 *  to the original media filename. Returns an empty map when the manifest is
 *  missing or unreadable — callers treat that as "no media carried over". */
export function parseMediaManifest(bytes: Uint8Array | undefined, decompressZstd: (data: Uint8Array) => Uint8Array): Map<string, string> {
  if (!bytes || bytes.length === 0) return new Map();
  try {
    if (isZstd(bytes)) return parseProtobufManifest(decompressZstd(bytes));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    const names = new Map<string, string>();
    if (parsed && typeof parsed === "object") {
      for (const [zipName, fileName] of Object.entries(parsed)) {
        if (typeof fileName === "string" && fileName) names.set(zipName, fileName);
      }
    }
    return names;
  } catch {
    return new Map();
  }
}

/** Media files inside the newest .apkg format are each zstd-compressed on
 *  top of the zip. Legacy packages store them raw — the magic number tells. */
export function decompressMediaFile(bytes: Uint8Array, decompressZstd: (data: Uint8Array) => Uint8Array): Uint8Array {
  return isZstd(bytes) ? decompressZstd(bytes) : bytes;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".ico"]);

/** Whether a media filename looks like an image we can carry into cards. */
export function isImageFileName(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(fileName.slice(dot).toLowerCase());
}

/** Build an `<img src>` resolver over uploaded/hosted media URLs. Anki src
 *  attributes can differ from manifest names in unicode normalization and
 *  percent-encoding, so lookups try those variants before giving up. */
export function buildImageResolver(urls: Map<string, string>): (src: string) => string | null {
  return (src: string) => {
    // Some cards embed images straight off the web — already hosted, keep them.
    if (/^https?:\/\//i.test(src)) return src;
    const direct = urls.get(src);
    if (direct) return direct;
    const normalized = urls.get(src.normalize("NFC"));
    if (normalized) return normalized;
    try {
      return urls.get(decodeURIComponent(src)) ?? urls.get(decodeURIComponent(src).normalize("NFC")) ?? null;
    } catch {
      return null;
    }
  };
}
