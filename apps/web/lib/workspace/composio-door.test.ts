import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the door between the browser and a learner's real accounts (workstream E) ────────────────
//
// 🔴🔴🔴 EVERYTHING HERE IS A CLAIM ABOUT WHAT CANNOT HAPPEN. Composio brokers access to a
// student's actual mailbox, drive and calendar, so the failure modes are not "a feature is
// broken" — they are "Nemesis mailed someone", "one learner reached another's files", or "an
// account-wide key was shipped in a JavaScript bundle". Each test below pins one of those shut.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE = strip(readFileSync(new URL("../../app/api/composio/route.ts", import.meta.url), "utf8"));
const CLIENT = strip(readFileSync(new URL("./composio-client.ts", import.meta.url), "utf8"));
const SETTINGS = strip(readFileSync(new URL("../../components/settings/connections-settings.tsx", import.meta.url), "utf8"));

test("🔴🔴🔴 the API key is read on the server and never anywhere else", () => {
  // One account-wide key can act for EVERY connected user. A key in the bundle is a key any
  // learner can read out of it and use against any other learner's mailbox.
  assert.match(ROUTE, /process\.env\.COMPOSIO_API_KEY/, "the route stopped reading the key");
  assert.ok(!/COMPOSIO_API_KEY/.test(CLIENT), "the browser bundle now references the Composio key");
  assert.ok(!/COMPOSIO_API_KEY/.test(SETTINGS), "the settings screen now references the Composio key");
  // And nothing client-side may talk to Composio directly.
  assert.ok(!/backend\.composio\.dev/.test(CLIENT + SETTINGS), "the browser calls Composio without going through the route");
  assert.match(CLIENT, /fetch\("\/api\/composio"/, "the client stopped going through the server door");
});

test("🔴🔴🔴 identity comes from the token, never from the request body", () => {
  // A `userId` field in the payload would be an invitation to act as somebody else.
  assert.match(ROUTE, /const user = await verifyBearer\(request\)/, "the route stopped verifying who is asking");
  const handlers = ROUTE.slice(ROUTE.indexOf("const op ="));
  assert.ok(!/body\.userId|body\.user_id|body\.uid/.test(handlers), "the route reads a caller-supplied user id");
  // Every Composio call is scoped to the verified id.
  assert.match(ROUTE, /statusFor\(user\.id\)/);
  assert.match(ROUTE, /execute\(user\.id, body\)/);
});

test("🔴🔴🔴 a write is refused on the SERVER, not only in the browser", () => {
  // A gate that only exists in the browser is a gate a crafted request walks around, and the
  // thing on the other side of it sends email.
  //
  // 🔴 THE CONDITION IS PINNED WHOLE, NOT JUST THE CALL, AND CALIBRATION IS WHY. The first
  // version of this guard matched /heldForApproval\(action, confirmed\)/ anywhere in the function
  // — which still passed when the gate was disabled as `if (false && heldForApproval(…))`. A
  // guard that survives its own subject being switched off is not a guard. Anchoring the entire
  // `if (…) {` means anything inserted into the condition reddens this.
  const execute = ROUTE.slice(ROUTE.indexOf("async function execute"));
  assert.ok(
    execute.includes("if (heldForApproval(action, confirmed)) {"),
    "the server's write gate was changed or disabled",
  );
  assert.match(execute, /return Response\.json\(pendingActionResult\(/, "a held write no longer returns the confirmation");
  // The hold must come BEFORE anything is sent upstream.
  const holdAt = execute.indexOf("heldForApproval");
  const sendAt = execute.indexOf("composio(");
  assert.ok(holdAt > 0 && sendAt > holdAt, "the action is sent upstream before the gate runs");
});

test("🔴🔴 confirmed is a boolean identity check, so a truthy string cannot approve a send", () => {
  // `confirmed: "no"` is truthy. Both sides compare against `true` explicitly.
  assert.match(ROUTE, /body\.confirmed === true/, "the server loosened its approval check");
  assert.match(CLIENT, /input\.confirmed === true/, "the client loosened its approval check");
});

test("🔴🔴 the server wins when the two gates disagree", () => {
  // If they ever diverge the learner gets one extra click, which is the only direction this is
  // allowed to be wrong in.
  assert.match(CLIENT, /body\.confirm_required === true/, "the client ignores a server-side hold");
});

test("🔴 a write is held before any request leaves the machine", () => {
  const run = CLIENT.slice(CLIENT.indexOf("export async function runAction"));
  const holdAt = run.indexOf("heldForApproval");
  const callAt = run.indexOf("await call(");
  assert.ok(holdAt > 0 && callAt > holdAt, "an unconfirmed write reaches the network before the learner sees a card");
});

test("🔴🔴 the offered apps are a closed list", () => {
  // Composio brokers hundreds of apps. Offering all of them turns a study tool into an
  // integrations directory, and every extra app is another consent screen clicked unread.
  assert.match(ROUTE, /if \(!APPS\.some\(\(entry\) => entry\.key === app\)\)/, "any app slug can now be connected");
  for (const app of ["googledrive", "gmail", "googlecalendar", "googledocs"]) {
    assert.ok(ROUTE.includes(`"${app}"`), `${app} is no longer offered`);
  }
});

test("🔴 unconfigured answers 200 with a state, not an error", () => {
  // "Not set up yet" is something the Settings screen renders, not a failure it must infer from a
  // status code — and the product must behave exactly as before until the owner sets the key.
  const guard = ROUTE.slice(ROUTE.indexOf("export async function POST"), ROUTE.indexOf("const user ="));
  assert.match(guard, /configured: false/, "an unconfigured server no longer reports its state plainly");
  assert.ok(!/status: 5\d\d/.test(guard), "an unconfigured server returns an error status");
  assert.match(SETTINGS, /not set up on this server yet/, "the settings screen stopped explaining the unconfigured state");
});

test("🔴 upstream error bodies are never echoed to the learner", () => {
  // Composio's errors can echo request contents; a failed send would then put the learner's own
  // draft into an error string on screen.
  assert.match(ROUTE, /That app is not responding right now/, "the generic upstream failure message is gone");
  assert.ok(!/await res\.text\(\)/.test(ROUTE), "the route started forwarding an upstream body verbatim");
});

test("🔴 the consent screen belongs to the provider, and opens away from the learner's work", () => {
  assert.match(SETTINGS, /window\.open\(url, "_blank", "noopener,noreferrer"\)/, "the OAuth page lost noopener or its own tab");
  // Nemesis must never be in the business of taking a password itself.
  assert.ok(!/type="password"|password/i.test(SETTINGS), "a password field appeared on the connections screen");
});

test("🔴 the screen states the safety line in the learner's own words", () => {
  assert.match(SETTINGS, /read freely/i);
  assert.match(SETTINGS, /wait for you to say yes/i);
});

test("🔴 the section is called Apps, the word the owner asked for", () => {
  // Owner 2026-08-24: "can we just call it apps like in ChatGPT". Also the better word on its own
  // terms — "integrations" is what an engineer calls it, and §38's copy rule is that a control
  // names what the learner gets.
  const surface = readFileSync(new URL("../../components/SettingsSurface.tsx", import.meta.url), "utf8");
  assert.match(surface, /\{ id: "connections", label: "Apps", icon: "plug" \}/, "the Apps section was renamed");
  assert.ok(!/label: "Connected apps"|label: "Integrations"/.test(surface), "the old engineer-facing label came back");
});
