// Deno unit tests (repo convention) for the multi-thread chat store.
// Run: deno test --no-check apps/mobile/src/lib/chat-threads.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ChatMsg } from "./chat-thread.ts";
import {
  chatMsgFromCloudRow,
  type CloudThreadMeta,
  deriveMessageId,
  deriveThreadTitle,
  emptyStore,
  ensureMessageIds,
  generateUuidV4,
  getThread,
  isValidThreadId,
  MAX_THREADS,
  mergeCloudThreadList,
  mergeMessages,
  newMessagesSince,
  outputsFromMeta,
  parseThreadStore,
  remapThreadId,
  removeThread,
  renameThreadTitle,
  setThreadMessages,
  setThreadPinned,
  threadSummaries,
  UNTITLED_THREAD,
  upsertThread,
} from "./chat-threads.ts";

const user = (content: string, at = "2026-07-18T00:00:00Z", id?: string): ChatMsg => ({ at, content, role: "user", ...(id ? { id } : {}) });
const bot = (content: string, at = "2026-07-18T00:00:01Z", id?: string): ChatMsg => ({ at, content, role: "assistant", ...(id ? { id } : {}) });

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

Deno.test("renameThreadTitle: sets a manual title; blank / unknown id is a no-op", () => {
  let store = upsertThread(emptyStore(), "t1", [user("First question")], "2026-07-18T01:00:00Z");
  store = renameThreadTitle(store, "t1", "  Beta blockers exam  ");
  assertEquals(getThread(store, "t1")?.title, "Beta blockers exam"); // trimmed
  store = renameThreadTitle(store, "t1", "   "); // blank → unchanged
  assertEquals(getThread(store, "t1")?.title, "Beta blockers exam");
  const before = store;
  store = renameThreadTitle(store, "missing", "nope"); // unknown id → no-op
  assertEquals(store.threads.length, before.threads.length);
});

Deno.test("upsertThread: a manual rename SURVIVES the next message (no title clobber)", () => {
  let store = upsertThread(emptyStore(), "t1", [user("First question")], "2026-07-18T01:00:00Z");
  store = renameThreadTitle(store, "t1", "Renamed by hand");
  // A new message used to re-derive the title from the first message, reverting
  // the rename. It must now be preserved.
  store = upsertThread(store, "t1", [user("First question"), bot("answer"), user("Follow up")], "2026-07-18T02:00:00Z");
  assertEquals(getThread(store, "t1")?.title, "Renamed by hand");
  assertEquals(getThread(store, "t1")?.messages.length, 3); // messages still updated
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

// ── Cloud reconciliation (§6) ────────────────────────────────────────────────

Deno.test("generateUuidV4: produces valid-shaped, non-constant ids", () => {
  const a = generateUuidV4();
  const b = generateUuidV4();
  assert(isValidThreadId(a));
  assert(isValidThreadId(b));
  assert(a !== b);
});

Deno.test("isValidThreadId: only a real uuid passes — legacy local ids do not", () => {
  assert(isValidThreadId("3fa85f64-5717-4562-b3fc-2c963f66afa6"));
  assert(isValidThreadId("3FA85F64-5717-4562-B3FC-2C963F66AFA6")); // case-insensitive
  assert(!isValidThreadId("kx3f8n-a1b2c3d4")); // the pre-cloud build's local format
  assert(!isValidThreadId(""));
});

Deno.test("remapThreadId: renames a thread's id in place; unknown id is a no-op", () => {
  let store = upsertThread(emptyStore(), "old-id", [user("q")], "2026-07-18T01:00:00Z");
  store = remapThreadId(store, "old-id", "3fa85f64-5717-4562-b3fc-2c963f66afa6");
  assertEquals(getThread(store, "old-id"), null);
  assertEquals(getThread(store, "3fa85f64-5717-4562-b3fc-2c963f66afa6")?.messages[0].content, "q");
  const untouched = remapThreadId(store, "nope", "whatever");
  assertEquals(untouched, store);
});

Deno.test("ensureMessageIds: backfills only messages missing an id, leaves existing ids alone", () => {
  let n = 0;
  const makeId = (_message: ChatMsg) => `gen-${++n}`;
  const withIds = ensureMessageIds([user("a", undefined, "kept"), bot("b"), user("c")], makeId);
  assertEquals(withIds.map((m) => m.id), ["kept", "gen-1", "gen-2"]);
  assertEquals(withIds[0].content, "a"); // untouched otherwise
});

Deno.test("ensureMessageIds: passes the message itself to makeId (deriveMessageId needs role/at/content)", () => {
  const seen: string[] = [];
  const withIds = ensureMessageIds([user("a")], (message) => {
    seen.push(message.content);
    return "id-1";
  });
  assertEquals(seen, ["a"]);
  assertEquals(withIds[0].id, "id-1");
});

Deno.test("deriveMessageId: deterministic — same (threadId, role, at, content) always hashes to the same id", () => {
  const a = deriveMessageId("t1", user("hello"));
  const b = deriveMessageId("t1", user("hello"));
  assertEquals(a, b);
  assert(isValidThreadId(a)); // a valid Postgres uuid literal (chat_messages.id is `uuid`)
});

Deno.test("deriveMessageId: different thread, role, at, or content each change the id", () => {
  const base = deriveMessageId("t1", user("hello", "2026-07-18T00:00:00Z"));
  assert(base !== deriveMessageId("t2", user("hello", "2026-07-18T00:00:00Z"))); // different thread
  assert(base !== deriveMessageId("t1", bot("hello", "2026-07-18T00:00:00Z"))); // different role
  assert(base !== deriveMessageId("t1", user("hello", "2026-07-18T00:00:01Z"))); // different at
  assert(base !== deriveMessageId("t1", user("bye", "2026-07-18T00:00:00Z"))); // different content
});

Deno.test("regression: saveThreadMessages' two-calls-per-turn pattern no longer double-syncs the user message", () => {
  // Mirrors api/chat.ts's saveThreadMessages EXACTLY: chat.tsx calls it once
  // with `base` (history + a still-id-less user message), then again with
  // `next` (= [...base, assistantMsg]) — the SAME user-message object
  // reference both times, still without an id, because chat.tsx never learns
  // the id ensureMessageIds assigned inside the first call. Before
  // deriveMessageId, the second call minted a NEW random id for that object,
  // so newMessagesSince() saw it as "new" again and it was inserted twice —
  // confirmed against prod (a thread with two identical role/content/
  // created_at rows). This test fails if that regresses.
  const threadId = "thread-1";
  const question: ChatMsg = { at: "2026-07-18T00:00:00.000Z", content: "how does X compare to Y?", role: "user" };
  const base = [question]; // what chat.tsx holds after the user sends

  // Call 1: saveThreadMessages(uid, threadId, base)
  const withIds1 = ensureMessageIds(base, (m) => deriveMessageId(threadId, m));
  const new1 = newMessagesSince(withIds1, []); // previous store was empty
  assertEquals(new1.length, 1);
  const userRowId = new1[0].id;

  // Call 2: saveThreadMessages(uid, threadId, next) — `next`'s user message
  // is the SAME `question` object (still id-less); an assistant reply is appended.
  const reply: ChatMsg = { at: "2026-07-18T00:00:03.000Z", content: "X does this, Y does that.", role: "assistant" };
  const next = [...base, reply];
  const withIds2 = ensureMessageIds(next, (m) => deriveMessageId(threadId, m));
  const new2 = newMessagesSince(withIds2, withIds1); // previous = what call 1 persisted

  // Only the assistant reply is new — the user message must NOT double-sync.
  assertEquals(new2.map((m) => m.role), ["assistant"]);
  assertEquals(withIds2[0].id, userRowId); // same id both times, not a fresh one
});

Deno.test("newMessagesSince: id-based diff — the common append-only case", () => {
  const a = user("a", "2026-07-18T00:00:00Z", "1");
  const b = bot("b", "2026-07-18T00:00:01Z", "2");
  const c = user("c", "2026-07-18T00:00:02Z", "3");
  assertEquals(newMessagesSince([a, b, c], [a, b]).map((m) => m.content), ["c"]);
  assertEquals(newMessagesSince([a, b, c], []), [a, b, c]); // nothing synced yet → everything is new
  assertEquals(newMessagesSince([a, b, c], [a, b, c]), []); // fully synced → nothing new
});

Deno.test("newMessagesSince: still finds the newest message after the 200-cap evicts the oldest (id-based, not count-based)", () => {
  // upsertThread caps a thread at MAX_MESSAGES_PER_THREAD by dropping the
  // OLDEST message — so the total count can stay flat even though a new
  // message just arrived. A count-based diff would miss it; an id-based one
  // still finds it because "d" simply isn't in `previous`.
  const a = user("a", "2026-07-18T00:00:00Z", "1");
  const b = bot("b", "2026-07-18T00:00:01Z", "2");
  const c = user("c", "2026-07-18T00:00:02Z", "3");
  const d = bot("d", "2026-07-18T00:00:03Z", "4");
  const previous = [a, b];
  const current = [b, c]; // "a" got evicted, "c" got added — SAME length (2) as previous, but genuinely different content
  assertEquals(newMessagesSince(current, previous).map((m) => m.content), ["c"]);
  // A second turn later: "b" evicted, "d" added — again same length, still finds the new one.
  assertEquals(newMessagesSince([c, d], [b, c]).map((m) => m.content), ["d"]);
});

Deno.test("newMessagesSince: falls back to a role|at|content key for legacy id-less messages", () => {
  const legacy = { at: "2026-07-18T00:00:00Z", content: "no id", role: "user" as const };
  assertEquals(newMessagesSince([legacy], [legacy]), []);
  assertEquals(newMessagesSince([legacy], []), [legacy]);
});

Deno.test("mergeCloudThreadList: cloud metadata wins for known ids, cloud-only ids are added as stubs, local-only ids survive", () => {
  let store = upsertThread(emptyStore(), "local-only", [user("still syncing")], "2026-07-18T01:00:00Z");
  store = upsertThread(store, "known", [user("hi")], "2026-07-18T01:00:00Z");
  const cloud: CloudThreadMeta[] = [
    { createdAt: "2026-07-18T01:00:00Z", id: "known", pinned: true, title: "Renamed via cloud", updatedAt: "2026-07-18T09:00:00Z" },
    { createdAt: "2026-07-18T02:00:00Z", id: "cloud-only", pinned: false, title: "From another device", updatedAt: "2026-07-18T02:00:00Z" },
  ];
  const merged = mergeCloudThreadList(store, cloud);
  assertEquals(getThread(merged, "known")?.title, "Renamed via cloud");
  assertEquals(getThread(merged, "known")?.pinned, true);
  assertEquals(getThread(merged, "known")?.messages[0].content, "hi"); // local messages untouched by the list merge
  assertEquals(getThread(merged, "cloud-only")?.messages, []); // stub — hydrated on open
  assertEquals(getThread(merged, "local-only")?.messages[0].content, "still syncing"); // NOT dropped
});

Deno.test("chatMsgFromCloudRow: maps a valid row, normalizes the timestamp, drops system/malformed rows", () => {
  const msg = chatMsgFromCloudRow({
    content: "hello",
    created_at: "2026-07-18T01:00:00+00:00", // Postgres-shaped, not the local Z-suffixed form
    id: "row-1",
    meta: { sources: [{ description: "d", title: "T", url: "https://x.test" }] },
    role: "user",
  });
  assertEquals(msg?.content, "hello");
  assertEquals(msg?.at, "2026-07-18T01:00:00.000Z"); // normalized to the canonical Z form
  assertEquals(msg?.id, "row-1");
  assertEquals(msg?.sources, [{ description: "d", title: "T", url: "https://x.test" }]);

  assertEquals(chatMsgFromCloudRow({ content: "x", created_at: "2026-07-18T01:00:00Z", id: "1", meta: null, role: "system" }), null);
  assertEquals(chatMsgFromCloudRow({ content: 5, created_at: "2026-07-18T01:00:00Z", id: "1", meta: null, role: "user" }), null);
  assertEquals(chatMsgFromCloudRow({ content: "x", created_at: "not-a-date", id: "1", meta: null, role: "user" }), null);
  // meta with a malformed source entry is dropped, not the whole message.
  const tolerant = chatMsgFromCloudRow({ content: "x", created_at: "2026-07-18T01:00:00Z", id: "1", meta: { sources: [{ url: 5 }] }, role: "user" });
  assertEquals(tolerant?.sources, undefined);
});

Deno.test("chatMsgFromCloudRow: round-trips message-level outputs (deliverable pills) alongside sources", () => {
  const withOutputs = chatMsgFromCloudRow({
    content: "Recording captured — transcript and notes are ready.",
    created_at: "2026-07-18T01:00:00Z",
    id: "row-2",
    meta: {
      outputs: [
        { createdAt: "2026-07-18T00:55:00Z", durationSeconds: 312, id: "art-1", kind: "recording", notes: "Key points.", title: "Lecture recap", transcript: "Today we covered..." },
      ],
    },
    role: "assistant",
  });
  assertEquals(withOutputs?.outputs, [
    { createdAt: "2026-07-18T00:55:00Z", durationSeconds: 312, id: "art-1", kind: "recording", notes: "Key points.", title: "Lecture recap", transcript: "Today we covered..." },
  ]);

  // No outputs in meta → the field is omitted entirely (not an empty array), same
  // posture as sources — callers gate on `.length` / truthiness.
  const without = chatMsgFromCloudRow({ content: "x", created_at: "2026-07-18T01:00:00Z", id: "1", meta: null, role: "user" });
  assertEquals(without?.outputs, undefined);
});

Deno.test("outputsFromMeta: validates kind against the SessionOutput set, tolerates malformed entries and missing meta", () => {
  assertEquals(outputsFromMeta(null), []);
  assertEquals(outputsFromMeta({}), []);
  assertEquals(outputsFromMeta({ outputs: "not-an-array" }), []);
  // A malformed entry (missing id) is dropped; a valid sibling survives.
  const mixed = outputsFromMeta({
    outputs: [
      { id: "keep-1", kind: "flashcards", title: "Cardiology deck" },
      { kind: "flashcards", title: "Missing id — dropped" },
      { id: "keep-2", kind: "not-a-real-kind", title: "Unknown kind — dropped" },
    ],
  });
  assertEquals(mixed.map((o) => o.id), ["keep-1"]);
  assertEquals(mixed[0].kind, "flashcards");
  // Every documented kind round-trips.
  for (const kind of ["flashcards", "slides", "test", "report", "recording", "other"] as const) {
    const [output] = outputsFromMeta({ outputs: [{ id: `id-${kind}`, kind, title: `A ${kind}` }] });
    assertEquals(output.kind, kind);
  }
});

Deno.test("mergeMessages: de-dupes by id (cloud copy wins), sorts chronologically, keeps both local-only and cloud-only tails", () => {
  const local = [user("a", "2026-07-18T01:00:00.000Z", "1"), user("offline draft", "2026-07-18T03:00:00.000Z", "3")];
  const cloud = [
    user("a", "2026-07-18T01:00:00.000Z", "1"), // exact duplicate by id
    bot("from web", "2026-07-18T02:00:00.000Z", "2"), // cloud-only, in the middle
  ];
  const merged = mergeMessages(local, cloud);
  assertEquals(merged.map((m) => m.id), ["1", "2", "3"]);
  assertEquals(merged.map((m) => m.content), ["a", "from web", "offline draft"]);
});

Deno.test("mergeMessages: falls back to a role|at|content key when a legacy row has no id", () => {
  const local = [{ at: "2026-07-18T01:00:00.000Z", content: "legacy", role: "user" as const }];
  const cloud = [{ at: "2026-07-18T01:00:00.000Z", content: "legacy", role: "user" as const }];
  assertEquals(mergeMessages(local, cloud).length, 1);
});

Deno.test("setThreadMessages: replaces messages without touching title/pinned/timestamps", () => {
  let store = upsertThread(emptyStore(), "t1", [user("first")], "2026-07-18T01:00:00Z");
  store = setThreadPinned(store, "t1", true);
  const before = getThread(store, "t1")!;
  store = setThreadMessages(store, "t1", [user("first"), bot("reply from another device")], "2026-07-18T09:00:00Z");
  const after = getThread(store, "t1")!;
  assertEquals(after.messages.length, 2);
  assertEquals(after.title, before.title);
  assertEquals(after.pinned, true);
  assertEquals(after.updatedAt, before.updatedAt); // a read-time merge must NOT resort the sidebar
  assertEquals(after.createdAt, before.createdAt);
});

Deno.test("setThreadMessages: constructs a fresh entry when the thread is unknown locally (defensive)", () => {
  const store = setThreadMessages(emptyStore(), "cloud-only", [user("hi")], "2026-07-18T09:00:00Z");
  assertEquals(getThread(store, "cloud-only")?.messages[0].content, "hi");
  assertEquals(getThread(store, "cloud-only")?.title, "hi");
});
