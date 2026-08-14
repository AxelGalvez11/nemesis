/**
 * Every key the parser reads must reach the thread that runs it.
 *
 * 🔴🔴 THIS IS A GUARD AGAINST A SILENT DOWNGRADE, NOT AGAINST A CRASH, WHICH IS WHY IT HAS TO
 * EXIST AT ALL. `runParseOnThread` hands the worker an ALLOWLISTED environment — a deliberate
 * restriction, and the right one. But `parseDocument` is built to fall back whenever a provider is
 * unconfigured, so a key missing from that allowlist does not throw and does not log: the
 * synchronous upload lane reads a document with the vendor, the background worker reads the SAME
 * document with the local extractors, and `parsed_documents` keeps whichever finished last.
 *
 * That is precisely the failure `parse-document.ts` was written to prevent — "if each carried its
 * own copy of what counts as coverage, the same document would get two different records depending
 * on which lane reached it" — reintroduced one level down, where every test that calls
 * `parseDocument` directly still passes because those tests are not running in a worker thread.
 *
 * 🔴 IT ASSERTS A PROPERTY, NOT A LIST. The keys are DERIVED from the provider modules the parser
 * actually imports, so adding a provider that reads a new variable fails this test until the
 * allowlist forwards it. A hand-written list here would have to be updated by the same person who
 * forgot the allowlist, in the same edit, and would catch nothing.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const WEB_ROOT = join(import.meta.dirname, "..", "..");

/**
 * The extraction providers `parseDocument` can reach. Each of these reads its configuration from a
 * plain environment bag, so a static read of `env.SOMETHING` is a faithful inventory of what it
 * needs — these modules deliberately never touch `process.env` by any other route.
 */
const PROVIDER_MODULES = [
  "lib/notebooks/mistral-ocr.ts",
  "lib/notebooks/llamaparse-ocr.ts",
  "lib/vision/gemini.ts",
  "lib/pdf/vision.ts",
];

/** Every `env.SOMETHING` a module reads. */
function envKeysRead(relativePath: string): Set<string> {
  const source = readFileSync(join(WEB_ROOT, relativePath), "utf8");
  const keys = new Set<string>();
  for (const match of source.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})\b/g)) {
    if (match[1]) keys.add(match[1]);
  }
  return keys;
}

/** The names inside the `env: { … }` object `runParseOnThread` passes to the Worker. */
function allowlistedKeys(): Set<string> {
  const source = readFileSync(join(WEB_ROOT, "lib/notebooks/parse-run.ts"), "utf8");
  const block = /env:\s*\{([\s\S]*?)\n\s{4}\}/.exec(source);
  assert.ok(block, "parse-run.ts must still pass an explicit env allowlist to the Worker");
  const keys = new Set<string>();
  for (const match of (block[1] ?? "").matchAll(/^\s*([A-Z][A-Z0-9_]{2,})\s*:/gm)) {
    if (match[1]) keys.add(match[1]);
  }
  return keys;
}

test("🔴 every provider key the parser reads is forwarded to the worker thread", () => {
  const allowed = allowlistedKeys();
  assert.ok(allowed.size > 0, "the allowlist must not be empty");

  const missing: string[] = [];
  for (const module of PROVIDER_MODULES) {
    for (const key of envKeysRead(module)) {
      if (!allowed.has(key)) missing.push(`${key} (read by ${module})`);
    }
  }

  assert.deepEqual(
    missing,
    [],
    "these keys are read by the parser but never reach the worker thread, so the background lane " +
      "would silently parse the same document with a different extractor than the upload lane",
  );
});

test("the vendor's key is one of them, named explicitly", () => {
  // Named on purpose as well as derived: this is the variable whose absence caused the whole guard
  // to be written, and a derivation that stopped working would otherwise pass by finding nothing.
  const allowed = allowlistedKeys();
  assert.ok(allowed.has("MISTRAL_API_KEY"), "the PDF vendor's key must reach the worker");
  assert.ok(allowed.has("LLAMAPARSE_API_KEY"), "and the Office vendor's key must too");
  assert.ok(allowed.has("GEMINI_API_KEY"), "so must the vision key the PDF lane has always used");
});
