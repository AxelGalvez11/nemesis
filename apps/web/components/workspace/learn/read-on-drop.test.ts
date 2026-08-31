import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴🔴 MATERIAL IS READ WHEN IT LANDS, NOT WHEN YOU PRESS SEND.
//
// Owner, 2026-08-31: *"read them on drop, like chatgpt."* Measured on production the same day,
// before this shipped: the front door made ZERO network calls while files sat staged. Every
// second the learner spent typing their question was a second the upload and the parse had not
// begun, and all of it then happened after send while they watched a caption.
//
// The reference reads while you type. Three things have to hold for ours to do the same, and each
// fails silently on its own:
//   1. staging STARTS the read (`extractFile`, the one chokepoint every lane shares);
//   2. the in-flight call TRAVELS to the canvas with its file, so nothing is read twice;
//   3. the canvas CLAIMS it instead of starting its own.
//
// Break 2 or 3 and everything still works, visibly — the same deck is just uploaded and parsed
// twice, which costs a learner on a phone their data and us a second vision bill. That is exactly
// the kind of defect that never gets reported, so it gets a test.

const HOME = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");
const HANDOFF = readFileSync(new URL("./pending-attachment.ts", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const SESSION = readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8");

function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const home = code(HOME);
const handoff = code(HANDOFF);
const canvas = code(CANVAS);
const session = code(SESSION);

// ── 1. staging starts the read ──────────────────────────────────────────────

test("🔴🔴 dropping material starts reading it immediately", () => {
  const stage = home.slice(home.indexOf("const stageFiles ="), home.indexOf("const startDictation"));
  assert.match(stage, /beginRead\(file\)/, "stageFiles must start the read for each newly staged file");
  assert.match(
    home,
    /const run = extractFile\(file, userId, \{ folderPath: CANVAS_FILING_FOLDER, keep: true \}\)/,
    "the front door must read through the shared chokepoint with keep, so the row and parse are the real ones",
  );
});

test("🔴 the read is started over the DEDUPED list, so one file is read once", () => {
  const stage = home.slice(home.indexOf("const stageFiles ="), home.indexOf("const startDictation"));
  const fresh = stage.indexOf("const fresh = picked.filter");
  const begin = stage.indexOf("beginRead(file)");
  assert.ok(fresh !== -1, "the dedupe must still happen");
  assert.ok(begin > fresh, "reads must start from the deduped list, never from the raw picked list");
});

test("🔴 a second stage of the same file does not start a second read", () => {
  assert.match(home, /if \(reads\.current\.has\(key\)\) return;/);
});

test("🔴 the card says what its own file is doing", () => {
  assert.match(home, /state=\{readState\[`\$\{file\.name\}:\$\{file\.size\}`\] \?\? "ready"\}/);
  assert.match(home, /setReadState\(\(current\) => \(\{ \.\.\.current, \[key\]: "reading" \}\)\)/);
});

// ── 2. the in-flight read travels with its file ─────────────────────────────

test("🔴🔴 the handoff carries the read WITH the file, not as a parallel list", () => {
  assert.match(handoff, /interface PendingAttachment \{\s*file: File;\s*read: Promise<ExtractedFile> \| null;/);
  assert.match(home, /read: reads\.current\.get\(`\$\{file\.name\}:\$\{file\.size\}`\) \?\? null/);
});

test("🔴 taking still clears — the single-use rule survives the shape change", () => {
  assert.match(handoff, /const held = pending;\s*pending = null;\s*return held;/);
});

// ── 3. the canvas claims it rather than reading again ───────────────────────

test("🔴🔴 the canvas passes the started reads through to the session", () => {
  const latch = canvas.slice(canvas.indexOf("const claimedFiles = useRef(false)"), canvas.indexOf("const claimedFiles = useRef(false)") + 700);
  assert.match(latch, /waiting\.map\(\(entry\) => entry\.file\)/);
  assert.match(latch, /waiting\.map\(\(entry\) => entry\.read\)/);
});

test("🔴🔴 a started read is awaited, never re-run", () => {
  assert.match(
    session,
    /const extracted = alreadyReading\s*\?\s*await alreadyReading\s*:\s*await extractFile\(/,
    "a file whose read is already running must be awaited, not extracted a second time",
  );
});

test("🔴 the reads line up with the files BY INDEX, so the pairing cannot slip", () => {
  assert.match(session, /for \(const \[index, file\] of Array\.from\(files\)\.entries\(\)\)/);
  assert.match(session, /const alreadyReading = started\?\.\[index\] \?\? null;/);
});

test("🔴 nothing started still works — the old path is the fallback, not an error", () => {
  // Signed out when the file was dropped, or any future door that stages without reading.
  assert.match(handoff, /read: Promise<ExtractedFile> \| null/);
  assert.match(session, /started\?\.\[index\] \?\? null/);
});
