import assert from "node:assert/strict";
import { test } from "node:test";

import { space } from "../../space/app/runtime.js";
import { createFakeSupabase } from "./fake-backend";

type Runtime = {
  sb: unknown;
  state: { sidebar: { hidden: Record<string, boolean> } };
  agents: { items: Array<{ id: string; name: string }>; loaded: boolean; available: boolean };
  boot(): Promise<void>;
  resetState(): void;
  loadAgents(): Promise<void>;
  disconnectAgent(id: string): Promise<void>;
};
const runtime = space as unknown as Runtime;

test("🔴 the Agents section lists the AI tools this person connected, and Disconnect ends one's access", async () => {
  const fake = createFakeSupabase();
  fake.seedAgents([{ id: "client-1", name: "Claude", uri: "https://claude.ai" }, { id: "client-2", name: "ChatGPT" }]);
  runtime.resetState();
  runtime.sb = fake;
  await runtime.boot();
  await runtime.loadAgents();
  assert.equal(runtime.agents.available, true);
  assert.deepEqual(runtime.agents.items.map((a) => a.name), ["Claude", "ChatGPT"]);
  assert.notEqual(runtime.state.sidebar.hidden.agents, true, "the section is not hidden by default any more");

  await runtime.disconnectAgent("client-1");
  assert.deepEqual(runtime.agents.items.map((a) => a.name), ["ChatGPT"]);
  await runtime.loadAgents();
  assert.deepEqual(runtime.agents.items.map((a) => a.name), ["ChatGPT"], "the grant is gone on the server too");
});

test("before the sign-in for AI tools is switched on, the list is empty and says it is not available", async () => {
  const fake = createFakeSupabase();
  const auth = (fake as unknown as { auth: { oauth: { listGrants: () => Promise<unknown> } } }).auth;
  auth.oauth.listGrants = async () => ({ data: null, error: { message: "OAuth server is disabled" } });
  runtime.resetState();
  runtime.sb = fake;
  await runtime.boot();
  await runtime.loadAgents();
  assert.deepEqual(runtime.agents, { items: [], loaded: true, available: false });
});
