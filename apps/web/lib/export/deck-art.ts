// The deck's background art, PAINTED IN CODE — not shipped as baked images.
//
// 🔴 WHY THIS EXISTS. The first slide theme carried its cover/section/closing art as three
// baked JPEG data URIs (~100KB of module). That is affordable for ONE theme and absurd for
// twenty: sixty images, ~2MB, and a regeneration ritual (SVG → rsvg-convert → bake script)
// standing between anyone and a new colourway. So the art became a function instead. A theme
// now describes its art in a dozen numbers, and the pixels are painted here, in plain
// TypeScript, on whichever machine is building the file.
//
// 🔴 ISOMORPHIC AND DEPENDENCY-FREE ON PURPOSE. No canvas (absent in Node), no zlib import
// (that is a server module), no new package: the PNG is assembled by hand. Compression uses
// CompressionStream, which browsers and Node both have, and falls back to STORED deflate
// blocks where it is missing — a bigger file, never a broken one. Rows are written with the
// PNG "Up" filter, which turns a smooth vertical ramp into long runs of zero bytes, so a
// background that is 260KB of pixels lands in the file as a handful of KB.
//
// The art is painted small (400×225) and stretched across the 13.33in slide. Gradients have no
// detail to lose, and upscaling a smooth ramp cannot introduce artefacts — it removes them.
// Banding is the real enemy at 8 bits per channel, so every pixel gets an ordered dither of
// well under one level before quantisation, which is invisible and kills the rings.

/** One soft light source. Coordinates and radius are fractions of the slide's width/height. */
export interface DeckGlow {
  color: string;
  /** 0 = left edge, 1 = right edge. */
  cx: number;
  /** 0 = top edge, 1 = bottom edge. */
  cy: number;
  /** Reach, as a fraction of the slide's diagonal. */
  r: number;
  /** How much of the glow's colour lands at its centre, 0..1. */
  strength: number;
}

/** A theme's recipe for one painted slide background. */
export interface DeckArt {
  /** The colour everything else sits on. */
  base: string;
  /** An optional straight ramp away from `base`. Angle in degrees: 0 → rightwards, 90 → down. */
  ramp?: { to: string; angle: number };
  /** Soft lights, painted in order. */
  glows?: DeckGlow[];
  /** Darkens the corners, 0..1. */
  vignette?: number;
  /** Deterministic film grain, 0..1 — a whisper of texture so flat areas do not look plastic.
   *  Grain is random by nature and so it is the one part of this that resists compression; it
   *  is kept to about one 8-bit level, which is enough to break up a gradient and cheap enough
   *  that a background still lands in the file at tens of KB. (It was briefly applied per
   *  COLUMN to compress better — that produced visible pinstripes at slide size. Never again.) */
  grain?: number;
}

const ART_W = 360;
const ART_H = 203;

/** #rrggbb (or rrggbb) → [r, g, b]. */
function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 0 at edge0, 1 at edge1, eased at both ends — the classic smoothstep. */
function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** 4×4 ordered dither, scaled to well under one 8-bit level — this is what keeps a long, slow
 *  ramp from banding into visible rings. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Cheap deterministic hash → -1..1, so grain is identical on every machine and every build. */
function noiseAt(x: number, y: number): number {
  let n = (x * 73_856_093) ^ (y * 19_349_663);
  n = (n ^ (n >>> 13)) * 1_274_126_177;
  return (((n ^ (n >>> 16)) >>> 0) / 0xffff_ffff) * 2 - 1;
}

/** Paint the art into a raw RGB byte grid. Exported for tests; the product wants `deckArtPng`. */
export function paintDeckArt(art: DeckArt, width = ART_W, height = ART_H): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  const base = rgbOf(art.base);
  const ramp = art.ramp ? rgbOf(art.ramp.to) : null;
  const angle = ((art.ramp?.angle ?? 0) * Math.PI) / 180;
  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  // A ramp runs from the corner most opposed to its direction to the one most along it, so the
  // full stop-to-stop range lands inside the slide whatever the angle.
  const span = Math.abs(ax) + Math.abs(ay) || 1;
  const glows = (art.glows ?? []).map((g) => ({ ...g, rgb: rgbOf(g.color) }));
  const aspect = width / height;

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      let r = base[0];
      let g = base[1];
      let b = base[2];

      if (ramp) {
        const t = smoothstep((((u - 0.5) * ax + (v - 0.5) * ay) / span + 0.5));
        r += (ramp[0] - r) * t;
        g += (ramp[1] - g) * t;
        b += (ramp[2] - b) * t;
      }

      for (const glow of glows) {
        // Distance measured in width-units so a circle reads as a circle on a 16:9 slide.
        const dx = u - glow.cx;
        const dy = (v - glow.cy) / aspect;
        const fall = smoothstep(1 - Math.sqrt(dx * dx + dy * dy) / glow.r) * glow.strength;
        if (fall <= 0) continue;
        r += (glow.rgb[0] - r) * fall;
        g += (glow.rgb[1] - g) * fall;
        b += (glow.rgb[2] - b) * fall;
      }

      if (art.vignette) {
        const dx = (u - 0.5) * 2;
        const dy = (v - 0.5) * 2;
        const edge = smoothstep((Math.sqrt(dx * dx + dy * dy) - 0.55) / 0.85) * art.vignette;
        r *= 1 - edge;
        g *= 1 - edge;
        b *= 1 - edge;
      }

      if (art.grain) {
        const n = noiseAt(x, y) * art.grain * 2.2;
        r += n;
        g += n;
        b += n;
      }

      const d = ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) / 16 - 0.5) * 0.9;
      const i = (y * width + x) * 3;
      out[i] = Math.max(0, Math.min(255, Math.round(r + d)));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(g + d)));
      out[i + 2] = Math.max(0, Math.min(255, Math.round(b + d)));
    }
  }
  return out;
}

// ── PNG, written by hand ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb8_8320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffff_ffff;
  for (let i = 0; i < bytes.length; i += 1) c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffff_ffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + (bytes[i] ?? 0)) % 65_521;
    b = (b + a) % 65_521;
  }
  return ((b << 16) | a) >>> 0;
}

function be32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const name = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
  const withName = new Uint8Array(name.length + body.length);
  withName.set(name);
  withName.set(body, name.length);
  const out = new Uint8Array(8 + body.length + 4);
  out.set(be32(body.length));
  out.set(withName, 4);
  out.set(be32(crc32(withName)), 8 + body.length);
  return out;
}

/** True DEFLATE via CompressionStream, or null where the platform lacks it. */
async function zlibDeflate(raw: Uint8Array): Promise<Uint8Array | null> {
  const CS = (globalThis as { CompressionStream?: new (format: string) => TransformStream }).CompressionStream;
  if (!CS) return null;
  try {
    const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CS("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** zlib stream carrying STORED (uncompressed) deflate blocks — the fallback. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const MAX = 65_535;
  const blocks = Math.max(1, Math.ceil(raw.length / MAX));
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let at = 2;
  for (let i = 0; i < blocks; i += 1) {
    const start = i * MAX;
    const len = Math.min(MAX, raw.length - start);
    out[at] = i === blocks - 1 ? 1 : 0;
    out[at + 1] = len & 0xff;
    out[at + 2] = (len >>> 8) & 0xff;
    out[at + 3] = ~len & 0xff;
    out[at + 4] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), at + 5);
    at += 5 + len;
  }
  out.set(be32(adler32(raw)), at);
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >>> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >>> 4)];
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >>> 6)];
    out += c === undefined ? "=" : B64[c & 63];
  }
  return out;
}

/** Wrap a raw RGB grid as a PNG. Rows use the "Up" filter: smooth ramps become runs of ~zero. */
export async function rgbToPng(rgb: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const at = y * (stride + 1);
    raw[at] = 2; // Up
    for (let x = 0; x < stride; x += 1) {
      const here = rgb[y * stride + x] ?? 0;
      const above = y === 0 ? 0 : (rgb[(y - 1) * stride + x] ?? 0);
      raw[at + 1 + x] = (here - above) & 0xff;
    }
  }
  const ihdr = new Uint8Array([...be32(width), ...be32(height), 8, 2, 0, 0, 0]);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", (await zlibDeflate(raw)) ?? zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const size = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}

// One build makes three backgrounds; the theme catalogue makes sixty. Painting is cheap but
// not free, and the same art recipe recurs, so remember what has already been painted.
const CACHE = new Map<string, Promise<string>>();

/** The product's entry point: an art recipe in, a `data:image/png;base64,…` string out. */
export function deckArtPng(art: DeckArt): Promise<string> {
  const key = JSON.stringify(art);
  const hit = CACHE.get(key);
  if (hit) return hit;
  const made = rgbToPng(paintDeckArt(art), ART_W, ART_H).then((png) => `data:image/png;base64,${base64(png)}`);
  CACHE.set(key, made);
  return made;
}
