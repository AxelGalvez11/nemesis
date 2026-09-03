import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴🔴 THE CANVAS COMPOSER STAGES MATERIAL, THE WAY THE FRONT DOOR ALREADY DOES.
//
// Owner, 2026-08-31: *"the composer should also have the drop into composer ability like in the
// landing page composer, where the attachments attach to composer before sending, that way user
// can see that the chat is processing it too and can remove attachment if necessary."*
//
// Before this, dropping a file mid-session ingested it on the spot and drew a chip that could not
// be removed and said nothing about what was happening to it. The chip's own comment argued there
// could BE no ✕, because attaching had already ingested and an ✕ "would promise an un-ingest
// nothing can perform". That was right about the old design and the design is what changed:
// material now waits in the composer and SEND is what commits it, so removing a card means the
// obvious thing.
//
// 🔴 THIS IS NOT A RETURN OF THE STATE #888 KILLED. That ruling was "attaching a document mid chat
// should not immediately make the chat go into processing mode" — the canvas must not be taken
// over, the character must not walk to the middle, the page must not blank. None of that happens
// here. The only thing that waits is the one control whose press would send an unread document.

const CANVAS = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
const COMPOSER = readFileSync(new URL("./canvas-composer.tsx", import.meta.url), "utf8");

function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const canvas = code(CANVAS);
const composer = code(COMPOSER);

// ── attaching stages, it does not ingest ────────────────────────────────────

test("🔴🔴 picking a file mid-session stages it instead of ingesting it", () => {
  const attach = canvas.slice(canvas.indexOf("const attachWithChips = useCallback"), canvas.indexOf("const commitStaged"));
  assert.match(attach, /setStaged\(\(current\) => \[\.\.\.current, \.\.\.picked\]\)/);
  assert.match(attach, /readStaged\(entry\.id, entry\.file\)/, "staging must start the read, as the front door does");
  assert.ok(
    !attach.includes("session.attachFiles"),
    "attaching mid-session must not put the file in the canvas — send does that, or the ✕ is a lie",
  );
});

test("🔴🔴 SEND is what commits staged material to the canvas", () => {
  const commit = canvas.slice(canvas.indexOf("const commitStaged = useCallback"), canvas.indexOf("const stagedCards"));
  assert.match(commit, /session\.attachFiles\(entries\.map\(\(entry\) => entry\.file\), undefined, reads\)/);
  // 🔴 REPOINTED 2026-09-03: the commit clears what it SENT and keeps a card that failed to read,
  // so the learner can retry or remove it and the send no longer waits on it (owner: "there
  // should be no problem with any of them", of fifty). The shape that matters is unchanged: the
  // cards leave the composer in the same call that hands the files to the canvas.
  assert.match(commit, /const entries = staged\.filter\(\(entry\) => entry\.state !== "failed"\)/, "a failed card rides the send again");
  assert.match(commit, /setStaged\(\(current\) => current\.filter\(\(entry\) => entry\.state === "failed"\)\)/, "the send no longer clears the committed cards");
  // Every submitting route already calls `acknowledgeAttachments`, which is why the commit lives
  // there rather than in four handlers that would each have to remember.
  assert.match(canvas, /const acknowledgeAttachments = useCallback\(\(\) => commitStaged\(\), \[commitStaged\]\)/);
});

test("🔴 the reads ride along, so nothing is read twice", () => {
  const commit = canvas.slice(canvas.indexOf("const commitStaged = useCallback"), canvas.indexOf("const stagedCards"));
  assert.match(commit, /stagedReads\.current\.get\(entry\.id\) \?\? null/);
});

test("🔴 the reader's own send still commits directly and WAITS", () => {
  // There the question and the picture are one gesture: there is no staging step to pass through,
  // and the turn must not start before the picture is in the canvas.
  const reader = canvas.slice(canvas.indexOf("const askFromReader"), canvas.indexOf("const askFromReader") + 500);
  assert.match(reader, /await session\.attachFiles\(files\)/);
});

test("🔴🔴 EVERY way material arrives mid-session stages it — including the drop", () => {
  // 🔴 THIS IS THE ONE THAT SHIPPED BROKEN. #969 rerouted the composer's `+` and left the canvas
  // surface calling `session.attachFiles` directly, so the commonest gesture in the product —
  // dragging a PDF onto the page — skipped the composer: no card, no reading state, nothing to
  // remove. Measured on production the same evening. Two doors to one action is how a fix lands on
  // one of them, so both are pinned here by name.
  assert.match(canvas, /onDropFiles=\{attachWithChips\}/, "dropping on the canvas bypasses the composer again");
  assert.match(canvas, /attach=\{async \(files\) => \{ attachWithChips\(files\); \}\}/, "a finished recording bypasses the composer");
  // The only direct ingests left are the two that must be: SEND committing what is staged, and the
  // reader's own send, where the question and the picture are a single gesture.
  const direct = (canvas.match(/session\.attachFiles\(/g) ?? []).length;
  assert.equal(direct, 3, "a new direct attach appeared — route it through attachWithChips instead");
});

// ── the card can be seen and removed ────────────────────────────────────────

test("🔴🔴 each card carries its own state and a way out", () => {
  assert.match(composer, /state=\{file\.state \?\? "ready"\}/);
  assert.match(composer, /onRemove: \(\) => onRemoveAttachment\(file\.id\)/);
  assert.match(composer, /onRetry: \(\) => onRetryAttachment\(file\.id\)/);
});

test("🔴 removing and retrying both forget the previous read", () => {
  // Otherwise a retry silently does nothing (the read is already registered), and a re-added file
  // inherits a stale failure that holds the send with nothing running behind it.
  const wiring = canvas.slice(canvas.indexOf("onRemoveAttachment={(id) => {"), canvas.indexOf("recentAttachments={stagedCards}"));
  assert.equal((wiring.match(/stagedReads\.current\.delete\(id\)/g) ?? []).length, 2);
  assert.match(wiring, /readStaged\(id, entry\.file\)/);
});

// ── the same quality gate as the front door ─────────────────────────────────

test("🔴🔴 send refuses while a staged file is unread, here too", () => {
  // 🔴 REPOINTED 2026-09-03: a FAILED file no longer holds the send. It used to ("reading OR
  // failed"), so one unreadable file in a batch of fifty made Send dead for good. Unread material
  // still waits, which is the half of this rule that protects the packet.
  assert.match(composer, /const materialNotReady = recentAttachments\.some\(\(file\) => file\.state === "reading"\);/);
  assert.ok(!/file\.state === "reading" \|\| file\.state === "failed"/.test(composer), "a failed file blocks the send again");
  assert.match(composer, /disabled=\{!showSend \|\| materialNotReady\}/);
});

test("🔴 the keyboard obeys that gate too", () => {
  const submit = composer.slice(composer.indexOf("const submit = () => {"), composer.indexOf("const submit = () => {") + 700);
  assert.match(submit, /if \(materialNotReady\) return;/);
});

test("🔴 staged material still counts as material for an empty send", () => {
  // "Learn this with me" is a real submission with no words typed, and since material now waits in
  // the composer, counting only `canvas.sources` would refuse exactly that.
  assert.match(canvas, /attachedCount=\{canvas\.sources\.length \+ staged\.length\}/);
});
