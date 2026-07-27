// Reading the pictures PowerPoint hides inside .emf files.
//
// WHY THIS EXISTS. A slide picture pasted from another program is stored as an
// Enhanced Metafile (.emf) — a vector format no vision model accepts, so the figure
// extractor skipped every one of them. In one real pharmacokinetics class that threw
// away 30 MB of slide figures, including the largest images in the whole course.
//
// WHAT THE FILES TURNED OUT TO BE. Opening them record by record: header, ONE
// EMR_STRETCHDIBITS, end. No drawing commands at all. They are not vector art — they
// are ordinary screenshots (up to 2011×1231, 32-bit) in a metafile envelope, because
// that is what Windows produces when a picture is pasted through the clipboard.
//
// So this module unwraps exactly that shape: an EMF whose content is a single
// device-independent bitmap, re-encoded as a PNG a vision model can read. An EMF
// carrying real drawing records is left alone and reported as unreadable — pretending
// to read it would be worse than saying so. Deciding by INSPECTION, not by extension:
// small hand-drawn .emf arrows stay unreadable; a pasted 9 MB figure comes back.
//
// PURE: bytes in, bytes out. No fetch, no filesystem.
import { zlibSync } from "fflate";

/** EMF record types that carry a DIB with an identical field layout. */
const EMR_SETDIBITSTODEVICE = 80;
const EMR_STRETCHDIBITS = 81;
/** Both records put offBmiSrc..cbBitsSrc at these offsets from the record start. */
const DIB_FIELDS_AT = 48;
const EMR_HEADER_SIGNATURE = 0x464d4520; // " EMF", little-endian at byte 40.

/** Bitmap compressions we can turn into a PNG. */
const BI_RGB = 0;
const BI_JPEG = 4;
const BI_PNG = 5;
const BI_BITFIELDS = 3;

/** Above this many pixels the image is box-averaged down before encoding. A vision
 *  model gains nothing from a 9-megapixel screenshot, and the request has to travel. */
export const MAX_PIXELS = 2_200_000;

export interface EmbeddedImage {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
}

function leU32(bytes: Uint8Array, at: number): number {
  return (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;
}

function leI32(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24);
}

function leU16(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8);
}

/** Is this an Enhanced Metafile at all? Checked before any offset is trusted. */
export function isEmf(bytes: Uint8Array): boolean {
  return bytes.length >= 88 && leU32(bytes, 0) === 1 && leU32(bytes, 40) === EMR_HEADER_SIGNATURE;
}

interface DibRecord {
  bmiAt: number;
  bmiSize: number;
  bitsAt: number;
  bitsSize: number;
}

/**
 * Find the one DIB in an EMF that consists of nothing else. Walks the record chain
 * and refuses on the FIRST drawing record, so a metafile that both draws and blits
 * is reported unreadable rather than silently reduced to its bitmap half.
 */
export function findSoleDib(bytes: Uint8Array): DibRecord | null {
  if (!isEmf(bytes)) return null;
  let at = leU32(bytes, 4); // Skip the header record, whose own Size says how long it is.
  if (at < 88 || at >= bytes.length) return null;

  let found: DibRecord | null = null;
  while (at + 8 <= bytes.length) {
    const type = leU32(bytes, at);
    const size = leU32(bytes, at + 4);
    if (size < 8 || at + size > bytes.length) return null;
    if (type === 14) break; // EMR_EOF
    if (type === EMR_STRETCHDIBITS || type === EMR_SETDIBITSTODEVICE) {
      if (found) return null; // More than one picture: not the simple wrapper shape.
      const offBmi = leU32(bytes, at + DIB_FIELDS_AT);
      const cbBmi = leU32(bytes, at + DIB_FIELDS_AT + 4);
      const offBits = leU32(bytes, at + DIB_FIELDS_AT + 8);
      const cbBits = leU32(bytes, at + DIB_FIELDS_AT + 12);
      if (!offBmi || !cbBmi || !offBits || !cbBits) return null;
      if (at + offBits + cbBits > bytes.length) return null;
      found = { bitsAt: at + offBits, bitsSize: cbBits, bmiAt: at + offBmi, bmiSize: cbBmi };
    } else if (type !== 1 && !IGNORABLE_RECORDS.has(type)) {
      return null; // A real drawing command — this metafile is more than its bitmap.
    }
    at += size;
  }
  return found;
}

/** State-setting records that carry no marks of their own, so their presence does not
 *  stop a metafile from being "just a bitmap". */
const IGNORABLE_RECORDS = new Set([
  17, // EMR_SETMAPMODE
  18, // EMR_SETBKMODE
  19, // EMR_SETPOLYFILLMODE
  20, // EMR_SETROP2
  21, // EMR_SETSTRETCHBLTMODE
  22, // EMR_SETTEXTALIGN
  25, // EMR_SETTEXTCOLOR
  26, // EMR_SETBKCOLOR
  30, // EMR_SETVIEWPORTORGEX
  31, // EMR_SETWINDOWEXTEX
  32, // EMR_SETWINDOWORGEX
  33, // EMR_SETVIEWPORTEXTEX
  34, // EMR_SCALEVIEWPORTEXTEX
  35, // EMR_SCALEWINDOWEXTEX
  36, // EMR_SAVEDC
  37, // EMR_RESTOREDC
  38, // EMR_SETWORLDTRANSFORM
  39, // EMR_MODIFYWORLDTRANSFORM
  40, // EMR_SELECTOBJECT
  58, // EMR_SELECTCLIPPATH
  67, // EMR_INTERSECTCLIPRECT
  98, // EMR_SETICMMODE
]);

interface DibHeader {
  width: number;
  height: number;
  bitCount: number;
  compression: number;
  topDown: boolean;
  paletteBytes: number;
}

function readDibHeader(bytes: Uint8Array, at: number, size: number): DibHeader | null {
  if (size < 40 || at + 40 > bytes.length) return null;
  const headerSize = leU32(bytes, at);
  if (headerSize < 40) return null; // BITMAPCOREHEADER — not produced by the paste path.
  const rawHeight = leI32(bytes, at + 8);
  return {
    bitCount: leU16(bytes, at + 14),
    compression: leU32(bytes, at + 16),
    height: Math.abs(rawHeight),
    // Anything between the header and the pixels is a colour table or bit masks.
    paletteBytes: Math.max(0, size - headerSize),
    topDown: rawHeight < 0,
    width: leI32(bytes, at + 4),
  };
}

/** CRC-32 (PNG's polynomial). Small enough to own outright rather than take a dependency. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode 8-bit RGB rows as a PNG. `rgb` is width*height*3, top row first. PURE. */
export function encodePng(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 3;
  // PNG wants a filter byte in front of every scanline; 0 means "store as is",
  // which leaves all the compression to deflate and keeps this encoder honest.
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  const idat = zlibSync(raw, { level: 6 });
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}

/** Box-average an RGB buffer down by an integer factor. Averaging rather than
 *  dropping pixels keeps thin plot lines and small axis labels legible. PURE. */
export function downscaleRgb(rgb: Uint8Array, width: number, height: number, factor: number) {
  if (factor <= 1) return { height, rgb, width };
  const outW = Math.max(1, Math.floor(width / factor));
  const outH = Math.max(1, Math.floor(height / factor));
  const out = new Uint8Array(outW * outH * 3);
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const sy = y * factor + dy;
        if (sy >= height) break;
        for (let dx = 0; dx < factor; dx += 1) {
          const sx = x * factor + dx;
          if (sx >= width) break;
          const at = (sy * width + sx) * 3;
          r += rgb[at]!;
          g += rgb[at + 1]!;
          b += rgb[at + 2]!;
          n += 1;
        }
      }
      const at = (y * outW + x) * 3;
      out[at] = Math.round(r / n);
      out[at + 1] = Math.round(g / n);
      out[at + 2] = Math.round(b / n);
    }
  }
  return { height: outH, rgb: out, width: outW };
}

/**
 * Turn DIB pixels into top-down RGB. Handles the two bit depths the clipboard paste
 * path produces (32-bit BGRX and 24-bit BGR). The fourth byte of a 32-bit DIB is
 * NOT alpha here — Windows leaves it zero — so it is dropped rather than honoured,
 * which is the difference between a readable figure and a fully transparent one.
 */
export function dibToRgb(bytes: Uint8Array, at: number, header: DibHeader): Uint8Array | null {
  const { bitCount, height, topDown, width } = header;
  if (bitCount !== 24 && bitCount !== 32) return null;
  const bytesPerPixel = bitCount / 8;
  const stride = Math.ceil((width * bitCount) / 32) * 4; // DIB rows are 4-byte aligned.
  if (at + stride * height > bytes.length) return null;

  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = topDown ? y : height - 1 - y;
    let from = at + sourceRow * stride;
    let to = y * width * 3;
    for (let x = 0; x < width; x += 1) {
      rgb[to] = bytes[from + 2]!; // DIB stores blue, green, red.
      rgb[to + 1] = bytes[from + 1]!;
      rgb[to + 2] = bytes[from]!;
      from += bytesPerPixel;
      to += 3;
    }
  }
  return rgb;
}

/**
 * The picture inside an .emf, as something a vision model can read — or null when
 * the file is genuine vector drawing. Null is a fact to report, not a silence.
 */
export function emfEmbeddedImage(bytes: Uint8Array): EmbeddedImage | null {
  const dib = findSoleDib(bytes);
  if (!dib) return null;
  const header = readDibHeader(bytes, dib.bmiAt, dib.bmiSize);
  if (!header || header.width <= 0 || header.height <= 0) return null;

  // Already a real image file, merely wrapped twice over: hand it straight back.
  if (header.compression === BI_PNG || header.compression === BI_JPEG) {
    return {
      bytes: bytes.slice(dib.bitsAt, dib.bitsAt + dib.bitsSize),
      height: header.height,
      mime: header.compression === BI_PNG ? "image/png" : "image/jpeg",
      width: header.width,
    };
  }
  if (header.compression !== BI_RGB && header.compression !== BI_BITFIELDS) return null;

  const pixelsAt = dib.bitsAt;
  const rgb = dibToRgb(bytes, pixelsAt, header);
  if (!rgb) return null;

  const pixels = header.width * header.height;
  const factor = pixels > MAX_PIXELS ? Math.ceil(Math.sqrt(pixels / MAX_PIXELS)) : 1;
  const scaled = downscaleRgb(rgb, header.width, header.height, factor);
  return {
    bytes: encodePng(scaled.rgb, scaled.width, scaled.height),
    height: scaled.height,
    mime: "image/png",
    width: scaled.width,
  };
}
