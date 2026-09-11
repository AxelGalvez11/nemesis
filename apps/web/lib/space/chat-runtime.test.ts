import assert from "node:assert/strict";
import { test } from "node:test";

import { space } from "../../space/app/runtime.js";
import { createFakeSupabase } from "./fake-backend";

type Message = { role: string; text: string; md?: boolean; error?: string };
type Chat = { id: string; title: string; messages: Message[] | null; loaded: boolean; running?: boolean; unread?: boolean };
type EngineInput = { message: string; history: unknown; useWebSearch: boolean; place?: string; signal: AbortSignal; onContent?: (visible: string) => void };
type Runtime = {
  sb: unknown;
  me: { id: string };
  state: { aiChats: Record<string, Chat>; sidebar: { chats: Array<{ id: string; title: string }> } };
  chatEngine: ((input: EngineInput) => Promise<unknown>) | null;
  boot(): Promise<void>;
  resetState(): void;
  loadChats(): Promise<void>;
  openChat(id: string): Promise<void>;
  sendChat(id: string | null, text: string, opts?: { webSearch?: boolean }): string | null;
  stopChat(id: string): void;
};
const runtime = space as unknown as Runtime;

async function until(ok: () => boolean, what: string) {
  const end = Date.now() + 2000;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function fresh() {
  const fake = createFakeSupabase();
  runtime.resetState();
  runtime.sb = fake;
  await runtime.boot();
  return fake;
}

test("🔴 a question gets Nemesis's answer streamed in, and both are saved as the person's chat under the name Nemesis gives it", async () => {
  const fake = await fresh();
  const asked: EngineInput[] = [];
  runtime.chatEngine = async (input) => {
    asked.push(input);
    input.onContent?.("Entropy counts");
    return { content: "Entropy counts the arrangements a system can be in.", citations: [{ title: "Notes", url: "https://example.com/a" }], title: "What entropy measures", error: null };
  };

  const id = runtime.sendChat(null, "What does entropy measure?", { webSearch: true })!;
  const chat = runtime.state.aiChats[id]!;
  assert.equal(chat.running, true);
  assert.equal(runtime.state.sidebar.chats[0]!.id, id, "the chat is at the top of the list before the answer arrives");
  await until(() => fake.tables.get("chat_threads")![0]?.title === "What entropy measures", "the chat to be renamed");

  assert.equal(chat.title, "What entropy measures");
  assert.deepEqual(chat.messages!.map((m) => [m.role, m.text, !!m.md]), [
    ["user", "What does entropy measure?", false],
    ["assistant", "Entropy counts the arrangements a system can be in.", true],
  ]);
  assert.equal(asked[0]!.useWebSearch, true);
  assert.equal(asked[0]!.place, "chat");
  const thread = fake.tables.get("chat_threads")![0]!;
  assert.equal(thread.user_id, runtime.me.id);
  const saved = fake.tables.get("chat_messages")!;
  assert.deepEqual(saved.map((r) => [r.thread_id, r.role, r.content]), [
    [id, "user", "What does entropy measure?"],
    [id, "assistant", "Entropy counts the arrangements a system can be in."],
  ]);
  assert.deepEqual((saved[1]!.meta as { sources: unknown }).sources, [{ title: "Notes", url: "https://example.com/a" }]);
  assert.equal(chat.unread, true, "an answer that lands while the chat is not open is marked unread");

  runtime.sendChat(id, "And in information theory?");
  await until(() => asked.length === 2 && !chat.running, "the follow-up");
  assert.deepEqual(asked[1]!.history, [
    { role: "user", content: "What does entropy measure?" },
    { role: "assistant", content: "Entropy counts the arrangements a system can be in." },
  ]);
  await until(() => fake.tables.get("chat_messages")!.length === 4, "the follow-up to be saved");
});

test("a chat saved before opens with its messages, and a failed answer is shown but never saved", async () => {
  const fake = await fresh();
  const me = runtime.me.id;
  fake.tables.get("chat_threads")!.push({ id: "old-1", user_id: me, title: "Older chat", pinned: false, created_at: "2026-08-01T10:00:00.000Z", updated_at: "2026-08-01T10:00:00.000Z" });
  fake.tables.get("chat_messages")!.push(
    { id: "q1", thread_id: "old-1", user_id: me, role: "user", content: "Question from August", meta: null, created_at: "2026-08-01T10:00:00.000Z" },
    { id: "a1", thread_id: "old-1", user_id: me, role: "assistant", content: "Answer from August", meta: null, created_at: "2026-08-01T10:00:01.000Z" },
  );
  await runtime.loadChats();
  assert.deepEqual(runtime.state.sidebar.chats.map((c) => c.title), ["Older chat"]);
  const old = runtime.state.aiChats["old-1"]!;
  assert.equal(old.loaded, false, "messages wait until the chat is opened");
  await runtime.openChat("old-1");
  assert.deepEqual(old.messages!.map((m) => [m.role, m.text]), [["user", "Question from August"], ["assistant", "Answer from August"]]);

  runtime.chatEngine = async () => ({ content: "", citations: [], error: "You have used today's answers." });
  runtime.sendChat("old-1", "One more?");
  await until(() => !old.running, "the failed answer");
  await until(() => fake.tables.get("chat_messages")!.length === 3, "the question to be saved");
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(old.messages!.at(-1)!.error, "You have used today's answers.");
  assert.equal(fake.tables.get("chat_messages")!.length, 3, "the question is saved and the failed answer is not");
});

test("stopping an answer keeps what was already written, and saves it", async () => {
  const fake = await fresh();
  runtime.chatEngine = (input) =>
    new Promise((_resolve, reject) => {
      input.onContent?.("Half an answer");
      input.signal.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")));
    });
  const id = runtime.sendChat(null, "Explain how bridges carry load")!;
  const chat = runtime.state.aiChats[id]!;
  await until(() => (chat.messages ?? []).length === 2, "the answer to start");
  runtime.stopChat(id);
  await until(() => !chat.running, "the stop");
  await until(() => fake.tables.get("chat_messages")!.length === 2, "the partial answer to be saved");
  assert.equal(chat.messages![1]!.text, "Half an answer");
  assert.equal(chat.messages![1]!.error, undefined);
});
