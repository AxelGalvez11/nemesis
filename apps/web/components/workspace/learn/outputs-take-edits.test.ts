import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The panel's SECOND job — owner, 2026-08-28: *"the sidebar is also for general purpose, things
// like building PowerPoints, documents, so the user should be able to sort of ask for edits on
// it."* Confirmed as the two-lane model: sources are pointed at and asked about, never changed;
// Nemesis-built outputs are revised BY NEMESIS on request, with the old state kept.

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const PREVIEW = read("./output-preview.tsx");
const CANVAS = read("./learning-canvas.tsx");
const CONTROLS = read("./canvas-controls.tsx");
const CHAT = read("./canvas-chat.ts");
const READER = readFileSync(new URL("../reader/document-reader.tsx", import.meta.url), "utf8");

test("🔴🔴 the two lanes stay two lanes: outputs revise, sources never do", () => {
  assert.match(PREVIEW, /onRevise\?.*Promise<string \| null>/s, "the output panel lost its revise door");
  // The SOURCE reader must have no revise door at all — not a hidden one, none. Its send goes to
  // the conversation and nowhere else.
  assert.ok(!/onRevise/.test(READER), "the source reader has grown a revise door — sources are never changed");
});

test("🔴🔴 a revision keeps the old state, and both mounts render the FRESH row", () => {
  assert.match(CANVAS, /applyRevision\(current, result\)/, "a revision no longer keeps the outgoing state");
  // Both open-output mounts derive from canvas.outputs at render time. The state copy captured at
  // open predates any revision, and a panel rendering it shows the old document under a "revised"
  // answer — that is the staleness this line exists to prevent.
  // 🔴 ONE MOUNT SINCE 2026-09-03. The canvas-level `OutputPreview` (opened from the artifact card
  // and the thread, bypassing the dock) is gone: every made file opens through `dock.openOutput`
  // and is drawn by the sources control's mount, so there is exactly one place to render the row.
  assert.ok(!/<OutputPreview/.test(CANVAS), "the canvas grew a second output mount beside the dock's");
  assert.match(CANVAS, /onOpenOutput=\{dock\.openOutput\}/, "a thread's artifact card no longer opens through the dock");
  assert.match(CONTROLS, /\(canvas\.outputs \?\? \[\]\)\.find\(\(row\) => row\.id === openedOutput\.id\) \?\? openedOutput/, "the panel mount renders the stale open-time copy");
});

test("🔴 undo exists exactly while there is something to undo", () => {
  assert.match(PREVIEW, /\(output\.revisions\?\.length \?\? 0\) > 0 &&/, "the undo button ignores whether a revision exists");
  assert.match(CANVAS, /session\.updateOutput\(output\.id, undoRevision\)/, "undo no longer pops the kept state");
});

test("🔴 the sent note resolves itself on success, and stays open with the error on failure", () => {
  // It was an instruction and it was executed; the changed document is the reply. A failed apply
  // keeps the note open and says what happened — the document is exactly what it was.
  const send = PREVIEW.slice(PREVIEW.indexOf("const sendToNemesis"), PREVIEW.indexOf("const resolveComment"));
  assert.match(send, /const failure = await onRevise\(output, askFromDraft\(draft\)\);/);
  assert.match(send, /if \(failure\) \{\s*setReviseError\(failure\);\s*return;\s*\}/);
  assert.match(send, /setCommentResolved\(commentEnv\.uid, commentRef, made\.id, true/, "an executed instruction no longer resolves its note");
});

test("🔴 comments on outputs key to the LEDGER id, in the panel and in the packet alike", () => {
  // The canvas-local output id and the Library's asset row would otherwise key the same
  // document's comments two different ways, and a note left in the canvas would be invisible
  // from the Library.
  assert.match(PREVIEW, /id: output\.assetId \?\? output\.id/, "the panel keys comments to the canvas-local id");
  assert.match(CHAT, /id: output\.assetId \?\? output\.id/, "the packet keys output comments differently from the panel");
});

test("🔴 the wait is said, and the old document stays visible under it", () => {
  assert.match(PREVIEW, /data-testid="output-revising"/, "the revising state is silent");
  assert.match(PREVIEW, /commenting && !revising/, "the capture surface stays armed during a revision");
});
