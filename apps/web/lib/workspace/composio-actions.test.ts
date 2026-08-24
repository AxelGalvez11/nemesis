import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { actionSegments, heldForApproval, pendingActionResult, riskOf, summarise } from "./composio-actions";

// ── reading is free, writing asks first (workstream E) ──────────────────────────────────────
//
// 🔴🔴🔴 THE FAIL-CLOSED RULE IS THE FEATURE. Composio's catalogue is hundreds of actions long
// and grows without us. A rule shaped "block the dangerous ones" is a blocklist that is wrong the
// day a provider ships a new send action, and being wrong in that direction means Nemesis mailed
// a stranger on the learner's behalf. Being wrong the safe way costs one click.
//
// So the property under test is not "SEND is blocked". It is: **anything not explicitly known to
// be a read is a write.**

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SOURCE = strip(readFileSync(new URL("./composio-actions.ts", import.meta.url), "utf8"));

test("🔴🔴🔴 an action nobody has ever seen is a WRITE", () => {
  // The whole safety argument, stated as a test. Calibration: flip the default in `riskOf` and
  // this reddens along with four others below.
  assert.equal(riskOf("SOMEAPP_TELEPORT_THE_LEARNER"), "write");
  assert.equal(riskOf("GMAIL_SEND_DRAFT_V2"), "write");
  assert.equal(riskOf(""), "write", "an empty action slug was treated as safe");
  assert.equal(riskOf("!!!"), "write", "an unparseable slug was treated as safe");
  assert.equal(riskOf("GARBLED"), "write");
});

test("🔴🔴 the obvious dangerous ones are writes, by the general rule and not by name", () => {
  for (const action of [
    "GMAIL_SEND_EMAIL",
    "GMAIL_DELETE_MESSAGE",
    "SLACK_POST_MESSAGE",
    "GOOGLEDRIVE_DELETE_FILE",
    "GOOGLECALENDAR_CREATE_EVENT",
    "NOTION_UPDATE_PAGE",
  ]) {
    assert.equal(riskOf(action), "write", `${action} would have run without asking`);
  }
});

test("real reads run silently", () => {
  for (const action of [
    "GMAIL_FETCH_EMAILS",
    "GOOGLEDRIVE_FIND_FILE",
    "GOOGLEDRIVE_DOWNLOAD_FILE",
    "GOOGLECALENDAR_LIST_EVENTS",
    "NOTION_SEARCH_PAGES",
    "SLACK_GET_CHANNEL_HISTORY",
  ]) {
    assert.equal(riskOf(action), "read", `${action} would nag the learner for a harmless read`);
  }
});

test("🔴🔴 a read verb must be a WHOLE segment, not a substring", () => {
  // The bug this prevents: "SEND" contains "END", "RESEARCH" contains "SEARCH", "FORGET" contains
  // "GET". Substring matching would classify a send as a read on the strength of three letters.
  assert.equal(riskOf("GMAIL_SEND_EMAIL"), "write", "SEND matched a read verb by substring");
  assert.equal(riskOf("APP_FORGETFUL_WIPE"), "write", "FORGET matched GET by substring");
  assert.equal(riskOf("APP_RESEARCHIFY_ALL"), "write", "RESEARCHIFY matched SEARCH by substring");
  // And the genuine whole-segment cases still work.
  assert.equal(riskOf("APP_GET_THING"), "read");
  assert.equal(riskOf("APP_SEARCH_THING"), "read");
});

test("🔴🔴 verbs that only LOOK like reads are deliberately absent", () => {
  // EXPORT can be implemented as write-then-share; SYNC is bidirectional; COPY creates; MOVE
  // removes from somewhere. Each is a write here on purpose, and the module says why.
  for (const action of ["APP_EXPORT_ALL", "APP_SYNC_FOLDER", "APP_COPY_FILE", "APP_MOVE_FILE"]) {
    assert.equal(riskOf(action), "write", `${action} slipped into the read list`);
  }
});

test("the gate flips only when the learner has actually clicked", () => {
  assert.equal(heldForApproval("GMAIL_SEND_EMAIL", false), true);
  assert.equal(heldForApproval("GMAIL_SEND_EMAIL", true), false, "an approved action is still blocked");
  assert.equal(heldForApproval("GMAIL_FETCH_EMAILS", false), false, "a read was held for approval");
});

test("🔴 a held action tells the model plainly that nothing happened", () => {
  // A model that believes the email went out will say so, and the learner will believe it.
  const held = pendingActionResult({ action: "GMAIL_SEND_EMAIL", app: "Gmail", summary: "send email: dean@uni.edu" });
  assert.equal(held.confirm_required, true);
  assert.match(held.instruction, /Nothing has happened yet/);
  assert.match(held.instruction, /Do not say it is done/);
  assert.equal(held.pending_action.action, "GMAIL_SEND_EMAIL", "approving would re-run a reconstructed call");
});

// ── what the learner reads before clicking ─────────────────────────────────

test("🔴🔴 the summary names recipients, because scale is invisible otherwise", () => {
  // "Send an email" and "send an email to 340 people" deserve very different reactions.
  assert.equal(summarise("GMAIL_SEND_EMAIL", { to: "dean@uni.edu" }), "send email: dean@uni.edu");
  const many = summarise("GMAIL_SEND_EMAIL", { to: ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"] });
  assert.match(many, /a@x\.com, b@x\.com, c@x\.com and 2 more/);
});

test("the summary falls back to a subject, then to the verb alone", () => {
  assert.equal(summarise("NOTION_CREATE_PAGE", { title: "Week 4 notes" }), "create page: Week 4 notes");
  assert.equal(summarise("APP_DO_THING", {}), "do thing");
});

test("🔴🔴 the summary is built from ARGUMENTS, never from model prose", () => {
  // A card describing something other than what will run converts the click from consent into a
  // rubber stamp, so the summary must be derivable from the call itself.
  //
  // 🔴 SCOPED TO THE SUMMARY FUNCTIONS, NOT THE WHOLE FILE. The first version of this guard
  // searched the module for /\bsay\b/ and tripped on `pendingActionResult`'s own instruction
  // ("Do not say it is done") — a sentence that is not only allowed but load-bearing. A guard
  // that reddens on correct code is a guard someone deletes.
  const summaryRegion = SOURCE.slice(SOURCE.indexOf("export function summarise"));
  assert.ok(summaryRegion.length > 0, "summarise moved — this guard is pointed at nothing");
  assert.ok(
    !/message|reply|assistant|content|prose|\.text\b/i.test(summaryRegion),
    "the summary started reading something the model wrote",
  );
  // Its only inputs are the action slug and the argument object.
  assert.match(SOURCE, /export function summarise\(action: string, args: Record<string, unknown>\): string/);
});

test("actionSegments splits on anything non-alphanumeric", () => {
  assert.deepEqual(actionSegments("gmail_send-email"), ["GMAIL", "SEND", "EMAIL"]);
  assert.deepEqual(actionSegments(""), []);
});
