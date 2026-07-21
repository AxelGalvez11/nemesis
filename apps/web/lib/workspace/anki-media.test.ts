import assert from "node:assert/strict";
import test from "node:test";
import * as zlib from "node:zlib";

import { buildImageResolver, decompressMediaFile, isImageFileName, parseMediaManifest } from "./anki-media";

const zstdCompressSync = (zlib as unknown as { zstdCompressSync: (data: Uint8Array) => Buffer }).zstdCompressSync;
const noDecompress = (data: Uint8Array) => data;
const zstdDecompressSync = (zlib as unknown as { zstdDecompressSync: (data: Uint8Array) => Buffer }).zstdDecompressSync;
const decompress = (data: Uint8Array) => new Uint8Array(zstdDecompressSync(data));

function pbLen(field: number, body: number[]): number[] {
  return [field * 8 + 2, body.length, ...body];
}
function pbString(field: number, value: string): number[] {
  return pbLen(field, Array.from(new TextEncoder().encode(value)));
}
function pbVarint(field: number, value: number): number[] {
  return [field * 8, value];
}

test("legacy JSON media manifest maps zip names to filenames", () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ "0": "heart.png", "1": "beep.mp3" }));
  const manifest = parseMediaManifest(bytes, noDecompress);
  assert.equal(manifest.get("0"), "heart.png");
  assert.equal(manifest.get("1"), "beep.mp3");
  assert.equal(manifest.size, 2);
});

test("modern zstd-protobuf manifest parses entries in order", () => {
  // MediaEntries { repeated MediaEntry entries = 1 }; MediaEntry { name=1, size=2, sha1=3 }
  const entry0 = [...pbString(1, "pic one.png"), ...pbVarint(2, 99), ...pbLen(3, [1, 2, 3])];
  const entry1 = [...pbString(1, "eq.jpg"), ...pbVarint(2, 5)];
  const outer = new Uint8Array([...pbLen(1, entry0), ...pbLen(1, entry1)]);
  const compressed = new Uint8Array(zstdCompressSync(outer));
  const manifest = parseMediaManifest(compressed, decompress);
  assert.equal(manifest.get("0"), "pic one.png");
  assert.equal(manifest.get("1"), "eq.jpg");
  assert.equal(manifest.size, 2);
});

test("missing or unreadable manifests come back empty instead of throwing", () => {
  assert.equal(parseMediaManifest(undefined, noDecompress).size, 0);
  assert.equal(parseMediaManifest(new Uint8Array(), noDecompress).size, 0);
  assert.equal(parseMediaManifest(new TextEncoder().encode("not json"), noDecompress).size, 0);
});

test("new-format media files decompress, legacy ones pass through", () => {
  const raw = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const compressed = new Uint8Array(zstdCompressSync(raw));
  assert.deepEqual(decompressMediaFile(compressed, decompress), raw);
  assert.deepEqual(decompressMediaFile(raw, decompress), raw);
});

test("image filename detection covers the common formats", () => {
  assert.equal(isImageFileName("heart.PNG"), true);
  assert.equal(isImageFileName("scan.jpeg"), true);
  assert.equal(isImageFileName("beep.mp3"), false);
  assert.equal(isImageFileName("noext"), false);
});

test("image resolver tries unicode and percent-encoded variants", () => {
  const urls = new Map([
    ["plain.png", "https://cdn/x/plain.png"],
    ["café.png", "https://cdn/x/cafe.png"],
  ]);
  const resolve = buildImageResolver(urls);
  assert.equal(resolve("plain.png"), "https://cdn/x/plain.png");
  // NFD form (e + combining accent) still finds the NFC key.
  assert.equal(resolve("café.png"), "https://cdn/x/cafe.png");
  assert.equal(resolve("plain%2Epng"), "https://cdn/x/plain.png");
  assert.equal(resolve("missing.png"), null);
  // Already-hosted web images pass straight through.
  assert.equal(resolve("https://example.com/pic.png"), "https://example.com/pic.png");
});
