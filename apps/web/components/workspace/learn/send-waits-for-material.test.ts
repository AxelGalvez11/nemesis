import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴🔴 NOTHING IS SENT UNTIL EVERY STAGED DOCUMENT HAS BEEN READ.
//
// Owner, 2026-08-31: *"block the send button until it process everything all the documents… that
// just sounds like, to assure quality"*, naming ChatGPT and NotebookLM, which both do this. I had
// argued the other way — that an early send was already safe because the turn waits internally
// (#953) — and his counter is the one that decides it:
//
//     *"what if it wasn't able to process one, you know?"*
//
// An unblocked send lets a FAILED file ride along in silence. The turn's internal wait cannot save
// that case, because there is nothing to wait for: the read is over and it lost. The learner gets
// an answer built on four of their five lectures, with nothing on screen saying so. A dark button
// that explains itself is a better failure than a confident partial answer.

const HOME = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");
const CARD = readFileSync(new URL("./attachment-card.tsx", import.meta.url), "utf8");

function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const home = code(HOME);
const card = code(CARD);

// ── the gate ────────────────────────────────────────────────────────────────

test("🔴🔴 a file still being read blocks the send", () => {
  assert.match(home, /const state = readState\[`\$\{file\.name\}:\$\{file\.size\}`\];\s*return state === "reading" \|\| state === "failed";/);
  assert.match(home, /const blocked = notReady\.length > 0;/);
  assert.match(home, /disabled=\{blocked \|\|/, "the send control must refuse while anything is unread");
});

test("🔴🔴 a file that FAILED blocks it too — that is the case the owner named", () => {
  // The whole argument. Were `failed` treated as done, the silent partial send would be back with
  // extra steps: the card would say "Couldn't read" and the button would happily start anyway.
  const notReady = home.slice(home.indexOf("const notReady ="), home.indexOf("const reading ="));
  assert.match(notReady, /state === "failed"/);
});

test("🔴🔴 the keyboard obeys the same gate as the button", () => {
  // Enter calls `start()` directly, so a check that lived only on `disabled` would leave the exact
  // route the original report came in through wide open.
  // The signature grew an options object 2026-08-31 (the front door's voice conversation rides
  // `{ spoken: true }` through the same gate — never around it).
  const open = home.indexOf("const start = (options?: { spoken?: boolean }) => {");
  assert.ok(open >= 0, "start()'s signature moved — repoint this pin at it");
  const start = home.slice(open, open + 450);
  assert.match(start, /if \(blocked\) return;/);
});

test("🔴 a dark button says WHY it is dark", () => {
  // "Start" on a disabled control is a mystery; the label is what a screen reader reads and what
  // the tooltip shows, so the reason travels with the refusal.
  assert.match(home, /Reading your document…/);
  assert.match(home, /Reading \$\{notReady\.length\} documents…/);
  assert.match(home, /One document couldn't be read\. Try again or remove it\./);
  assert.match(home, /label=\{sendLabel\}/);
});

// ── the two exits, because a block with no exit is a trap ───────────────────

test("🔴🔴 a failed card offers Try again, and it actually re-runs the read", () => {
  assert.match(card, /onRetry && state === "failed"/, "the retry shows only on a failure");
  assert.match(card, /Try again/);
  // `beginRead` declines a file it has already started, so the stale attempt must be forgotten
  // first. Without the delete, Try again is a button that does nothing — the worst possible
  // control to sit beside an error message.
  assert.match(home, /onRetry=\{\(\) => \{\s*reads\.current\.delete\(`\$\{file\.name\}:\$\{file\.size\}`\);\s*beginRead\(file\);/);
});

test("🔴 removing a card forgets its read, so the same file can be dropped again", () => {
  // Otherwise: drop A, it fails, remove it, drop A again — `reads` still holds the old entry, so
  // `beginRead` returns early and the card sits at "Couldn't read" holding the send with nothing
  // running behind it.
  const remove = home.slice(home.indexOf("onRemove={() => {"), home.indexOf("onRemove={() => {") + 420);
  assert.match(remove, /reads\.current\.delete\(key\)/);
  assert.match(remove, /setReadState\(\(current\) => \{/);
});

// ── what must NOT change ────────────────────────────────────────────────────

test("🔴 material alone still sends, once it is read", () => {
  // The gate is about readiness, never about whether words were typed. A read file with no
  // question is still "learn this with me".
  assert.match(home, /!text\.trim\(\) && staged\.length === 0/);
});

test("🔴 the canvas composer is NOT gated this way, and that is deliberate", () => {
  // Owner, 2026-08-27 (#888): "attaching a document mid chat should not immediately make the chat
  // go into processing mode". There, attaching is an aside to a conversation already running and
  // the turn waits internally; here, the material IS what is being started.
  const canvas = code(readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8"));
  assert.ok(!canvas.includes("const blocked = notReady"), "the session composer must not grow this gate");
});
