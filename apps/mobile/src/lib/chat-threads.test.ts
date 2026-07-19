// Deno unit tests (repo convention) for the multi-thread chat store.
// Run: deno test --no-check apps/mobile/src/lib/chat-threads.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ChatMsg } from "./chat-thread.ts";
import {
  deriveThreadTitle,
  emptyStore,
  getThread,
  MAX_THREADS,
  parseThreadStore,
  removeThread,
  setThreadPinned,
  threadSummaries,
  UNTITLED_THREAD,
  upsertThread,
} from "./chat-threads.ts";

const user = (content: string, at = "2026-07-18T00:00:00Z"): ChatMsg => ({ at, content, role: "user" });
const bot = (content: string, at = "2026-07-18T00:00:01Z"): ChatMsg => ({ at, content, role: "assistant" });

Deno.test("deriveThreadTitle: first user message, trimmed; else Untitled", () => {
  assertEquals(deriveThreadTitle([user("  What is a beta blocker?  ")]), "What is a beta blocker?");
  assertEquals(deriveThreadTitle([bot("hi there")]), UNTITLED_THREAD); // no user message
  assertEquals(deriveThreadTitle([]), UNTITLED_THREAD);
  const long = "a".repeat(60);
  assertEquals(deriveThreadTitle([user(long)]).length, 40); // 39 + ellipsis
  assert(deriveThreadTitle([user(long)]).endsWith("…"));
  assertEquals(deriveThreadTitle([user("line one\n\nline two")]), "line one line two"); // whitespace collapsed
});

Deno.test("upsertThread: inserts, updates in place, refreshes title/updatedAt, keeps createdAt", () => {
  let store = emptyStore();
  store = upsertThread(store, "t1", [user("First question")], "2026-07-18T01:00:00Z");
  assertEquals(store.threads.length, 1);
  assertEquals(store.threads[0].title, "First question");
  assertEquals(store.threads[0].createdAt, "2026-07-18T01:00:00Z");

  // Same id again → still one thread, new title/updatedAt, original createdAt.
  store = upsertThread(store, "t1", [user("First question"), bot("answer"), user("Follow up")], "2026-07-18T02:00:00Z");
  assertEquals(store.threads.length, 1);
  assertEquals(store.threads[0].title, "First question"); // title = FIRST user message
  assertEquals(store.threads[0].updatedAt, "2026-07-18T02:00:00Z");
  assertEquals(store.threads[0].createdAt, "2026-07-18T01:00:00Z");
  assertEquals(store.threads[0].messages.length, 3);
});

Deno.test("upsertThread: newest thread sorts first; store caps at MAX_THREADS", () => {
  let store = emptyStore();
  for (let i = 0; i < MAX_THREADS + 5; i++) {
    const iso = `2026-07-18T00:${String(i).padStart(2, "0")}:00Z`;
    store = upsertThread(store, `t${i}`, [user(`q${i}`)], iso);
  }
  assertEquals(store.threads.length, MAX_THREADS);
  assertEquals(store.threads[0].id, `t${MAX_THREADS + 4}`); // most recent first
  assert(!store.threads.some((t) => t.id === "t0")); // oldest evicted
});

Deno.test("threadSummaries: newest first, hides empty threads, drops message bodies", () => {
  let store = emptyStore();
  store = upsertThread(store, "old", [user("older")], "2026-07-18T01:00:00Z");
  store = upsertThread(store, "new", [user("newer")], "2026-07-18T03:00:00Z");
  store = upsertThread(store, "blank", [], "2026-07-18T04:00:00Z"); // never sent → hidden
  const rows = threadSummaries(store);
  assertEquals(rows.map((r) => r.id), ["new", "old"]);
  assertEquals(Object.keys(rows[0]).sort(), ["id", "pinned", "title", "updatedAt"]);
  assertEquals(rows[0].pinned, false); // unpinned by default
});

Deno.test("setThreadPinned: sets and clears the flag; unknown id is a no-op", () => {
  let store = upsertThread(emptyStore(), "t1", [user("q")], "2026-07-18T01:00:00Z");
  store = setThreadPinned(store, "t1", true);
  assertEquals(getThread(store, "t1")?.pinned, true);
  store = setThreadPinned(store, "t1", false);
  assertEquals(getThread(store, "t1")?.pinned, false);
  // Unknown id leaves the store untouched (still one thread).
  store = setThreadPinned(store, "nope", true);
  assertEquals(store.threads.length, 1);
  assertEquals(getThread(store, "t1")?.pinned, false);
});

Deno.test("threadSummaries: pinned threads sort ABOVE the rest, newest-first within each group", () => {
  let store = emptyStore();
  store = upsertThread(store, "a", [user("a")], "2026-07-18T01:00:00Z"); // oldest
  store = upsertThread(store, "b", [user("b")], "2026-07-18T02:00:00Z");
  store = upsertThread(store, "c", [user("c")], "2026-07-18T03:00:00Z"); // newest
  // Pin the OLDEST — it must still jump to the very top.
  store = setThreadPinned(store, "a", true);
  const rows = threadSummaries(store);
  assertEquals(rows.map((r) => r.id), ["a", "c", "b"]);
  assertEquals(rows[0].pinned, true);
  assertEquals(rows[1].pinned, false);
});

Deno.test("pinned state survives an upsert (new message) and a parse round-trip", () => {
  let store = upsertThread(emptyStore(), "t1", [user("q")], "2026-07-18T01:00:00Z");
  store = setThreadPinned(store, "t1", true);
  // A new message must NOT clear the pin.
  store = upsertThread(store, "t1", [user("q"), bot("a")], "2026-07-18T02:00:00Z");
  assertEquals(getThread(store, "t1")?.pinned, true);
  // Serialize → parse must preserve it.
  const round = parseThreadStore(JSON.parse(JSON.stringify(store)), "x", "n");
  assertEquals(getThread(round, "t1")?.pinned, true);
});

Deno.test("getThread / removeThread", () => {
  let store = upsertThread(emptyStore(), "t1", [user("q")], "2026-07-18T01:00:00Z");
  assertEquals(getThread(store, "t1")?.id, "t1");
  assertEquals(getThread(store, "nope"), null);
  store = removeThread(store, "t1");
  assertEquals(store.threads.length, 0);
});

Deno.test("parseThreadStore: migrates the OLD single-thread file into one thread", () => {
  const legacy = { messages: [user("carried over"), bot("kept")], v: 1 };
  const store = parseThreadStore(legacy, "migrated-id", "2026-07-18T05:00:00Z");
  assertEquals(store.threads.length, 1);
  assertEquals(store.threads[0].id, "migrated-id");
  assertEquals(store.threads[0].title, "carried over");
  assertEquals(store.threads[0].messages.length, 2);
  // An empty legacy file migrates to nothing.
  assertEquals(parseThreadStore({ messages: [], v: 1 }, "x", "2026-07-18T05:00:00Z").threads.length, 0);
});

Deno.test("parseThreadStore: reads a v2 store, drops malformed threads, empty on garbage", () => {
  const good = {
    threads: [
      { createdAt: "2026-07-18T01:00:00Z", id: "a", messages: [user("q")], title: "A", updatedAt: "2026-07-18T01:00:00Z" },
      { id: "", messages: [] }, // no id → dropped
      "garbage",
    ],
    v: 2,
  };
  const store = parseThreadStore(good, "x", "2026-07-18T05:00:00Z");
  assertEquals(store.threads.length, 1);
  assertEquals(store.threads[0].id, "a");
  assertEquals(parseThreadStore(null, "x", "n").threads.length, 0);
  assertEquals(parseThreadStore({ v: 9 }, "x", "n").threads.length, 0);
});
