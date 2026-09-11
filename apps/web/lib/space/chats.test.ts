import assert from "node:assert/strict";
import { test } from "node:test";

import { chatHistory, chatTitle, citationsOf, createChat, listChats, loadChatLines, saveChatLine, touchChat, type ChatDb } from "./chats";
import { createFakeSupabase } from "./fake-backend";

test("🔴 a chat is saved as the person's own, the list is newest first, and nobody else's chat is in it", async () => {
  const fake = createFakeSupabase();
  const db = fake as unknown as ChatDb;
  await createChat(db, "me", "c1", "Older chat");
  await createChat(db, "me", "c2", "Newer chat");
  await createChat(db, "someone-else", "c3", "Not mine");
  const threads = fake.tables.get("chat_threads")!;
  threads.find((r) => r.id === "c1")!.updated_at = "2026-01-01T10:00:00.000Z";
  threads.find((r) => r.id === "c2")!.updated_at = "2026-01-02T10:00:00.000Z";
  assert.deepEqual((await listChats(db, "me")).map((c) => c.id), ["c2", "c1"]);

  await touchChat(db, "c1", "Named by Nemesis");
  assert.deepEqual(
    (await listChats(db, "me")).map((c) => [c.id, c.title]),
    [["c1", "Named by Nemesis"], ["c2", "Newer chat"]],
    "a chat with a new answer moves to the top under its new name",
  );
});

test("a chat opens oldest first with each answer's sources, and chats saved before read the same", async () => {
  const fake = createFakeSupabase();
  const db = fake as unknown as ChatDb;
  await createChat(db, "me", "c1", "Entropy");
  await saveChatLine(db, "me", "c1", { id: "m1", role: "user", text: "What is entropy?" });
  await saveChatLine(db, "me", "c1", { id: "m2", role: "assistant", text: "A count of arrangements.", sources: [{ title: "Notes", url: "https://example.com/a" }] });
  fake.tables.get("chat_messages")!.push({ id: "m0", thread_id: "c1", user_id: "me", role: "system", content: "never shown", meta: null, created_at: "2026-01-01T00:00:00.000Z" });

  const lines = await loadChatLines(db, "c1");
  assert.deepEqual(lines.map((l) => [l.id, l.role]), [["m1", "user"], ["m2", "assistant"]]);
  assert.deepEqual(lines[1]!.sources, [{ title: "Notes", url: "https://example.com/a" }]);
  assert.deepEqual(
    citationsOf({ sources: [{ title: "Older", url: "https://example.com/b", description: "saved before" }, { title: "no address" }] }),
    [{ title: "Older", url: "https://example.com/b" }],
  );
});

test("a chat is named by its first line, and the model reads the newest messages that fit, starting from a question", () => {
  assert.equal(chatTitle("\n  How do  bridges\ncarry load?"), "How do bridges");
  assert.equal(chatTitle("   "), "New chat");
  assert.equal(chatTitle("x".repeat(120)).length, 80);

  const lines = [
    { role: "assistant", text: "What are we studying?" },
    { role: "user", text: "a".repeat(10) },
    { role: "assistant", text: "b".repeat(10) },
    { role: "user", text: "c".repeat(10) },
  ];
  assert.deepEqual(chatHistory(lines).map((m) => m.role), ["user", "assistant", "user"], "the opening answer is dropped");
  assert.deepEqual(chatHistory(lines, 25).map((m) => m.content), ["c".repeat(10)], "what does not fit goes, oldest first");
});
