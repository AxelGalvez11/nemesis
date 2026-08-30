import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CONNECTABLE_APPS, isOffered } from "./composio-apps";

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
  // Composio brokers 1,431 toolkits. Offering all of them turns a study tool into an integrations
  // directory, and every extra app is another consent screen clicked unread.
  //
  // 🔴 THE LIST MOVED TO `composio-apps.ts` AND THIS GUARD FOLLOWED IT RATHER THAN THINNING. The
  // membership check is still pinned in the route, where the refusal happens; the CONTENTS are now
  // asserted against the imported module, which is stronger than the old substring scan of the
  // route text (that would have passed on the word "gmail" appearing in any comment).
  assert.match(ROUTE, /if \(!isOffered\(app\)\) \{/, "the route stopped refusing unoffered apps");
  assert.match(ROUTE, /return Response\.json\(\{ error: "That app is not offered\." \}, \{ status: 400 \}\)/);
  for (const app of ["googledrive", "gmail", "googlecalendar", "googledocs"]) {
    assert.ok(isOffered(app), `${app} is no longer offered`);
  }
  // And `isOffered` is a membership test over the list, not something that grew a wildcard.
  assert.ok(!isOffered("stripe") && !isOffered("slack"), "the closed list stopped being closed");
});

test("🔴🔴 every connected app is guaranteed a real share of the tool budget", () => {
  // The defect: reads from every app went into ONE list, sorted, and sliced at 24. Drive alone
  // offers 19 reads and Gmail 11, so two apps could fill the budget and a learner with four
  // connected would find Nemesis could not see their calendar. Nothing looked broken; the calendar
  // tools were simply never offered to the model.
  assert.match(ROUTE, /function roundRobin\(/, "the round-robin share was removed");
  assert.match(ROUTE, /roundRobin\(perApp, TOTAL_TOOL_LIMIT\)/, "the tools are no longer shared out per app");
  // 🔴 AND THE OLD GLOBAL CUT MUST NOT COME BACK. A sort across all apps followed by one slice is
  // precisely the shape that starves whoever sorts last.
  const tools = ROUTE.slice(ROUTE.indexOf("async function toolsFor"), ROUTE.indexOf("function readTool"));
  assert.ok(!/tools\.slice\(0, TOTAL_TOOL_LIMIT\)/.test(tools), "the global cut came back");

  // The floor is arithmetic, so it is checked as arithmetic: nine apps must still clear four each.
  const limit = Number(/const TOTAL_TOOL_LIMIT = (\d+)/.exec(ROUTE)?.[1] ?? 0);
  assert.ok(limit > 0, "TOTAL_TOOL_LIMIT is gone or unreadable");
  assert.ok(
    limit >= CONNECTABLE_APPS.length * 4,
    `${CONNECTABLE_APPS.length} apps need a budget of at least ${CONNECTABLE_APPS.length * 4}, but it is ${limit}. ` +
      "Adding an app without raising this quietly drops every app's share.",
  );
});

test("🔴🔴 an app's actions are ranked before they are cut, never after", () => {
  // The defect this pins shut: the per-app limit was 12 and the reads-first sort ran AFTERWARDS,
  // so the cut was alphabetical. Notion has 13 read actions; that request returned three, all
  // beginning NOTION_FETCH_B…, and NOTION_SEARCH_NOTION_PAGE never reached the model at all.
  // Measured 2026-08-30 against the live catalogue.
  const perApp = ROUTE.slice(ROUTE.indexOf("async function catalogueFor"), ROUTE.indexOf("function roundRobin"));
  const fetchAt = perApp.indexOf("CATALOGUE_LIMIT");
  const sortAt = perApp.indexOf(".sort(");
  assert.ok(fetchAt > 0 && sortAt > fetchAt, "the ranking no longer happens after the whole toolkit is fetched");
  // The fetch must ask for the whole toolkit, not a budget's worth. Largest offered app: 51 rows.
  const limit = Number(/const CATALOGUE_LIMIT = (\d+)/.exec(ROUTE)?.[1] ?? 0);
  assert.ok(limit >= 60, `CATALOGUE_LIMIT is ${limit}, which truncates the largest toolkit before it is ranked`);
});

test("🔴 one unreachable app does not silence the others", () => {
  // `Promise.all` over throwing calls turns a single provider's outage into "Nemesis cannot see
  // any of your apps". Each app's fetch contains its own failure and returns an empty list.
  const perApp = ROUTE.slice(ROUTE.indexOf("async function catalogueFor"), ROUTE.indexOf("function roundRobin"));
  assert.match(perApp, /catch \{\s*return \[\];\s*\}/, "an app's failure is no longer contained");
});

test("🔴🔴🔴 connecting posts to the endpoint that still exists", () => {
  // The bug this pins shut: `connectTo` posted to `/connected_accounts`, which Composio retired
  // for Composio-managed OAuth. Every offered app uses managed OAuth, so EVERY Connect button in
  // the product was dead, Gmail and Drive included, and it failed as "Could not start that
  // connection. Try again in a moment." — a sentence that describes a passing glitch. Nothing
  // logged and nothing alerted; the connected count just stayed at zero, which is indistinguish-
  // able from nobody having tried.
  const connect = ROUTE.slice(ROUTE.indexOf("async function connectTo"), ROUTE.indexOf("async function disconnectFrom"));
  assert.match(connect, /composio\("\/connected_accounts\/link"/, "connecting no longer uses the /link endpoint");
  // 🔴 AND THE PAYLOAD IS FLAT. `/link` rejects the old nested shape as a validation error on both
  // fields, so getting the endpoint right and the body wrong fails exactly as loudly as before.
  assert.match(connect, /auth_config_id: authConfigId/, "the auth config id is no longer sent flat");
  assert.match(connect, /user_id: uid/, "the user id is no longer sent flat");
  assert.ok(!/auth_config: \{ id:/.test(connect), "the retired nested payload came back");
  // The redirect the learner is sent to is the one the live endpoint returns.
  assert.match(connect, /payload\.redirect_url \?\? payload\.connectionData/, "redirect_url is no longer preferred");
});

test("🔴🔴🔴 the auth config is looked up, and the row's toolkit is checked before it is used", () => {
  // The other half of why nothing was ever connected: `connectTo` read `COMPOSIO_AUTH_<APP>` and
  // sent whatever it found, which was the empty string, because not one of those variables has
  // ever been set. Nine hand-copied ids across two environments is nine chances to ship a dead
  // button, and the button gives no sign which one is missing.
  const lookup = ROUTE.slice(ROUTE.indexOf("async function authConfigFor"), ROUTE.indexOf("async function connectTo"));
  assert.ok(lookup.length > 200, "authConfigFor is gone");
  assert.match(lookup, /auth_configs\?toolkit_slug=\$\{encodeURIComponent\(app\)\}/, "the lookup no longer filters by toolkit slug");
  // 🔴🔴🔴 THE GUARD THAT MATTERS. An unknown query parameter is IGNORED by this API rather than
  // rejected: `?toolkit=notion` returns the account's first five configs, starting with Zoom's. So
  // without this check a one-word slip in the parameter name would send a learner who clicked
  // Connect on Notion to Zoom's consent screen, and they would connect Zoom.
  assert.match(lookup, /item\.toolkit\?\.slug === app/, "a returned auth config is no longer checked against the app it is for");
  // The environment variable still wins where a deployment pins one.
  assert.match(lookup, /process\.env\[`COMPOSIO_AUTH_\$\{app\.toUpperCase\(\)\}`\]/, "the pinned override is gone");
  // A missing config says so distinctly rather than borrowing the transient wording.
  assert.match(ROUTE, /not set up for connecting yet/, "a permanently missing config reads as a passing glitch again");
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
  //
  // 🔴 THE MATCH IS ON THE id→label PAIRING, NOT ON THE WHOLE OBJECT LITERAL. It used to pin
  // `{ id: "connections", label: "Apps", icon: "plug" }` right down to the closing brace, so
  // adding ANY field to a section entry reddened a test about a word — which it duly did when
  // sections gained `keywords` (2026-08-24), while the label it defends had not moved. A guard
  // that fires on edits it does not care about teaches people to edit the guard, and the next
  // person doing that in a hurry deletes the assertion instead of narrowing it.
  const surface = readFileSync(new URL("../../components/SettingsSurface.tsx", import.meta.url), "utf8");
  assert.match(surface, /id: "connections", label: "Apps"/, "the Apps section was renamed");
  assert.ok(!/label: "Connected apps"|label: "Integrations"/.test(surface), "the old engineer-facing label came back");
});
