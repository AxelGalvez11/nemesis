// Fifty documents dropped at once: every one attached, one bad file costs one file, the indexer is
// asked to run, and the knowledge pass runs once.
//
// Owner, 2026-09-03: *"I should be able to drop in like 50 documents into the app and there should be
// no problem with any of them."* The survey that day found the batch aborting on the first unreadable
// file, fifty simultaneous uploads, a knowledge extraction refiring per file over a growing set, an
// indexer nudge that existed and was never called, and a send that stayed dead behind one red card.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const SESSION = read("./use-canvas-session.ts");
const CANVAS = read("./learning-canvas.tsx");
const HOME = read("./canvas-home.tsx");
const COMPOSER = read("./canvas-composer.tsx");

test("🔴🔴 one try per file: a file that cannot be read costs that file, and the batch reports by name", () => {
  const loop = SESSION.slice(SESSION.indexOf("for (const [index, file] of Array.from(files).entries())"), SESSION.indexOf("const outcome = attachOutcomeMessage(attached, failed);"));
  assert.match(loop, /^\s*try \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*const alreadyReading/m, "the per-file try is gone; one bad file aborts the batch again");
  assert.match(loop, /\} catch \(cause\) \{\s*failed\.push\(file\.name\);/, "a failed file is not recorded by name");
  assert.match(loop, /canvasCapture\("source_attach_failed"/);
  assert.match(SESSION, /const outcome = attachOutcomeMessage\(attached, failed\);\s*if \(outcome\) setError\(outcome\);/);
  assert.doesNotMatch(SESSION, /Nemesis couldn't read that file\./, "the single-file error string is back as the batch's only report");
});

test("🔴🔴 the knowledge pass runs once per batch, after the last file, never once per file", () => {
  const loop = SESSION.slice(SESSION.indexOf("for (const [index, file] of Array.from(files).entries())"), SESSION.indexOf("} finally {\n        setBusy({ kind: null });"));
  assert.doesNotMatch(loop, /ensureKnowledgeForCanvas/, "extraction fires inside the loop again");
  assert.match(SESSION, /if \(anyDurable\) \{\s*void \(async \(\) => \{\s*const resolved = await ensureKnowledgeForCanvas\(uid, latest\.current\);/);
});

test("🔴🔴 the indexer is asked to run as soon as a batch has landed", () => {
  assert.match(SESSION, /void supabase\.rpc\("run_source_indexing"\)/, "nothing calls the indexer nudge; a drop waits up to five minutes to be searchable");
});

test("🔴 reads go through one small pool on both doors, so fifty files are not fifty uploads at once", () => {
  assert.match(CANVAS, /const stagedReadPool = createReadPool\(\);/);
  assert.match(CANVAS, /const run = stagedReadPool\.run\(\(\) =>\s*extractFile\(file, uid, \{/);
  assert.match(HOME, /const frontDoorReadPool = createReadPool\(\);/);
  assert.match(HOME, /const run = frontDoorReadPool\.run\(\(\) =>\s*extractFile\(file, userId, \{/);
});

test("🔴 a failed file stays behind in the composer; only unread material holds the send", () => {
  assert.match(COMPOSER, /const materialNotReady = recentAttachments\.some\(\(file\) => file\.state === "reading"\);/);
  assert.match(CANVAS, /const entries = staged\.filter\(\(entry\) => entry\.state !== "failed"\);/);
  assert.match(CANVAS, /setStaged\(\(current\) => current\.filter\(\(entry\) => entry\.state === "failed"\)\)/);
});
