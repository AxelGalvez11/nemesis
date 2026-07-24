// Reading the .tiff figures PowerPoint decks carry.
//
// WHY. Slides made on a Mac often store pictures as TIFF, a format no vision model
// accepts. One real pharmacology deck held 14 of them — up to 4.7 MB, 1300×936 —
// every one a lecture figure, and every one skipped for having the wrong extension.
//
// WHAT THEY ARE. Measured: all fourteen were UNCOMPRESSED, chunky (not planar) RGB
// with 8 bits a sample. That is the simplest thing TIFF can be — the pixels are
// already sitting there in strips — so they only need copying into a PNG.
//
// WHAT THIS DELIBERATELY DOES NOT DO. LZW, PackBits, JPEG-in-TIFF, CMYK, 16-bit
// samples, tiled layouts: all return null and are reported unreadable. A partly
// implemented decoder that produces a sheared or false-coloured figure is worse than
// an honest "couldn't read this one" — the model would describe the wrong picture.
//
// PURE: bytes in, bytes out.
import { downscaleRgb, encodePng, MAX_PIXELS } from "./emf-bitmap";

const TAG_WIDTH = 256;
const TAG_HEIGHT = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_PHOTOMETRIC = 262;
const TAG_STRIP_OFFSETS = 273;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_ROWS_PER_STRIP = 278;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_PLANAR = 284;

const COMPRESSION_NONE = 1;
const PHOTOMETRIC_WHITE_IS_ZERO = 0;
const PHOTOMETRIC_BLACK_IS_ZERO = 1;
const PHOTOMETRIC_RGB = 2;

export interface DecodedImage {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
}

interface Reader {
  u16(at: number): number;
  u32(at: number): number;
}

function reader(bytes: Uint8Array, littleEndian: boolean): Reader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    u16: (at) => view.getUint16(at, littleEndian),
    u32: (at) => view.getUint32(at, littleEndian),
  };
}

/** Is this a TIFF at all? Checked before any offset in it is trusted. */
export function isTiff(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  const big = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!little && !big) return false;
  return reader(bytes, little).u16(2) === 42;
}

/** Every value of one tag, resolved whether it sits inline or at an offset. */
function tagValues(bytes: Uint8Array, r: Reader, entryAt: number): number[] {
  const type = r.u16(entryAt + 2);
  const count = r.u32(entryAt + 4);
  const size = type === 3 ? 2 : 4; // SHORT or LONG; other types are not used by the tags read here.
  if (type !== 3 && type !== 4) return [];
  const inline = count * size <= 4;
  const at = inline ? entryAt + 8 : r.u32(entryAt + 8);
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = at + i * size;
    if (offset + size > bytes.length) return [];
    out.push(size === 2 ? r.u16(offset) : r.u32(offset));
  }
  return out;
}

interface Ifd {
  [tag: number]: number[];
}

function readIfd(bytes: Uint8Array, r: Reader): Ifd | null {
  const ifdAt = r.u32(4);
  if (ifdAt + 2 > bytes.length) return null;
  const count = r.u16(ifdAt);
  const ifd: Ifd = {};
  for (let i = 0; i < count; i += 1) {
    const entryAt = ifdAt + 2 + i * 12;
    if (entryAt + 12 > bytes.length) return null;
    ifd[r.u16(entryAt)] = tagValues(bytes, r, entryAt);
  }
  return ifd;
}

/**
 * A baseline uncompressed TIFF as a PNG, or null when it is any of the many other
 * things a TIFF is allowed to be. Null means "say so", not "pretend it wasn't there".
 */
export function tiffImage(bytes: Uint8Array): DecodedImage | null {
  if (!isTiff(bytes)) return null;
  const little = bytes[0] === 0x49;
  const r = reader(bytes, little);
  const ifd = readIfd(bytes, r);
  if (!ifd) return null;

  const first = (tag: number, fallback: number | null = null) => ifd[tag]?.[0] ?? fallback;
  const width = first(TAG_WIDTH);
  const height = first(TAG_HEIGHT);
  const samples = first(TAG_SAMPLES_PER_PIXEL, 1)!;
  const bits = ifd[TAG_BITS_PER_SAMPLE] ?? [8];
  const photometric = first(TAG_PHOTOMETRIC, PHOTOMETRIC_RGB)!;
  if (!width || !height || width <= 0 || height <= 0) return null;
  if (first(TAG_COMPRESSION, COMPRESSION_NONE) !== COMPRESSION_NONE) return null;
  if (first(TAG_PLANAR, 1) !== 1) return null;
  if (bits.some((depth) => depth !== 8)) return null;
  if (samples < 1 || samples > 4) return null;
  const isGrey = photometric === PHOTOMETRIC_BLACK_IS_ZERO || photometric === PHOTOMETRIC_WHITE_IS_ZERO;
  if (photometric !== PHOTOMETRIC_RGB && !isGrey) return null;
  if (photometric === PHOTOMETRIC_RGB && samples < 3) return null;

  const offsets = ifd[TAG_STRIP_OFFSETS] ?? [];
  const counts = ifd[TAG_STRIP_BYTE_COUNTS] ?? [];
  if (!offsets.length || offsets.length !== counts.length) return null;
  const rowsPerStrip = first(TAG_ROWS_PER_STRIP, height)!;

  const rowBytes = width * samples;
  const rgb = new Uint8Array(width * height * 3);
  let row = 0;
  for (let strip = 0; strip < offsets.length && row < height; strip += 1) {
    const from = offsets[strip]!;
    const length = counts[strip]!;
    if (from + length > bytes.length) return null;
    const rowsHere = Math.min(rowsPerStrip, height - row);
    if (length < rowsHere * rowBytes) return null;
    for (let y = 0; y < rowsHere; y += 1) {
      let at = from + y * rowBytes;
      let to = (row + y) * width * 3;
      for (let x = 0; x < width; x += 1) {
        if (isGrey) {
          // WhiteIsZero stores light as low numbers, which renders as a negative.
          const value = photometric === PHOTOMETRIC_WHITE_IS_ZERO ? 255 - bytes[at]! : bytes[at]!;
          rgb[to] = value;
          rgb[to + 1] = value;
          rgb[to + 2] = value;
        } else {
          rgb[to] = bytes[at]!;
          rgb[to + 1] = bytes[at + 1]!;
          rgb[to + 2] = bytes[at + 2]!;
        }
        at += samples; // A fourth sample is alpha or unused; either way it is dropped.
        to += 3;
      }
    }
    row += rowsHere;
  }
  if (row < height) return null; // Fewer strips than the header promised.

  const pixels = width * height;
  const factor = pixels > MAX_PIXELS ? Math.ceil(Math.sqrt(pixels / MAX_PIXELS)) : 1;
  const scaled = downscaleRgb(rgb, width, height, factor);
  return {
    bytes: encodePng(scaled.rgb, scaled.width, scaled.height),
    height: scaled.height,
    mime: "image/png",
    width: scaled.width,
  };
}
