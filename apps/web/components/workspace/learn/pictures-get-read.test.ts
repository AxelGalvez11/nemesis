import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴🔴🔴 "28 PICTURES WERE NOT READ", ABOUT A DOCUMENT WHOSE 28 PICTURES WERE ALL DESCRIBED.
//
// Owner, 2026-08-31, with a screenshot: *"it says that it was able to read the text, but it wasn't
// able to parse some images… everything needs to be able to be read and seen."*
//
// Two separate defects behind one sentence, measured on his own account:
//
// 1. THE WARNING WAS LYING. His steroid lecture's stored parse holds real descriptions for all 28
//    figures ("four chemical structures illustrating steroid frameworks: the Steroid template with
//    rings labeled A, B, C and D…"). The note came from the upload RESPONSE instead — and the
//    request that files a document does not look at figures, so it reported its own blindness as
//    the document's condition. The model was handed that sentence and repeated it to him.
//
// 2. NOTHING EVER LOOKED AT THE PICTURES IN THE FIRST PLACE. `lookAtFigures` is off on the upload
//    path (a real cost decision: up to 40 vision calls inside the request) and on in the background
//    worker — and nothing ever handed the worker a job. Nine of his documents sat with
//    "not-examined" figures for weeks, `parse_enqueued_at` null on every one. Queuing one by hand
//    described all eight of its pictures in 14 seconds, 2 vision calls.

const SESSION = readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8");
const SOURCES = readFileSync(new URL("../../../lib/learn/canvas-sources.ts", import.meta.url), "utf8");
const ATTACH = readFileSync(new URL("../../../lib/workspace/chat-attachments.ts", import.meta.url), "utf8");

function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const session = code(SESSION);
const sources = code(SOURCES);
const attach = code(ATTACH);

// ── 1. the disclosure reads the stored parse ────────────────────────────────

test("🔴🔴 the coverage note is derived from the STORED parse, not the upload response", () => {
  // 🔴 REPOINTED 2026-09-03. This pinned the exact ternary, and the read became `storedCoverage`
  // when the panel needed the learner's spelling of the same fact alongside the model's. The
  // INVARIANT is unchanged and is the only thing worth guarding: when a source has a filed row, the
  // disclosure is read back from STORAGE, never taken from the upload response, because the
  // response reports what THAT REQUEST could see and stating it as the document's coverage is how
  // a fully-read document came to be described as blind.
  assert.match(
    session,
    /extracted\.librarySourceId\s*\n?\s*\?\s*await storedCoverage\(extracted\.librarySourceId\)/,
    "the note is back on the response, which reports the REQUEST's blindness as the document's",
  );
  assert.match(sources, /export async function storedCoverage\(/);
  // 🔴 AND ONE READ, NOT TWO. The panel's wording and the packet's come from a single row: asking
  // twice means two answers to "what did this document miss", which is the failure this pair of
  // renderings exists to prevent.
  assert.match(sources, /return \{ label: coverageLabel\(coverage\), note: coverageNote\(coverage\) \};/);
});

test("🔴 a source with no filed row still gets the response's note", () => {
  // Nothing is stored to read back there, and saying nothing would be a silent upgrade from
  // partial to whole — the exact direction of error this whole area keeps failing in.
  // Repointed with the line above: the fallback still reads the response, it just now yields both
  // spellings rather than one string.
  assert.match(session, /: \{ label: coverageLabel\(extracted\.coverage\), note: coverageNote\(extracted\.coverage\) \}/);
});

test("🔴 the note is still refreshed on load, so it stops lying as the parse improves", () => {
  assert.match(session, /refreshedCoverageNotes/);
  assert.match(sources, /export async function refreshedCoverageNotes/);
});

// ── 2. unexamined pictures get examined ─────────────────────────────────────

test("🔴🔴 an upload that leaves pictures unlooked-at asks for a figure pass", () => {
  assert.match(attach, /const unexamined = readCoverage\(body\.coverage\)\?\.figures\.reasons\["not-examined"\] \?\? 0;/);
  assert.match(attach, /if \(filedSourceId && unexamined > 0\) \{/);
  assert.match(attach, /supabase\.rpc\("request_figure_pass", \{ p_source_id: filedSourceId \}\)/);
});

test("🔴 it is asked for through the DATABASE, not through the dead service key", () => {
  // `enqueueParse` needs SUPABASE_SERVICE_ROLE_KEY, a revoked legacy JWT on Vercel awaiting
  // rotation. This is the #918 pattern: the privileged step lives in Postgres, granted to
  // `authenticated`, driven by the learner's own session — so it works either way.
  const block = attach.slice(attach.indexOf("const unexamined ="), attach.indexOf("const unexamined =") + 400);
  assert.ok(!block.includes("enqueueParse"), "the figure pass went back through the dead-key path");
});

test("🔴 a failure there cannot fail the upload", () => {
  // The document is already usable; this only improves it. `void` plus a swallowed rejection, and
  // never an await that a student's upload could die on.
  assert.match(attach, /void supabase\.rpc\("request_figure_pass", [^)]*\)\.then\(undefined, \(\) => undefined\);/);
});

test("🔴 only a document that actually has unlooked-at pictures is queued", () => {
  // Never "queue everything with figures": a described figure is done, and re-reading it would
  // spend vision to learn nothing. The database function checks this a second time, because a
  // client-side condition is a request, not a rule.
  assert.match(attach, /unexamined > 0/);
});
