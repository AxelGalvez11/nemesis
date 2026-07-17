// Deno unit tests (repo convention) for the library-sync pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/library-sync.test.ts
//
// Imports ONLY library-sync.ts, which is dependency-free by design (like
// missions-helpers.ts) so this file loads clean under Deno. Crypto interop with the
// Mac publisher is covered desktop-side, not here.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSections,
  bytesFromBase64Url,
  mergeRows,
  PAIRING_PREFIX,
  parseDocJson,
  parsePairingCode,
  syncCursor,
  type SyncCache,
  type SyncRow,
} from "./library-sync.ts";

// Tiny local encoder so tests can construct valid pairing codes from raw bytes.
function base64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += alphabet[(buffer >> bits) & 0x3f];
    }
  }
  if (bits > 0) out += alphabet[(buffer << (6 - bits)) & 0x3f];
  return out;
}

Deno.test("bytesFromBase64Url: decodes a known vector", () => {
  assertEquals(bytesFromBase64Url("AAAA"), new Uint8Array([0, 0, 0]));
  assertEquals(bytesFromBase64Url("_w"), new Uint8Array([255]));
});

Deno.test("bytesFromBase64Url: rejects non-alphabet chars and impossible lengths", () => {
  assertEquals(bytesFromBase64Url("ab+/"), null); // classic base64, not base64url
  assertEquals(bytesFromBase64Url("abcde"), null); // len % 4 === 1 can't happen
});

Deno.test("parsePairingCode: round-trips a 32-byte key and tolerates whitespace", () => {
  const key = new Uint8Array(Array.from({ length: 32 }, (_, i) => i * 7 % 256));
  const code = `  ${PAIRING_PREFIX}${base64Url(key)} \n`;
  assertEquals(parsePairingCode(code), key);
});

Deno.test("parsePairingCode: rejects wrong prefix, wrong key length, garbage", () => {
  const key31 = base64Url(new Uint8Array(31));
  assertEquals(parsePairingCode(`nemsync2.${base64Url(new Uint8Array(32))}`), null);
  assertEquals(parsePairingCode(`${PAIRING_PREFIX}${key31}`), null);
  assertEquals(parsePairingCode("not a code at all"), null);
  assertEquals(parsePairingCode(""), null);
});

function row(overrides: Partial<SyncRow> & Pick<SyncRow, "path_hash" | "updated_at">): SyncRow {
  return { payload: "cipher", deleted: false, ...overrides };
}

Deno.test("mergeRows: newer row wins, older row is ignored, input cache untouched", () => {
  const cache: SyncCache = {
    aaa: { pathHash: "aaa", payload: "old", deleted: false, updatedAt: "2026-07-16T01:00:00+00:00" },
  };
  const merged = mergeRows(cache, [
    row({ path_hash: "aaa", payload: "new", updated_at: "2026-07-16T02:00:00+00:00" }),
    row({ path_hash: "aaa", payload: "stale", updated_at: "2026-07-16T00:30:00+00:00" }),
  ]);
  assertEquals(merged.aaa.payload, "new");
  assertEquals(cache.aaa.payload, "old"); // immutability
});

Deno.test("mergeRows: tombstone beats older content and stays cached", () => {
  const cache: SyncCache = {
    aaa: { pathHash: "aaa", payload: "cipher", deleted: false, updatedAt: "2026-07-16T01:00:00+00:00" },
  };
  const merged = mergeRows(cache, [
    { path_hash: "aaa", payload: null, deleted: true, updated_at: "2026-07-16T03:00:00+00:00" },
  ]);
  assertEquals(merged.aaa.deleted, true);
  assertEquals(merged.aaa.payload, null);
});

Deno.test("mergeRows: a newer non-deleted row resurrects a tombstoned path", () => {
  const cache: SyncCache = {
    aaa: { pathHash: "aaa", payload: null, deleted: true, updatedAt: "2026-07-16T03:00:00+00:00" },
  };
  const merged = mergeRows(cache, [
    row({ path_hash: "aaa", payload: "reborn", updated_at: "2026-07-16T04:00:00+00:00" }),
  ]);
  assertEquals(merged.aaa.deleted, false);
  assertEquals(merged.aaa.payload, "reborn");
});

Deno.test("mergeRows: equal timestamps keep the cached row (idempotent overlap window)", () => {
  const cache: SyncCache = {
    aaa: { pathHash: "aaa", payload: "kept", deleted: false, updatedAt: "2026-07-16T01:00:00+00:00" },
  };
  const merged = mergeRows(cache, [
    row({ path_hash: "aaa", payload: "duplicate", updated_at: "2026-07-16T01:00:00+00:00" }),
  ]);
  assertEquals(merged.aaa.payload, "kept");
});

Deno.test("syncCursor: newest updated_at across the cache, empty string when empty", () => {
  assertEquals(syncCursor({}), "");
  const cache: SyncCache = {
    a: { pathHash: "a", payload: "x", deleted: false, updatedAt: "2026-07-16T01:00:00+00:00" },
    b: { pathHash: "b", payload: null, deleted: true, updatedAt: "2026-07-16T05:00:00+00:00" },
  };
  assertEquals(syncCursor(cache), "2026-07-16T05:00:00+00:00");
});

Deno.test("parseDocJson: accepts a valid v1 doc", () => {
  const doc = parseDocJson(JSON.stringify({ v: 1, path: "a/b.md", title: "B", kind: "note", content: "# B" }));
  assertEquals(doc?.path, "a/b.md");
  assertEquals(doc?.kind, "note");
});

Deno.test("parseDocJson: rejects wrong version, missing fields, and non-JSON", () => {
  assertEquals(parseDocJson(JSON.stringify({ v: 2, path: "a", title: "t", kind: "note", content: "" })), null);
  assertEquals(parseDocJson(JSON.stringify({ v: 1, title: "t", kind: "note", content: "" })), null);
  assertEquals(parseDocJson(JSON.stringify({ v: 1, path: "a", title: "t", kind: "note" })), null);
  assertEquals(parseDocJson("not json"), null);
  assertEquals(parseDocJson(JSON.stringify(null)), null);
});

Deno.test("buildSections: groups by top folder, root bucket first, sorted titles", () => {
  const sections = buildSections([
    { path: "PHCY 1205/exam-2.md", title: "Exam 2" },
    { path: "todo.md", title: "Todo" },
    { path: "Anatomy/heart.md", title: "Heart" },
    { path: "PHCY 1205/antibiotics.md", title: "Antibiotics" },
  ]);
  assertEquals(sections.map((s) => s.folder), ["", "Anatomy", "PHCY 1205"]);
  assertEquals(sections[2].notes.map((n) => n.title), ["Antibiotics", "Exam 2"]);
});
