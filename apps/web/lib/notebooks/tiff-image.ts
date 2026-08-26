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
// WHAT THIS DELIBERATELY DOES NOT DO. PackBits, JPEG-in-TIFF, CMYK, 16-bit
// samples, tiled layouts: all return null and are reported unreadable. A partly
// implemented decoder that produces a sheared or false-coloured figure is worse than
// an honest "couldn't read this one" — the model would describe the wrong picture.
//
// LZW IS NO LONGER ON THAT LIST. A real pharmacogenomics course carried three
// lecture figures as LZW-compressed TIFF — among them a 2420×1870 slide-sized
// diagram — every one chunky 8-bit RGB differing from the uncompressed case ONLY
// in the strip encoding. TIFF's LZW is fully specified (12-bit codes, early
// change, optional horizontal-differencing predictor), so decoding it is exact,
// not approximate: a wrong bit fails the strip-length check and returns null
// rather than shearing the picture.
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

const TAG_PREDICTOR = 317;

const COMPRESSION_NONE = 1;
const COMPRESSION_LZW = 5;
const PHOTOMETRIC_WHITE_IS_ZERO = 0;
const PHOTOMETRIC_BLACK_IS_ZERO = 1;
const PHOTOMETRIC_RGB = 2;
const PREDICTOR_NONE = 1;
const PREDICTOR_HORIZONTAL = 2;

/** LZW's three fixed codes. Everything from 258 up is learned per strip. */
const LZW_CLEAR = 256;
const LZW_EOI = 257;
const LZW_FIRST_FREE = 258;
const LZW_MAX_WIDTH = 12;

/**
 * One TIFF LZW strip, decoded — or null when the stream is malformed.
 *
 * TIFF's variant, exactly: codes are packed MSB-first, start at 9 bits, and the
 * width grows with the table — one code EARLY ("early change": the width bumps
 * when the next free entry is `2^width - 1`, not `2^width`), which is the single
 * detail that separates a clean decode from a sheared one. The table resets on
 * every Clear code, and every strip begins with one.
 *
 * `expected` bounds the output: a strip never legitimately decodes past the
 * rows it covers, so a stream that tries is corrupt and refused rather than
 * allowed to allocate without limit. PURE.
 */
export function tiffLzwDecode(src: Uint8Array, expected: number): Uint8Array | null {
  const out = new Uint8Array(expected);
  let written = 0;

  // The table maps code → byte string. Entries 0-255 are their own byte.
  let entries: Uint8Array[] = [];
  let next = LZW_FIRST_FREE;
  let width = 9;
  const reset = () => {
    entries = [];
    next = LZW_FIRST_FREE;
    width = 9;
  };
  reset();
  const stringOf = (code: number): Uint8Array | null => {
    if (code < 256) return Uint8Array.of(code);
    const learned = entries[code - LZW_FIRST_FREE];
    return learned ?? null;
  };

  let bitAt = 0;
  const totalBits = src.length * 8;
  const readCode = (): number | null => {
    if (bitAt + width > totalBits) return null;
    let value = 0;
    for (let i = 0; i < width; i += 1) {
      const byte = src[bitAt >> 3]!;
      value = (value << 1) | ((byte >> (7 - (bitAt & 7))) & 1);
      bitAt += 1;
    }
    return value;
  };

  let previous: Uint8Array | null = null;
  // Every strip a real encoder writes begins with a Clear code. Data that does
  // not is not an LZW stream at all — zeroed bytes, for instance, would
  // otherwise "decode" into a run of literal zeros and paint a black picture.
  let cleared = false;
  for (;;) {
    const code = readCode();
    if (code === null) return null; // Ran out of bits before EOI: truncated stream.
    if (code === LZW_EOI) break;
    if (code === LZW_CLEAR) {
      reset();
      previous = null;
      cleared = true;
      continue;
    }
    if (!cleared) return null;

    let emit: Uint8Array;
    if (previous === null) {
      // The first code after a Clear must be a literal; anything else is corrupt.
      const literal = stringOf(code);
      if (!literal || code >= LZW_FIRST_FREE) return null;
      emit = literal;
    } else {
      const known = stringOf(code);
      if (known) {
        emit = known;
      } else if (code === next) {
        // The one legal not-yet-defined code: previous + its own first byte.
        emit = new Uint8Array(previous.length + 1);
        emit.set(previous);
        emit[previous.length] = previous[0]!;
      } else {
        return null;
      }
      const learned = new Uint8Array(previous.length + 1);
      learned.set(previous);
      learned[previous.length] = emit[0]!;
      entries.push(learned);
      next += 1;
      // Early change: TIFF writers widen one code before the table is actually
      // full, so the reader must too or every code after that point shifts.
      if (next === (1 << width) - 1 && width < LZW_MAX_WIDTH) width += 1;
    }

    if (written + emit.length > expected) return null; // Decodes past its rows: corrupt.
    out.set(emit, written);
    written += emit.length;
    previous = emit;
    if (written === expected) break; // Strip complete; trailing EOI is optional in practice.
  }
  return written === expected ? out : null;
}

/**
 * Undo horizontal differencing in place: each byte was stored as the delta from
 * the same sample one pixel to the left. PURE, given its buffer.
 */
export function undoHorizontalPredictor(
  strip: Uint8Array,
  rows: number,
  rowBytes: number,
  samples: number,
): void {
  for (let y = 0; y < rows; y += 1) {
    const start = y * rowBytes;
    for (let x = samples; x < rowBytes; x += 1) {
      strip[start + x] = (strip[start + x]! + strip[start + x - samples]!) & 0xff;
    }
  }
}

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
  const compression = first(TAG_COMPRESSION, COMPRESSION_NONE)!;
  if (compression !== COMPRESSION_NONE && compression !== COMPRESSION_LZW) return null;
  const predictor = first(TAG_PREDICTOR, PREDICTOR_NONE)!;
  // The predictor is defined alongside LZW; a differenced uncompressed strip is
  // not a thing any writer produces, so it is refused rather than guessed at.
  if (predictor !== PREDICTOR_NONE && predictor !== PREDICTOR_HORIZONTAL) return null;
  if (predictor === PREDICTOR_HORIZONTAL && compression !== COMPRESSION_LZW) return null;
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
    // One buffer per strip whichever encoding it arrived in: the raw bytes for an
    // uncompressed strip, the decoded ones for LZW. The pixel copy below reads
    // strip-local offsets either way.
    let data: Uint8Array | null;
    if (compression === COMPRESSION_LZW) {
      data = tiffLzwDecode(bytes.subarray(from, from + length), rowsHere * rowBytes);
      if (data && predictor === PREDICTOR_HORIZONTAL) {
        undoHorizontalPredictor(data, rowsHere, rowBytes, samples);
      }
    } else {
      data = length >= rowsHere * rowBytes ? bytes.subarray(from, from + length) : null;
    }
    if (!data) return null;
    for (let y = 0; y < rowsHere; y += 1) {
      let at = y * rowBytes;
      let to = (row + y) * width * 3;
      for (let x = 0; x < width; x += 1) {
        if (isGrey) {
          // WhiteIsZero stores light as low numbers, which renders as a negative.
          const value = photometric === PHOTOMETRIC_WHITE_IS_ZERO ? 255 - data[at]! : data[at]!;
          rgb[to] = value;
          rgb[to + 1] = value;
          rgb[to + 2] = value;
        } else {
          rgb[to] = data[at]!;
          rgb[to + 1] = data[at + 1]!;
          rgb[to + 2] = data[at + 2]!;
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
