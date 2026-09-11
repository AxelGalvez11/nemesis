import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { space } from "../../space/app/runtime.js";
import { createFakeSupabase } from "./fake-backend";

/**
 * 🔴 THE SIDEBAR THE OWNER APPROVED ON 2026-09-11 (docs/space/PLAN.md, "The app, rebuilt around the workspace").
 *
 * Chats, Workspaces, Notes, Canvas and Meetings, with the inbox as a bell. He had already told us twice what a sidebar
 * that hides things reads like, so these tests pin the row itself, the tab a saved sidebar opens on after the rename,
 * and the one piece of the workspace that is not UI: a chat started inside one stays in it.
 */
const WEB = path.resolve(__dirname, "../..");
const MAIN = readFileSync(path.join(WEB, "space/app/main.js"), "utf8");

test("🔴 the tab row is Chats, Workspaces, Notes, Canvas and Meetings, in that order", () => {
  const block = /const SB_TABS = \[([\s\S]*?)\n\];/.exec(MAIN);
  assert.ok(block, "SB_TABS is not a list any more");
  const labels = [...block[1]!.matchAll(/'([A-Z][a-z]+)'\]/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Chats", "Workspaces", "Notes", "Canvas", "Meetings"]);
});

test("🔴 a sidebar saved before the rename opens on the tab that replaced its own", () => {
  const map = /const TAB_RENAMED = \{([^}]*)\}/.exec(MAIN);
  assert.ok(map, "the rename map is gone, so a saved sidebar would open on a tab that no longer exists");
  for (const [was, now] of [["home", "notes"], ["chat", "chats"], ["inbox", "chats"]]) {
    assert.match(map[1]!, new RegExp(`${was}:\\s*'${now}'`), `a sidebar saved on ${was} does not land on ${now}`);
  }
});

test("🔴 the old Library and the Study page have no door anywhere in the sidebar", () => {
  assert.ok(!/\/library\/classic/.test(MAIN), "the old Library is linked again");
  assert.ok(!/'\/study'|"\/study"/.test(MAIN), "the Study page is linked again");
  assert.match(MAIN, /'\/review'/, "the review door is gone, so cards that are due have nowhere to be reviewed");
});

test("Canvas and the review count are read from the app's own tables, not invented", () => {
  assert.match(MAIN, /space\.loadCanvases\(\)/, "the Canvas tab stopped listing real boards");
  assert.match(MAIN, /space\.loadDueCards\(\)/, "the review row stopped counting real cards");
});

type Chat = { id: string; title: string; running?: boolean; workspace?: string | null };
type Runtime = {
  sb: unknown;
  state: { aiChats: Record<string, Chat>; sidebar: { chats: Array<{ id: string; workspace?: string | null }> } };
  chatEngine: unknown;
  boot(): Promise<void>;
  resetState(): void;
  loadChats(): Promise<void>;
  sendChat(id: string | null, text: string, opts?: { webSearch?: boolean; workspace?: string | null }): string | null;
};
const runtime = space as unknown as Runtime;

async function until(ok: () => boolean, what: string) {
  const end = Date.now() + 2000;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("🔴 a chat started inside a workspace stays in it, and says so when it is listed again", async () => {
  const fake = createFakeSupabase() as unknown as { tables: Map<string, Array<Record<string, unknown>>> };
  runtime.resetState();
  runtime.sb = fake;
  await runtime.boot();
  runtime.chatEngine = async (input: { onContent?: (visible: string) => void }) => {
    input.onContent?.("Entropy is a measure of how many ways a state can be arranged.");
    return { content: "Entropy is a measure of how many ways a state can be arranged.", citations: [], suggestions: {}, title: "Entropy", truncated: false, error: null };
  };

  const id = runtime.sendChat(null, "What is entropy?", { workspace: "page-thermo" });
  assert.ok(id, "the chat was not started");
  await until(() => !runtime.state.aiChats[id!]!.running, "the answer to land");

  const threads = fake.tables.get("chat_threads") ?? [];
  assert.equal(threads.length, 1, "the chat was not saved");
  assert.deepEqual(threads[0]!.meta, { workspace: "page-thermo" }, "the chat did not record the workspace it was started in");

  // And the other way: the list the sidebar draws from carries it, so the chat lists under its workspace and not
  // beside the general ones.
  runtime.state.aiChats = {};
  runtime.state.sidebar.chats = [];
  await runtime.loadChats();
  assert.equal(runtime.state.sidebar.chats[0]?.workspace, "page-thermo");

  const general = runtime.sendChat(null, "Help me plan revision", {});
  await until(() => !runtime.state.aiChats[general!]!.running, "the second answer to land");
  const plain = (fake.tables.get("chat_threads") ?? []).find((row) => row.id === general);
  assert.ok(plain && !plain.meta, "a chat started outside a workspace was filed in one anyway");
});
