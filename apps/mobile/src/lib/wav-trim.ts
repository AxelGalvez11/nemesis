// Cutting the dead air out of a lecture before we pay to transcribe it.
//
// Owner 2026-07-27: "instead of processing 1 hour of audio, can the audio be
// trimmed to cut out silence and filler words like 'uh'?"
//
// SILENCE, yes — AssemblyAI bills SUBMITTED DURATION, so a minute not sent is a
// minute not paid for. FILLER WORDS, no: you cannot find "uh" without a
// transcript, and the transcript is the thing we are trying to buy less of.
// (AssemblyAI leaves disfluencies out of its text by default anyway, free.)
//
// PURE, and no native module: `expo-speech-recognition` writes raw 16-bit PCM
// (its iOS `outputEncoding` union has no compressed option), and slicing raw PCM
// is byte work JS can do. That is why this ships over the air instead of waiting
// for the binary that adds a real encoder.
//
// THREE THINGS THIS DELIBERATELY DOES NOT DO:
//
//   1. It does not cut every pause. Runs shorter than MIN_SILENCE_MS survive
//      untouched, and KEEP_EDGE_MS of every cut run is kept at each end. Pauses
//      are the acoustic cue AssemblyAI's speaker diarization leans on — splice
//      them all out and a classmate's question stops being distinguishable from
//      the lecturer, which is the whole reason we pay the +$0.02/hr for labels.
//   2. It does not use a fixed loudness threshold. A lecture hall's noise floor
//      is not a studio's, and a fixed number either cuts nothing in a loud room
//      or eats quiet speech in a silent one. The floor is measured from THIS
//      recording's own quietest windows.
//   3. It does not patch the original header. A trimmed file whose header still
//      claims the old byte count is the failure that reads as a provider bug —
//      a truncated or garbled transcript with nothing in the logs. A fresh
//      canonical header is written instead.

/** 16-bit PCM WAV, narrowed to what we need to re-cut it. */
export interface WavInfo {
  sampleRate: number;
  channels: number;
  /** Byte offset of the `data` chunk's payload. */
  dataOffset: number;
  /** Length of the `data` chunk's payload, in bytes. */
  dataLength: number;
}

export interface TrimOptions {
  /** Shorter silences survive whole. Default 1200ms. */
  minSilenceMs?: number;
  /** Retained at each end of a cut run, so words are never clipped and the gap
   *  still reads as a pause. Default 250ms. */
  keepEdgeMs?: number;
}

export interface TrimResult {
  bytes: Uint8Array;
  originalSeconds: number;
  trimmedSeconds: number;
}

/** Analysis window. Short enough to catch the gap between sentences, long
 *  enough that one loud click does not keep a whole second alive. */
const WINDOW_MS = 20;
const MIN_SILENCE_MS = 1200;
const KEEP_EDGE_MS = 250;
/** The recording's own noise floor, taken this far up the sorted window levels —
 *  not the minimum, which a single digitally-silent window would drag to zero. */
const NOISE_FLOOR_PERCENTILE = 0.05;
/** And its speech level, taken this far up. Not the maximum, which one chair
 *  scrape would set. */
const SPEECH_LEVEL_PERCENTILE = 0.9;
const FLOOR_MULTIPLIER = 2;
/**
 * The threshold sits this far below the SPEECH level, which is the part of this
 * that a first attempt got backwards.
 *
 * Deriving the threshold from the noise floor alone (floor × 2) is fine when a
 * recording actually contains silence and blows up when it does not: in dense
 * speech the quietest windows ARE speech, so the floor lands at speaking volume,
 * `floor × 2` lands above it, every window reads as silent, and the trimmer
 * deletes the entire lecture. Two tests caught exactly that. Anchoring to the
 * loud end instead makes the threshold mean "much quieter than this person
 * talking", which is what silence actually is.
 */
const SPEECH_LEVEL_FRACTION = 0.08;
/**
 * Below this much separation between the quiet and loud ends there is no
 * speech/silence split to find — a uniformly loud recording (dense speech) or a
 * uniformly quiet one. Nothing is cut, which is the safe answer for both.
 */
const MIN_SEPARATION_RATIO = 4;
/** Absolute backstop on the Int16 scale (max 32767). */
const ABSOLUTE_MIN_LEVEL = 150;

const ascii = (bytes: Uint8Array, at: number): string =>
  String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0);

/**
 * Read a 16-bit PCM WAV's shape by WALKING its chunks — the `data` chunk is not
 * reliably at byte 44. Recorders interleave `LIST`/`fact`/`bext` metadata, and
 * assuming the canonical offset silently reads that metadata as audio.
 *
 * Returns null for anything that is not 16-bit PCM, so the caller can upload the
 * original untouched rather than corrupt it.
 */
export function readWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  if (ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WAVE") return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let formatTag = 0;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === "fmt " && body + 16 <= bytes.length) {
      formatTag = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === "data") {
      // A recorder killed mid-write can leave a size field larger than the file;
      // clamp rather than read past the end.
      const dataLength = Math.min(size, bytes.length - body);
      if (formatTag !== 1 || bitsPerSample !== 16 || channels < 1 || sampleRate < 1) return null;
      if (dataLength <= 0) return null;
      return { channels, dataLength, dataOffset: body, sampleRate };
    }

    // Chunks are word-aligned: an odd size carries a pad byte that is not
    // counted in the size field.
    offset = body + size + (size % 2);
  }
  return null;
}

/**
 * The sample ranges worth keeping, as [startFrame, endFrame) pairs.
 *
 * Exported for its own tests: this is where every judgement call about what
 * counts as silence lives, and it is far easier to pin here than through a
 * whole encode/decode round trip.
 */
export function planKeptRanges(
  frames: Int16Array,
  channels: number,
  sampleRate: number,
  options: TrimOptions = {},
): Array<[number, number]> {
  const frameCount = Math.floor(frames.length / channels);
  const windowFrames = Math.max(1, Math.round((sampleRate * WINDOW_MS) / 1000));
  const windowCount = Math.ceil(frameCount / windowFrames);
  if (frameCount === 0) return [];

  // One loudness number per window (RMS across all channels).
  const levels = new Float64Array(windowCount);
  for (let w = 0; w < windowCount; w += 1) {
    const from = w * windowFrames;
    const to = Math.min(frameCount, from + windowFrames);
    let sum = 0;
    let counted = 0;
    for (let frame = from; frame < to; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = frames[frame * channels + channel] ?? 0;
        sum += sample * sample;
        counted += 1;
      }
    }
    levels[w] = counted > 0 ? Math.sqrt(sum / counted) : 0;
  }

  // Both ends of THIS recording, not numbers picked in advance. See note 2.
  const sorted = Float64Array.from(levels).sort();
  const at = (percentile: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))] ?? 0;
  const noiseFloor = at(NOISE_FLOOR_PERCENTILE);
  const speechLevel = at(SPEECH_LEVEL_PERCENTILE);

  // No separation, nothing to find — keep everything.
  if (speechLevel < noiseFloor * MIN_SEPARATION_RATIO) return [[0, frameCount]];

  const threshold = Math.max(
    noiseFloor * FLOOR_MULTIPLIER,
    speechLevel * SPEECH_LEVEL_FRACTION,
    ABSOLUTE_MIN_LEVEL,
  );

  const minSilenceWindows = Math.ceil(
    ((options.minSilenceMs ?? MIN_SILENCE_MS) / 1000) * sampleRate / windowFrames,
  );
  const keepEdgeWindows = Math.floor(
    ((options.keepEdgeMs ?? KEEP_EDGE_MS) / 1000) * sampleRate / windowFrames,
  );

  // Silent runs long enough to be worth cutting, minus the edges we keep.
  const drop: Array<[number, number]> = [];
  let runStart: number | null = null;
  for (let w = 0; w <= windowCount; w += 1) {
    const quiet = w < windowCount && (levels[w] ?? 0) <= threshold;
    if (quiet) {
      if (runStart === null) runStart = w;
      continue;
    }
    if (runStart !== null) {
      const runLength = w - runStart;
      if (runLength >= minSilenceWindows) {
        const from = runStart + keepEdgeWindows;
        const to = w - keepEdgeWindows;
        if (to > from) drop.push([from, to]);
      }
      runStart = null;
    }
  }

  if (drop.length === 0) return [[0, frameCount]];

  // Invert the dropped windows into kept frame ranges.
  const kept: Array<[number, number]> = [];
  let cursor = 0;
  for (const [from, to] of drop) {
    const dropStartFrame = Math.min(frameCount, from * windowFrames);
    const dropEndFrame = Math.min(frameCount, to * windowFrames);
    if (dropStartFrame > cursor) kept.push([cursor, dropStartFrame]);
    cursor = dropEndFrame;
  }
  if (cursor < frameCount) kept.push([cursor, frameCount]);
  return kept;
}

/**
 * A shorter WAV with the sustained silence removed, or null when there is
 * nothing worth doing (unreadable, not 16-bit PCM, or already dense).
 *
 * Returning null rather than throwing is deliberate: the caller uploads the
 * original in that case, so a recording can never be LOST to a trimming bug —
 * the worst outcome is the bill we already have today.
 */
export function trimWavSilence(bytes: Uint8Array, options: TrimOptions = {}): TrimResult | null {
  const info = readWav(bytes);
  if (!info) return null;

  const bytesPerFrame = info.channels * 2;
  const usableLength = info.dataLength - (info.dataLength % bytesPerFrame);
  if (usableLength <= 0) return null;

  // Copy rather than view: the source offset is rarely 2-byte aligned, and
  // Int16Array demands alignment.
  const pcm = bytes.slice(info.dataOffset, info.dataOffset + usableLength);
  const frames = new Int16Array(pcm.buffer, pcm.byteOffset, usableLength / 2);
  const totalFrames = usableLength / bytesPerFrame;

  const kept = planKeptRanges(frames, info.channels, info.sampleRate, options);
  const keptFrames = kept.reduce((sum, [from, to]) => sum + (to - from), 0);
  if (keptFrames <= 0 || keptFrames >= totalFrames) return null;

  const keptBytes = keptFrames * bytesPerFrame;
  const out = new Uint8Array(44 + keptBytes);
  writeCanonicalHeader(out, info.channels, info.sampleRate, keptBytes);

  let writeAt = 44;
  for (const [from, to] of kept) {
    out.set(pcm.subarray(from * bytesPerFrame, to * bytesPerFrame), writeAt);
    writeAt += (to - from) * bytesPerFrame;
  }

  return {
    bytes: out,
    originalSeconds: totalFrames / info.sampleRate,
    trimmedSeconds: keptFrames / info.sampleRate,
  };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Standard base64 (padded) → bytes. Hand-rolled for the same reason
 * lib/library-sync.ts hand-rolls its base64url variant: Hermes has no Buffer and
 * `atob` is not guaranteed, and keeping it dependency-free lets this module load
 * under Deno for its tests.
 *
 * The output is sized up front and filled by index — a multi-megabyte lecture
 * through `push` on a plain array is measurably slower and holds far more memory.
 */
export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let at = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    buffer = (buffer << 6) | B64.indexOf(clean[i] as string);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at] = (buffer >> bits) & 0xff;
      at += 1;
    }
  }
  return at === out.length ? out : out.subarray(0, at);
}

/** Bytes → standard padded base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  // Joined in chunks rather than one growing string: repeated concatenation of a
  // multi-megabyte string is what turns a 3-second save into a stall.
  const chunks: string[] = [];
  let piece = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    piece += B64[a >> 2];
    piece += B64[((a & 3) << 4) | (b >> 4)];
    piece += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : "=";
    piece += i + 2 < bytes.length ? B64[c & 63] : "=";
    if (piece.length >= 8_192) {
      chunks.push(piece);
      piece = "";
    }
  }
  if (piece) chunks.push(piece);
  return chunks.join("");
}

/** A fresh 44-byte RIFF/WAVE header whose sizes match the payload exactly. */
function writeCanonicalHeader(out: Uint8Array, channels: number, sampleRate: number, dataBytes: number): void {
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const put = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) out[at + i] = text.charCodeAt(i);
  };
  const byteRate = sampleRate * channels * 2;

  put(0, "RIFF");
  // Everything after this field: 36 header bytes + the payload.
  view.setUint32(4, 36 + dataBytes, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // format tag: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  put(36, "data");
  view.setUint32(40, dataBytes, true);
}
