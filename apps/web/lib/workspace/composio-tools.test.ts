import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── handing the connected apps to the model ─────────────────────────────────────────────────
//
// 🔴🔴🔴 THIS CODE WAS WRITTEN WITHOUT A COMPOSIO KEY TO TEST AGAINST, AND THAT FACT SHAPES EVERY
// TEST HERE. The honest risk of shipping it blind is not "the feature does not work" — it is "chat
// breaks for everybody, including the people who never connected anything, in order to add a
// feature nobody can use yet". So the property under test is not that the catalogue parses. It is
// that EVERY failure path yields zero extra tools and leaves the chat loop exactly as it was.
//
// The failure paths, all of which must land on []: no key on the server; nothing connected; a
// network error; a response that is not JSON; a response with no `tools`; a row with no name; a
// row whose schema is not an object.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CLIENT = strip(readFileSync(new URL("./composio-client.ts", import.meta.url), "utf8"));
const ROUTE = strip(readFileSync(new URL("../../app/api/composio/route.ts", import.meta.url), "utf8"));
const CHAT = strip(readFileSync(new URL("./chat-api.ts", import.meta.url), "utf8"));

test("🔴🔴🔴 nothing connected means the model is offered exactly what it was offered before", () => {
  // Calibration: change the fallback to always spread `connected.tools` and this reddens.
  assert.match(
    CHAT,
    /connected\.tools\.length > 0 \? \[\.\.\.AGENT_TOOLS, \.\.\.connected\.tools\] : AGENT_TOOLS/,
    "the tool list no longer falls back to exactly AGENT_TOOLS when nothing is connected",
  );
  assert.match(CHAT, /offerTools \? \{ tools: offered \}/, "the merged list is not the one offered");
});

test("🔴🔴🔴 every failure path returns an empty list rather than throwing", () => {
  const fn = CLIENT.slice(CLIENT.indexOf("export async function composioTools"), CLIENT.indexOf("export async function runConnectedApp"));
  assert.ok(fn.length > 0, "composioTools moved — this guard is pointed at nothing");
  // One shared empty value, returned on every rejection path, so a new branch cannot forget.
  assert.match(fn, /const empty = \{ index: new Map<string, string>\(\), tools: \[\] as ComposioToolDef\[\] \}/);
  assert.match(fn, /if \(!body \|\| !Array\.isArray\(body\.tools\)\) return empty;/, "a malformed response no longer degrades to no tools");
  // `call` already swallows network and parse failures; this must not reintroduce a throw.
  assert.ok(!/throw /.test(fn), "composioTools can now throw into the chat loop");
});

test("🔴🔴 a row missing a name or a schema is dropped, never coerced", () => {
  const fn = CLIENT.slice(CLIENT.indexOf("export async function composioTools"));
  assert.match(fn, /if \(!name \|\| !parameters \|\| typeof parameters !== "object" \|\| Array\.isArray\(parameters\)\) continue;/);
  // The route does the same check on its own side, because it has seen the raw catalogue.
  assert.match(ROUTE, /if \(typeof action !== "string"\) return null;/, "the route stopped dropping nameless catalogue rows");
  assert.match(ROUTE, /if \(!schema\) return null;/, "the route stopped dropping schema-less catalogue rows");
});

test("🔴🔴 the name the model sees is the action slug, unchanged", () => {
  // A friendlier name would need mapping back at execution time, and a mapping that loses an entry
  // sends a call to the WRONG action against somebody's real mailbox.
  const fn = CLIENT.slice(CLIENT.indexOf("export async function composioTools"));
  assert.match(fn, /function: \{ description, name, parameters/, "the tool name is being rewritten");
  assert.match(fn, /index\.set\(name, app\)/, "the routing index no longer keys on the name the model calls");
});

test("🔴🔴🔴 a call is routed to Composio only if the index minted its name", () => {
  // An unknown name must behave exactly as before — executeAgentTool already answers an
  // unrecognised tool with {error}.
  assert.match(
    CHAT,
    /connected\.index\.has\(call\.name\)\s*\?\s*await runConnectedApp\(/,
    "tool calls are no longer routed by whether the connected-apps index knows the name",
  );
  assert.match(CHAT, /:\s*await executeAgentTool\(call, \{ askText/, "the original executor is no longer the fallback");
});

test("🔴🔴 the executor never throws, and never sets confirmed itself", () => {
  const fn = CLIENT.slice(CLIENT.indexOf("export async function runConnectedApp"), CLIENT.indexOf("export type RunResult"));
  assert.ok(fn.length > 0, "runConnectedApp moved — this guard is pointed at nothing");
  assert.ok(!/throw /.test(fn), "the connected-app executor can throw into the chat loop");
  // Only a learner's click may confirm a write. If this function could set it, the whole gate is
  // decorative.
  assert.ok(!/confirmed:\s*true/.test(fn), "the executor can now approve its own write");
  assert.match(fn, /return pendingActionResult\(result\.pending\)/, "a held write no longer reaches the model as held");
});

test("🔴🔴 unparseable arguments are an error, not an empty object", () => {
  // Running a send with `{}` because the model's JSON was malformed is how an empty email reaches
  // somebody.
  const fn = CLIENT.slice(CLIENT.indexOf("export async function runConnectedApp"));
  assert.match(fn, /Those instructions could not be read\. Nothing was done\./);
  assert.ok(!/catch \{\s*\}/.test(fn.slice(0, fn.indexOf("runAction"))), "a JSON failure is swallowed into an empty argument object");
});

test("🔴 the catalogue is asked for, never hardcoded", () => {
  // Action slugs are Composio's to name and change without us; a hardcoded list would silently
  // stop matching and the feature would look built and be dead.
  assert.match(ROUTE, /\/tools\?toolkit_slug=/, "the route stopped asking for the catalogue");
  assert.ok(!/GMAIL_[A-Z_]+|GOOGLEDRIVE_[A-Z_]+/.test(ROUTE), "action slugs were hardcoded into the route");
});

test("🔴 the offered set is capped, and reads come first", () => {
  // A toolkit can carry fifty actions. Offering all of them is a context cost paid on every turn,
  // and it makes every other tool harder for the model to pick.
  assert.match(ROUTE, /const PER_APP_LIMIT = \d+;/);
  assert.match(ROUTE, /const TOTAL_TOOL_LIMIT = \d+;/);
  assert.match(ROUTE, /tools\.slice\(0, TOTAL_TOOL_LIMIT\)/, "the total cap is not applied");
  assert.match(ROUTE, /riskOf\(a\.action\) === "write"/, "reads are no longer preferred when the list is trimmed");
});

test("🔴 only connected, offered apps contribute tools", () => {
  // A toolkit slug the account has connected but this product does not offer must not smuggle its
  // actions into the model's list.
  assert.match(ROUTE, /\.filter\(\(slug\) => APPS\.some\(\(app\) => app\.key === slug\)\)/, "an unoffered app can now contribute tools");
  assert.match(ROUTE, /item\.status === "ACTIVE"/, "a half-finished connection can now contribute tools");
});
