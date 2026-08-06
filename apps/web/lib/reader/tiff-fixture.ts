// A minimal, real baseline TIFF, built byte by byte.
//
// Used by tests and by scripts/make-reader-fixture.mts so the TIFF lane can be
// exercised without shipping anyone's course material. Deliberately writes the
// same shape a scanner or a figure export produces: little-endian, one strip,
// no compression — which is exactly what the real immunology deck contains
// (all 57 of its TIFFs are uncompressed).

const HEADER_BYTES = 8;
const ENTRY_BYTES = 12;

type Tag = [tag: number, type: number, count: number, value: number];

const TYPE_SHORT = 3;
const TYPE_LONG = 4;

export interface TiffFixtureOptions {
  width: number;
  height: number;
  /** 3 = RGB, 4 = RGBA. Four writes an ExtraSamples tag so the alpha is
   *  declared rather than left for a reader to guess. */
  samples?: 3 | 4;
  /** Called for each pixel; return [r, g, b, a] with 0-255 components. */
  pixel?: (x: number, y: number) => [number, number, number, number];
}

/** An uncompressed baseline TIFF as bytes. */
export function makeTiff(options: TiffFixtureOptions): Uint8Array {
  const { width, height, samples = 3 } = options;
  const pixel = options.pixel ?? ((x: number, y: number): [number, number, number, number] => [
    (x * 8) % 256,
    (y * 8) % 256,
    128,
    255,
  ]);

  const pixelBytes = width * height * samples;
  // After the IFD come the arrays too big to sit inside a 12-byte entry
  // (BitsPerSample is `samples` shorts), then the pixels themselves.
  const entries: Tag[] = [];
  const bitsCount = samples;
  const ifdEntryCount = samples === 4 ? 10 : 9;
  const ifdBytes = 2 + ifdEntryCount * ENTRY_BYTES + 4;
  const bitsOffset = HEADER_BYTES + ifdBytes;
  const pixelOffset = bitsOffset + bitsCount * 2;

  // Tags MUST be written in ascending order — a reader is entitled to binary
  // search them, and an out-of-order IFD is silently wrong rather than broken.
  entries.push([256, TYPE_LONG, 1, width]); // ImageWidth
  entries.push([257, TYPE_LONG, 1, height]); // ImageLength
  entries.push([258, TYPE_SHORT, bitsCount, bitsOffset]); // BitsPerSample
  entries.push([259, TYPE_SHORT, 1, 1]); // Compression: none
  entries.push([262, TYPE_SHORT, 1, 2]); // PhotometricInterpretation: RGB
  entries.push([273, TYPE_LONG, 1, pixelOffset]); // StripOffsets
  entries.push([277, TYPE_SHORT, 1, samples]); // SamplesPerPixel
  entries.push([278, TYPE_LONG, 1, height]); // RowsPerStrip: the whole image
  entries.push([279, TYPE_LONG, 1, pixelBytes]); // StripByteCounts
  if (samples === 4) entries.push([338, TYPE_SHORT, 1, 2]); // ExtraSamples: unassociated alpha

  const total = pixelOffset + pixelBytes;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);

  // Header: little-endian, magic 42, first IFD straight after.
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, HEADER_BYTES, true);

  view.setUint16(HEADER_BYTES, entries.length, true);
  entries.forEach(([tag, type, count, value], index) => {
    const at = HEADER_BYTES + 2 + index * ENTRY_BYTES;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    // A SHORT with count 1 lives in the FIRST two bytes of the value field, not
    // the last — writing it as a uint32 works only on little-endian, which is
    // what this file declares.
    if (type === TYPE_SHORT && count === 1) view.setUint16(at + 8, value, true);
    else view.setUint32(at + 8, value, true);
  });
  view.setUint32(HEADER_BYTES + 2 + entries.length * ENTRY_BYTES, 0, true); // no next IFD

  for (let sample = 0; sample < bitsCount; sample += 1) view.setUint16(bitsOffset + sample * 2, 8, true);

  let at = pixelOffset;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      bytes[at] = r;
      bytes[at + 1] = g;
      bytes[at + 2] = b;
      if (samples === 4) bytes[at + 3] = a;
      at += samples;
    }
  }
  return bytes;
}
