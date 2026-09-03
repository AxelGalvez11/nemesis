import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { syncGoogleCalendar } from "@/lib/workspace/google-calendar-sync";

// Guards the door between the calendar screen and Google (owner 2026-09-02: "be able to use Google
// Calendar ... and resolve discrepancies with scheduling").
//
// The engine is tested in lib/workspace/google-calendar*.test.ts. This file guards the things that
// can only go wrong at the seam: a control that exists but reaches nothing, a sync that writes into
// the wrong store, and a resolution flow that decides on the student's behalf.

const header = readFileSync(new URL("./calendar-header.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("./calendar-workspace.tsx", import.meta.url), "utf8");
const banner = readFileSync(new URL("./sync-disagreements.tsx", import.meta.url), "utf8");

/**
 * The file with its comments taken out.
 *
 * 🔴 A "MUST NOT APPEAR" TEST THAT READS COMMENTS FAILS ON ITS OWN EXPLANATION. This one went red
 * the first time it ran, matching the very note in `sync-disagreements.tsx` that says why the
 * control it forbids must not exist. The rule is about the code, so the assertion reads the code.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the sync control is absent when there is nothing to sync with, not disabled", () => {
  // 🔴 A DEAD CONTROL IS THIS CODEBASE'S MOST-REPEATED DEFECT, and `capabilities-are-live.test.ts`
  // exists because of it. Somebody who has never connected Google has no question a greyed-out
  // Sync button could answer; showing one only invites a click that does nothing.
  assert.match(header, /onSync\?: \(\) => void/, "the handler is optional, which is the gate");
  assert.match(header, /\{onSync \? \(/, "and the button renders only when it is there");
  assert.match(workspace, /onSync=\{canSync \? handleSync : undefined\}/);
});

test("whether a calendar is connected is ASKED, never sniffed out of a slug", () => {
  // 🔴 #933'S LESSON, AND IT COST EVERY MICROSOFT STUDENT THEIR TIMETABLE. Outlook is mail AND
  // calendar in one toolkit and its slug contains no "calendar", so a string test answers "no" for
  // them. `hasCalendar` asks the app catalogue, which actually knows.
  assert.match(workspace, /hasCalendar\(status\.connected\)/);
  assert.doesNotMatch(workspace, /includes\(["']calendar["']\)/, "no slug substring test");
});

test("a sync refuses to run in preview or signed out", async () => {
  // 🔴 NOT LEFT TO THE HIDDEN BUTTON. In preview, `saveCalendarEvent` writes to the UNSCOPED legacy
  // localStorage key that the first account signing in on this browser claims and uploads — so a
  // preview sync would hand one student's Google calendar to another account. The syllabus importer
  // guards its own path for exactly this reason; a guard two components away is not enough.
  // 🔴 THE MESSAGE IS ASSERTED, NOT JUST `ok: false`. Without the guard this call still fails —
  // it reaches the network and cannot get there from a test — so a bare `ok: false` passes whether
  // the refusal exists or not. Only this sentence proves the guard itself ran, and it went green
  // for the wrong reason until that was noticed.
  const previewed = await syncGoogleCalendar({ preview: true, userId: "u1" }, { existing: [] });
  assert.equal(previewed.ok, false);
  assert.equal(previewed.error, "Sign in to sync your calendar.");
  assert.equal(previewed.added, 0);

  const signedOut = await syncGoogleCalendar({ preview: false, userId: null }, { existing: [] });
  assert.equal(signedOut.ok, false);
  assert.equal(signedOut.error, "Sign in to sync your calendar.");
});

test("synced rows replace by id rather than piling up", () => {
  // 🔴 AN UPDATE CARRIES THE ID OF THE ROW IT REPLACES. Appending would leave the old copy sitting
  // beside the new one on the same day, so a student who moved a lecture in Google would see it
  // twice — which looks exactly like the duplicate-import bug the external id exists to prevent.
  assert.match(workspace, /prev\.filter\(\(row\) => !outcome\.events\.some\(\(saved\) => saved\.id === row\.id\)\)/);
});

test("there is no button that settles every difference at once", () => {
  // 🔴 EACH ONE IS A REAL DECISION ABOUT WHEN A REAL THING IS HAPPENING. A single control applying
  // a heuristic to all of them is how somebody sits an exam on the wrong day. The sync already
  // refuses to overwrite a locally-edited event by itself; this is where that refusal is handed to
  // the person who can settle it.
  const code = codeOf(banner);
  assert.doesNotMatch(code, /resolve all/i);
  assert.doesNotMatch(code, /keep all/i);
  assert.doesNotMatch(code, /apply to all/i);
  // Both options are offered on every row, and neither is pre-selected.
  assert.match(banner, /Keep mine/);
  assert.match(banner, /Use Google/);
});

test("the banner shows what each side says, not just that they differ", () => {
  // A student cannot choose between two versions they cannot see.
  assert.match(banner, /here \{said\(field\.nemesis\)\}, Google\{" "\}/);
  assert.match(banner, /const said = \(value: string\) =>/, "an empty side reads as 'nothing', not a gap");
});

test("keeping Google's version fetches Google's version", () => {
  // 🔴 `disagreements` CARRIES THE COMPARED FIELDS, NOT A SAVEABLE ROW. Rebuilding an event from
  // them would silently drop everything not being compared — the guest list, the meeting link, the
  // repeat rule — so the calendar is re-read before anything is written.
  assert.match(workspace, /if \(keep === "provider"\) \{\s*\n\s*const pulled = await pullGoogleEvents/);
});

test("no product string in this door uses an em dash", () => {
  // Owner 2026-08-25, and the rule has been broken by prompts carrying their own.
  for (const [name, source] of [["header", codeOf(header)], ["banner", codeOf(banner)]] as const) {
    for (const quoted of source.matchAll(/"([^"\n]{4,})"/g)) {
      assert.ok(!quoted[1]!.includes("—"), `${name}: ${quoted[1]}`);
    }
  }
});

test("settling a difference actually confirms the write to Google", () => {
  // 🔴🔴 WITHOUT THIS, "Keep mine" DOES NOTHING, SILENTLY. Keeping the Nemesis version writes to
  // Google; `riskOf` classes every Google write as needing approval and `runAction` refuses an
  // unconfirmed one before the network is touched, so the call came back "needs your confirmation"
  // and the row just sat there — a control that looks live and is not, which is the exact defect
  // the gating test above exists to prevent.
  //
  // The click IS the approval: a person has read both versions side by side and pressed a button
  // that names the change. What must NOT happen is `pushEventToGoogle` hardcoding it, which would
  // drop the gate for every caller including the model, so the flag travels from the click.
  assert.match(workspace, /resolveDisagreement\(mine, keep, \{ preview, userId \}, \{ confirmed: true, providerCopy \}\)/);
  const sync = readFileSync(new URL("../../../lib/workspace/google-calendar-sync.ts", import.meta.url), "utf8");
  assert.match(sync, /confirmed: options\.confirmed === true/, "the executor never assumes approval");
  assert.doesNotMatch(codeOf(sync), /confirmed: true/, "and never hardcodes it");
});
