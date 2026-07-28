// Deno unit tests (repo convention) for the silence trimmer.
// Run: deno test --no-check apps/mobile/src/lib/wav-trim.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { base64ToBytes, bytesToBase64, planKeptRanges, readWav, trimWavSilence } from "./wav-trim.ts";

const RATE = 16_000;

/** A mono 16-bit WAV whose payload is the given samples. */
function wav(samples: Int16Array, rate = RATE, channels = 1): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const put = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) out[at + i] = text.charCodeAt(i);
  };
  put(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  put(36, "data");
  view.setUint32(40, dataBytes, true);
  new Int16Array(out.buffer, 44, samples.length).set(samples);
  return out;
}

/** `seconds` of loud-ish speech, as a cheap alternating waveform. */
function speech(seconds: number, amplitude = 6000): Int16Array {
  const out = new Int16Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) out[i] = i % 2 === 0 ? amplitude : -amplitude;
  return out;
}

/** `seconds` of room tone — quiet, but not digital zero. */
function quiet(seconds: number, amplitude = 20): Int16Array {
  const out = new Int16Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) out[i] = i % 2 === 0 ? amplitude : -amplitude;
  return out;
}

function concat(...parts: Int16Array[]): Int16Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

Deno.test("a long dead stretch is cut, and the file really does get shorter", () => {
  const source = wav(concat(speech(3), quiet(10), speech(3)));
  const result = trimWavSilence(source);
  assert(result, "ten seconds of silence should be worth trimming");
  assertEquals(Math.round(result.originalSeconds), 16);
  // 10s of silence minus 250ms kept at each end ≈ 9.5s removed.
  assert(result.trimmedSeconds < 7, `expected under 7s, got ${result.trimmedSeconds}`);
  assert(result.trimmedSeconds > 6, `expected over 6s of speech to survive, got ${result.trimmedSeconds}`);
  assert(result.bytes.length < source.length);
});

Deno.test("SHORT pauses survive whole — they are the cue diarization reads", () => {
  // Half a second between sentences. Cutting this is what makes a classmate's
  // question stop being distinguishable from the lecturer.
  const result = trimWavSilence(wav(concat(speech(3), quiet(0.5), speech(3))));
  assertEquals(result, null, "a 0.5s gap is under the floor and must not be cut");
});

Deno.test("the kept ranges keep padding at each end of a cut, so words are not clipped", () => {
  const frames = concat(speech(2), quiet(6), speech(2));
  const kept = planKeptRanges(frames, 1, RATE);
  assertEquals(kept.length, 2);
  const firstEnd = kept[0]![1];
  const secondStart = kept[1]![0];
  // The first block runs past the 2s mark by roughly the 250ms of kept edge.
  assert(firstEnd > 2 * RATE, "the cut must start after the speech ends, not at it");
  assert(firstEnd < 2.6 * RATE, `kept too much lead-out: ${firstEnd / RATE}s`);
  // The second block starts before the 8s mark by roughly the same.
  assert(secondStart < 8 * RATE, "the cut must end before the speech resumes");
  assert(secondStart > 7.4 * RATE, `kept too much lead-in: ${secondStart / RATE}s`);
});

Deno.test("THE HEADER MATCHES THE PAYLOAD — a stale byte count reads as a provider bug", () => {
  const result = trimWavSilence(wav(concat(speech(2), quiet(8), speech(2))));
  assert(result);
  const out = result.bytes;
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const dataBytes = view.getUint32(40, true);
  assertEquals(dataBytes, out.length - 44, "data chunk size must equal the bytes actually written");
  assertEquals(view.getUint32(4, true), 36 + dataBytes, "RIFF size must be 36 + payload");
  assertEquals(String.fromCharCode(...out.slice(0, 4)), "RIFF");
  assertEquals(String.fromCharCode(...out.slice(8, 12)), "WAVE");
  assertEquals(String.fromCharCode(...out.slice(36, 40)), "data");
  // Format survives the round trip, or the provider decodes noise.
  assertEquals(view.getUint16(22, true), 1, "channels");
  assertEquals(view.getUint32(24, true), RATE, "sample rate");
  assertEquals(view.getUint16(34, true), 16, "bits per sample");
});

Deno.test("the trimmed file re-reads as a valid WAV of the reported length", () => {
  const result = trimWavSilence(wav(concat(speech(2), quiet(8), speech(2))));
  assert(result);
  const info = readWav(result.bytes);
  assert(info, "our own output must parse");
  assertEquals(info.sampleRate, RATE);
  assertEquals(info.channels, 1);
  assertEquals(info.dataLength / 2 / RATE, result.trimmedSeconds);
});

Deno.test("dense speech is left ALONE rather than rewritten for nothing", () => {
  assertEquals(trimWavSilence(wav(speech(10))), null);
});

Deno.test("the threshold adapts — a loud room's speech is not mistaken for silence", () => {
  // Room tone ten times louder than the quiet case. A fixed threshold tuned for
  // a silent room would cut the speech here; the measured floor must not.
  const loudRoom = concat(speech(3, 9000), quiet(8, 400), speech(3, 9000));
  const result = trimWavSilence(wav(loudRoom));
  assert(result, "the loud room's dead air is still dead air");
  assert(result.trimmedSeconds > 6, `speech was eaten: only ${result.trimmedSeconds}s left`);
  assert(result.trimmedSeconds < 8, `silence survived: ${result.trimmedSeconds}s left`);
});

Deno.test("readWav walks the chunks — `data` is not always at byte 44", () => {
  // A LIST chunk between `fmt ` and `data`, which real recorders emit. Assuming
  // the canonical offset would read this metadata as audio.
  const samples = speech(1);
  const base = wav(samples);
  const listBody = new Uint8Array(10);
  const withList = new Uint8Array(base.length + 8 + listBody.length);
  withList.set(base.subarray(0, 36), 0);
  const view = new DataView(withList.buffer);
  for (let i = 0; i < 4; i += 1) withList[36 + i] = "LIST".charCodeAt(i);
  view.setUint32(40, listBody.length, true);
  withList.set(listBody, 44);
  withList.set(base.subarray(36), 44 + listBody.length);
  // RIFF size grows by the inserted chunk.
  view.setUint32(4, withList.length - 8, true);

  const info = readWav(withList);
  assert(info, "a WAV with a LIST chunk must still parse");
  assertEquals(info.dataOffset, 44 + listBody.length + 8);
  assertEquals(info.dataLength, samples.length * 2);
});

Deno.test("anything that is not 16-bit PCM returns null rather than corrupting audio", () => {
  assertEquals(readWav(new Uint8Array(10)), null);
  assertEquals(readWav(new Uint8Array(64)), null);
  // Right size, wrong magic.
  const notRiff = wav(speech(1));
  notRiff[0] = "X".charCodeAt(0);
  assertEquals(readWav(notRiff), null);
  // 32-bit float, which the recorder emits if outputEncoding is ever changed.
  const float32 = wav(speech(1));
  new DataView(float32.buffer).setUint16(34, 32, true);
  assertEquals(readWav(float32), null);
});

Deno.test("a data chunk whose size overruns the file is clamped, not read past", () => {
  const truncated = wav(speech(1));
  new DataView(truncated.buffer).setUint32(40, 999_999, true);
  const info = readWav(truncated);
  assert(info);
  assertEquals(info.dataLength, truncated.length - 44);
});

Deno.test("base64 survives a round trip at EVERY remainder — padding is where this breaks", () => {
  // 0, 1 and 2 bytes over a multiple of three exercise all three padding cases.
  // A wrong pad byte corrupts the tail of the audio, which reads as a provider
  // problem rather than an encoding one.
  for (const length of [0, 1, 2, 3, 4, 5, 6, 255, 256, 257]) {
    const source = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) source[i] = (i * 37 + 11) % 256;
    const round = base64ToBytes(bytesToBase64(source));
    assertEquals(round.length, source.length, `length changed at ${length} bytes`);
    assertEquals(Array.from(round), Array.from(source), `bytes changed at ${length} bytes`);
  }
});

Deno.test("base64 round-trips a whole WAV, header and all", () => {
  const source = wav(concat(speech(1), quiet(2), speech(1)));
  const round = base64ToBytes(bytesToBase64(source));
  assertEquals(Array.from(round), Array.from(source));
  // And the round-tripped copy still parses as the same audio.
  assertEquals(readWav(round)?.dataLength, readWav(source)?.dataLength);
});

Deno.test("base64ToBytes ignores whitespace and padding rather than decoding it", () => {
  const source = new Uint8Array([1, 2, 3, 4, 5]);
  const encoded = bytesToBase64(source);
  assertEquals(Array.from(base64ToBytes(`${encoded}\n`)), Array.from(source));
  assertEquals(Array.from(base64ToBytes(encoded.replace(/(.{2})/, "$1\n "))), Array.from(source));
});

Deno.test("bytesToBase64 crosses its internal chunk boundary cleanly", () => {
  // The encoder flushes every 8192 output chars; a bug at the seam would only
  // show up above that, so this input is deliberately well past it.
  const source = new Uint8Array(20_000);
  for (let i = 0; i < source.length; i += 1) source[i] = (i * 7) % 256;
  assertEquals(Array.from(base64ToBytes(bytesToBase64(source))), Array.from(source));
});
