import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canvasAddress, learnEntryFromSearch } from "./learn-entry";

// 🔴🔴🔴 THE CONVERSATION SAVED FINE; THE URL NEVER LEARNED WHERE IT WAS. Owner, 2026-09-02: *"the
// chats don't seem to save or make a unique conversation id."* Sending from the front door goes to
// `/learn?ask=<topic>` with no id, because `useCanvasSession(null)` mints one when the surface
// mounts — and nothing ever wrote it back. So the address bar said `?ask=` for the whole life of
// the conversation, and a reload did not reopen it: it asked again, in a brand new canvas.
//
// Measured on production the same day, before the fix:
//   "what is capacitance"   2 canvases, 58 seconds apart, two different answers
//   "How a diode works"     4 canvases, all with zero moments
//   AI news, one question   6 canvases between 00:17 and 00:28
//   2026-08-30: 0 of 8 canvases empty · 2026-09-02: 7 of 11 empty
const code = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

test("🔴🔴🔴 the address names the canvas and drops what STARTED it", () => {
  const at = canvasAddress("https://app.enternemesis.com/learn?ask=what%20is%20capacitance", "abc-123");
  assert.equal(at, "/learn?c=abc-123");
  // 🔴 THE STARTING PARAMETERS MUST GO, NOT JUST `c` ARRIVE. `?ask=` left beside `?c=` keeps the
  // reload re-asking — into the right canvas this time, which is a second copy of the question
  // rather than a second canvas, and no better.
  const busy = canvasAddress("https://x/learn?ask=diodes&cap=course&voice=1&folder=f1&new=1", "id-9");
  assert.equal(busy, "/learn?c=id-9");
  // 🔴 AND THE RELOAD MUST NOW LAND ON THE CANVAS. Checked through the page's own parser rather
  // than by reading the string, because that is what actually decides.
  const entry = learnEntryFromSearch(new URL(`https://x${busy}`).search);
  assert.equal(entry.c, "id-9");
  assert.equal(entry.ask, null);
});

test("🔴 a development switch is not a starting parameter, and survives", () => {
  // `?policy=` and `?teacher=` describe how the session RUNS, not how it began; an engineer who
  // set one expects it to hold across a reload.
  const at = canvasAddress("https://x/learn?ask=t&teacher=llm_teacher&policy=off", "id-1");
  assert.ok(at.includes("teacher=llm_teacher"), "the teaching-arm override was dropped on the first save");
  assert.ok(at.includes("policy=off"), "the policy override was dropped on the first save");
  assert.ok(!at.includes("ask="), "the topic survived beside the id and will be asked again on reload");
});

test("🔴 addressing an existing address is a no-op, not a duplicate", () => {
  assert.equal(canvasAddress("https://x/learn?c=same", "same"), "/learn?c=same");
  assert.equal(canvasAddress("https://x/learn?c=old", "new"), "/learn?c=new");
});

test("🔴🔴 the session addresses only AFTER a save that reports the canvas findable", () => {
  const session = code("../../components/workspace/learn/use-canvas-session.ts");
  // An address is a promise that something is there; naming a canvas that has not been written
  // turns a reload into an empty canvas standing where the work was.
  assert.match(session, /saveCanvas\(uid, saving\)\.then\(\(findable\) => \{/, "the address no longer waits for the save");
  assert.match(session, /if \(!findable \|\| addressed\.current/, "the address is written even when nothing was stored");
  assert.match(session, /window\.history\.replaceState\(null, "", canvasAddress\(window\.location\.href, saving\.id\)\)/, "the address is not written");
  // 🔴 `replaceState`, NOT A PUSH. A pushed entry makes Back return to `?ask=` and start over.
  assert.ok(!/history\.pushState[\s\S]{0,80}canvasAddress/.test(session), "the address was pushed, so Back re-asks");
  // 🔴🔴 AND THE URL LEARNING OUR OWN ID IS NOT A REQUEST TO RELOAD. Next surfaces `replaceState`
  // through `useSearchParams`, so the load effect re-runs with the id of the canvas already in
  // hand — reloading there replaces live state with the last SAVED state and drops the rest.
  assert.match(session, /if \(canvasId && canvasId === latest\.current\.id\) \{/, "the session reloads the canvas it is already holding");
  // 🔴 STARTING OVER GIVES UP THE ADDRESS, or a reload reopens the canvas just left behind.
  const reset = session.slice(session.indexOf("const reset = useCallback"));
  assert.match(reset.slice(0, 600), /addressed\.current = false;/, "a fresh canvas inherits the old one's address");
  assert.match(reset.slice(0, 600), /searchParams\.delete\("c"\)/, "the old id stays in the URL after starting over");
});

test("🔴 saveCanvas reports findability, and the local copy counts", () => {
  const store = code("./canvas-store.ts");
  assert.match(store, /export async function saveCanvas\([\s\S]{0,120}Promise<boolean>/, "the save no longer reports anything");
  assert.match(store, /function localWrite\(canvas: LearningCanvas\): boolean/, "the local write no longer reports anything");
  // `loadCanvas` falls back to the local copy on every path, so a cloud failure with a local write
  // is still findable — that is why `local` is returned rather than `false`.
  assert.match(store, /console\.warn\("\[learn\] canvas save failed", error\.message\);\s*return local;/, "a cloud failure now claims the canvas is unreachable");
  // 🔴 AND THE SIGNED-OUT PATH STILL DOES NOT BROADCAST, exactly as before this change.
  assert.match(store, /if \(!userId\) return local;/, "the signed-out path changed what it does, not just what it reports");
});

console.log("canvas-address.test.ts OK");
