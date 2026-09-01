import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴 THE CONFIRMATION MUST OUTRANK WHATEVER RAISED IT.
//
// Found 2026-09-01 by driving the calendar: deleting an event opened the
// confirmation BEHIND the editor that asked for it, and its Delete button could
// not be clicked at all. The event could not be deleted by any means. The same
// trap sat under every delete offered from inside a dialog — the study decks,
// the library, project settings — because it was one shared component.
//
// It took TWO things, and either alone leaves it broken:
//   1. a z-index above desktop-ui's dialog (overlay 120, content 130), and
//      above menus and selects (140) so a confirm raised with a dropdown open
//      still covers it;
//   2. `pointer-events: auto`, because Radix sets `pointer-events: none` on
//      <body> while a modal Dialog is open and this overlay is a plain div in
//      the React tree rather than one of Radix's portals. Without it the
//      overlay swallows every click no matter how high it sits.

const SHELL = readFileSync(new URL("../../app/styles/shell.css", import.meta.url), "utf8");
const DIALOG = readFileSync(new URL("./dialog.tsx", import.meta.url), "utf8");

/** The `.confirm-overlay` declaration block. */
const overlay = /\.confirm-overlay\s*\{([^}]*)\}/.exec(SHELL)?.[1] ?? "";

test("the confirm overlay exists and is still one rule", () => {
  assert.notEqual(overlay, "", ".confirm-overlay was renamed or removed");
});

test("it sits above every dialog it can be raised from", () => {
  const z = Number(/z-index:\s*(\d+)/.exec(overlay)?.[1]);
  assert.ok(Number.isFinite(z), "confirm overlay has no z-index");
  // Whatever the dialog uses today, read from the component rather than pinned,
  // so raising the dialog cannot silently sink the confirmation under it again.
  const dialogZ = [...DIALOG.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]));
  assert.ok(dialogZ.length > 0, "could not read dialog.tsx's z-indexes");
  assert.ok(z > Math.max(...dialogZ), `confirm is z-${z}, dialog reaches z-${Math.max(...dialogZ)}`);
  assert.ok(z > 140, `confirm is z-${z}, which is under menus and selects at z-140`);
});

test("it takes pointer events back from Radix's body lock", () => {
  assert.match(overlay, /pointer-events:\s*auto/, "the overlay will swallow every click while a dialog is open");
});
