// How big a picture actually is, in pixels, read from its own header.
//
// Deciding whether a slide picture is a figure or a bullet glyph used to be done on
// FILE SIZE, and a real lecture deck showed that to be wrong in both directions:
//
//   • a 1408×523 pharmacokinetics figure stored as flat line art is 4.6 KB — under
//     any sane byte floor, and it was being dropped unseen;
//   • a 16×16 icon saved as a JPEG is 21.9 KB — over the floor, and it was being
//     sent to a vision model to be described as "a small icon".
//
// Pixels separate them cleanly (glyphs in that corpus were 3×3, 16×16, 80×32, 153×32;
// the smallest real figure was 140×134), and every format PowerPoint embeds states
// its size in the first few dozen bytes. So: read the header, don't guess from bytes.
//
// PURE. Bytes in, dimensions out — no decoding of pixel data.

export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0): boolean {
  if (bytes.length < at + prefix.length) return false;
  return prefix.every((byte, index) => bytes[at + index] === byte);
}

function beU32(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;
}

function beU16(bytes: Uint8Array, at: number): number {
  return (bytes[at]! << 8) | bytes[at + 1]!;
}

function leU16(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8);
}

function leU32(bytes: Uint8Array, at: number): number {
  return (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;
}

/** PNG: an 8-byte signature then IHDR, whose first two fields are width and height. */
function pngSize(bytes: Uint8Array): ImageSize | null {
  if (!startsWith(bytes, PNG_SIGNATURE) || bytes.length < 24) return null;
  return { height: beU32(bytes, 20), width: beU32(bytes, 16) };
}

/**
 * JPEG: walk the segment chain to a Start Of Frame marker, which carries the real
 * dimensions. Progressive (SOF2) and the arithmetic-coded variants are all valid
 * frame markers; DHT (C4), DNL (C8) and DAC (CC) sit in the same numeric range and
 * are not frames, so they are excluded by name rather than by luck.
 */
function jpegSize(bytes: Uint8Array): ImageSize | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = bytes[at + 1]!;
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = beU16(bytes, at + 2);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (at + 9 > bytes.length) return null;
      return { height: beU16(bytes, at + 5), width: beU16(bytes, at + 7) };
    }
    at += 2 + length;
  }
  return null;
}

/** GIF: the logical screen descriptor sits right after the 6-byte header. */
function gifSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 10) return null;
  const header = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!);
  if (header !== "GIF") return null;
  return { height: leU16(bytes, 8), width: leU16(bytes, 6) };
}

/** WebP: a RIFF container whose VP8 / VP8L / VP8X chunk states the size differently. */
function webpSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 30) return null;
  const tag = (at: number) => String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const chunk = tag(12);
  if (chunk === "VP8X") return { height: 1 + (leU32(bytes, 24) & 0xffffff), width: 1 + (leU32(bytes, 21) & 0xffffff) };
  if (chunk === "VP8L") {
    const bits = leU32(bytes, 21);
    return { height: 1 + ((bits >> 14) & 0x3fff), width: 1 + (bits & 0x3fff) };
  }
  if (chunk === "VP8 ") return { height: leU16(bytes, 28) & 0x3fff, width: leU16(bytes, 26) & 0x3fff };
  return null;
}

/**
 * The pixel size of a PNG / JPEG / GIF / WebP, or null when the header cannot be
 * read. Null means "unknown", never "small" — a caller must not treat an unreadable
 * header as grounds to discard the picture.
 */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  const size = pngSize(bytes) ?? jpegSize(bytes) ?? gifSize(bytes) ?? webpSize(bytes);
  if (!size) return null;
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) return null;
  if (size.width <= 0 || size.height <= 0) return null;
  return size;
}
