import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { FakeServer } from "./fake-backend";
import { normalizeState, type CopyState } from "./records";
import { SpaceSync, type ServerRecord } from "./sync-engine";

function browser(server: FakeServer, name: string) {
  const S: CopyState = { pages: {}, blocks: {}, collections: {}, views: {}, rows: {} };
  const denied: string[] = [];
  const sync = new SpaceSync({
    transport: server,
    state: () => S,
    changed: () => {},
    client: name,
    space: () => "space-1",
    delayMs: 0,
    timers: { set: () => null, clear: () => {} },
    personName: (id) => (id ? `Person ${id}` : undefined),
    onDenied: (ids) => denied.push(...ids),
  });
  return { S, sync, denied };
}

const view = (S: CopyState) => Object.fromEntries([...normalizeState(S)].sort(([x], [y]) => (x < y ? -1 : 1)));

async function sharedPage() {
  const server = new FakeServer();
  const a = browser(server, "A");
  const b = browser(server, "B");
  const P = randomUUID();
  const B1 = randomUUID();
  const B2 = randomUUID();
  a.S.pages[P] = { id: P, kind: "page", parent: null, title: "Plan", icon: null, content: [B1, B2] };
  a.S.blocks[B1] = { id: B1, type: "text", parent: P, title: [["hello"]], children: [] };
  a.S.blocks[B2] = { id: B2, type: "to_do", parent: P, title: [["task"]], checked: false, children: [] };
  await a.sync.flush();
  server.outbox = [];
  b.sync.ingest(server.load(P));
  return { server, a, b, P, B1, B2 };
}

test("a page made in one browser opens the same in another, with nothing left to send", async () => {
  const { a, b } = await sharedPage();
  assert.deepEqual(view(b.S), view(a.S));
  assert.equal(a.sync.dirty(), false);
  assert.equal(b.sync.dirty(), false);
});

test("two people typing in one block keep both edits when the broadcast arrives first", async () => {
  const { server, a, b, B1 } = await sharedPage();
  a.S.blocks[B1]!.title = [["hello A"]];
  b.S.blocks[B1]!.title = [["hello B"]];
  await a.sync.flush();
  server.deliver([a.sync, b.sync]);
  assert.deepEqual(b.S.blocks[B1]!.title, [["hello B A"]], "B's unsent words were kept and A's were added");
  await b.sync.flush();
  server.deliver([a.sync, b.sync]);
  for (const S of [a.S, b.S]) assert.deepEqual(S.blocks[B1]!.title, [["hello B A"]]);
  assert.deepEqual(server.recs.get(B1)!.props.title, [["hello B A"]]);
});

test("two people typing in one block keep both edits when the server reports the conflict", async () => {
  const { server, a, b, B1 } = await sharedPage();
  a.S.blocks[B1]!.title = [["hello A"]];
  b.S.blocks[B1]!.title = [["hello B"]];
  await a.sync.flush();
  await b.sync.flush();
  server.deliver([a.sync, b.sync]);
  for (const S of [a.S, b.S]) assert.deepEqual(S.blocks[B1]!.title, [["hello B A"]]);
  assert.deepEqual(server.recs.get(B1)!.props.title, [["hello B A"]]);
  assert.equal(b.sync.dirty(), false);
});

test("a block added by one person and a block deleted by another both land", async () => {
  const { server, a, b, P, B1, B2 } = await sharedPage();
  const B3 = randomUUID();
  a.S.blocks[B3] = { id: B3, type: "text", parent: P, title: [["third"]], children: [] };
  (a.S.pages[P]!.content as string[]).splice(1, 0, B3);
  delete b.S.blocks[B2];
  b.S.pages[P]!.content = (b.S.pages[P]!.content as string[]).filter((x) => x !== B2);
  await a.sync.flush();
  await b.sync.flush();
  server.deliver([a.sync, b.sync]);
  for (const S of [a.S, b.S]) {
    assert.deepEqual(S.pages[P]!.content, [B1, B3]);
    assert.equal(S.blocks[B2], undefined);
    assert.ok(S.blocks[B3]);
  }
  assert.deepEqual(view(a.S), view(b.S));
  assert.deepEqual(server.recs.get(P)!.props.content, [B1, B3]);
});

test("different fields of one block never conflict", async () => {
  const { server, a, b, B2 } = await sharedPage();
  a.S.blocks[B2]!.title = [["task, renamed"]];
  b.S.blocks[B2]!.checked = true;
  await a.sync.flush();
  await b.sync.flush();
  server.deliver([a.sync, b.sync]);
  for (const S of [a.S, b.S]) {
    assert.deepEqual(S.blocks[B2]!.title, [["task, renamed"]]);
    assert.equal(S.blocks[B2]!.checked, true);
  }
});

test("an edit made offline waits and then saves", async () => {
  const { server, a, P } = await sharedPage();
  server.failNext = 1;
  a.S.pages[P]!.title = "Plan v2";
  await a.sync.flush();
  assert.equal(a.sync.status, "offline");
  assert.equal(server.recs.get(P)!.props.title, "Plan");
  assert.equal(a.S.pages[P]!.title, "Plan v2", "the edit stays on screen while offline");
  await a.sync.flush();
  assert.equal(a.sync.status, "saved");
  assert.equal(server.recs.get(P)!.props.title, "Plan v2");
});

/**
 * 🔴 THE RESURRECTION BUG THIS ENGINE WOULD HAVE WITHOUT `forget`. Anything left in S with no base looks new, so an
 * open copy of a page someone deleted would recreate it, block by block, on its next save.
 */
test("a page deleted by someone else does not come back from a copy that was open", async () => {
  const { server, a, b, P, B1, B2 } = await sharedPage();
  b.S.blocks[B1]!.title = [["typing while it goes"]];
  delete a.S.pages[P];
  delete a.S.blocks[B1];
  delete a.S.blocks[B2];
  await a.sync.flush();
  server.deliver([a.sync, b.sync]);
  assert.equal(b.S.pages[P], undefined);
  assert.equal(b.S.blocks[B1], undefined);
  assert.equal(b.S.blocks[B2], undefined);
  await b.sync.flush();
  assert.equal(server.recs.size, 0);
});

test("a block added where this person may not edit is taken back and reported", async () => {
  const { server, b, P } = await sharedPage();
  server.denyPages.add(P);
  const B4 = randomUUID();
  b.S.blocks[B4] = { id: B4, type: "text", parent: P, title: [["not allowed"]], children: [] };
  (b.S.pages[P]!.content as string[]).push(B4);
  await b.sync.flush();
  assert.equal(b.S.blocks[B4], undefined);
  assert.equal((b.S.pages[P]!.content as string[]).includes(B4), false);
  assert.deepEqual(b.denied.sort(), [B4, P].sort());
  assert.equal(b.sync.dirty(), false);
});

test("a sidebar summary and then the full page never send anything back", async () => {
  const { server, a, P } = await sharedPage();
  const c = browser(server, "C");
  c.sync.ingest([server.summary(server.recs.get(P)!) as ServerRecord]);
  assert.equal(c.S.pages[P]!.title, "Plan");
  assert.equal(c.sync.dirty(), false);
  c.sync.ingest(server.load(P));
  assert.equal(c.sync.dirty(), false);
  assert.deepEqual(view(c.S), view(a.S));
});

test("remote changes land in the object the editor is holding", async () => {
  const { server, a, b, B1 } = await sharedPage();
  const held = b.S.blocks[B1]!;
  a.S.blocks[B1]!.title = [["changed"]];
  await a.sync.flush();
  server.deliver([a.sync, b.sync]);
  assert.equal(b.S.blocks[B1], held);
  assert.deepEqual(held.title, [["changed"]]);
});

test("two people adding different columns to one database keep both columns", async () => {
  const server = new FakeServer();
  const a = browser(server, "A");
  const b = browser(server, "B");
  const P = randomUUID();
  const C = randomUUID();
  const V = randomUUID();
  const R1 = randomUUID();
  const R2 = randomUUID();
  a.S.pages[P] = { id: P, kind: "database", parent: null, title: "Reading list", collection: C, views: [V], content: [] };
  a.S.collections[C] = { id: C, schema: { title: { name: "Name", type: "title" } } };
  a.S.views[V] = { id: V, type: "table", name: "Table", format: { table_properties: [] } };
  a.S.rows[C] = [{ id: R1, title: "Chapter 1" }];
  await a.sync.flush();
  server.outbox = [];
  b.sync.ingest(server.load(P));
  assert.deepEqual(view(b.S), view(a.S));

  (a.S.collections[C]!.schema as Record<string, unknown>).Due = { name: "Due", type: "date" };
  (b.S.collections[C]!.schema as Record<string, unknown>).Pages = { name: "Pages", type: "number" };
  a.S.rows[C]![0]!.title = "Chapter 1: Origins";
  b.S.rows[C]!.push({ id: R2, title: "Chapter 2" });
  await a.sync.flush();
  await b.sync.flush();
  server.deliver([a.sync, b.sync]);
  for (const S of [a.S, b.S]) {
    assert.deepEqual(Object.keys(S.collections[C]!.schema as object).sort(), ["Due", "Pages", "title"]);
    assert.deepEqual(S.rows[C]!.map((r) => r.title), ["Chapter 1: Origins", "Chapter 2"]);
  }
  assert.deepEqual(view(a.S), view(b.S));
});

test("a comment carries its author's name across, and resolving it moves it for everyone", async () => {
  const { server, a, b, B1 } = await sharedPage();
  const CM = randomUUID();
  b.S.blocks[B1]!.comments = [{ id: CM, text: "Is this right?" }];
  await b.sync.flush();
  server.deliver([a.sync, b.sync]);
  const got = (a.S.blocks[B1]!.comments as Array<Record<string, unknown>>)[0]!;
  assert.equal(got.text, "Is this right?");
  assert.equal(got.author, "Person B");
  a.S.blocks[B1]!.resolvedComments = a.S.blocks[B1]!.comments;
  a.S.blocks[B1]!.comments = [];
  await a.sync.flush();
  server.deliver([a.sync, b.sync]);
  assert.deepEqual((b.S.blocks[B1]!.comments as unknown[]).length, 0);
  assert.equal((b.S.blocks[B1]!.resolvedComments as Array<Record<string, unknown>>)[0]!.id, CM);
});

test("trash and restore travel as their own operations", async () => {
  const { server, a, b, P } = await sharedPage();
  a.S.pages[P]!.trashed = Date.now();
  await a.sync.flush();
  assert.equal(server.recs.get(P)!.alive, false);
  server.deliver([a.sync, b.sync]);
  assert.ok(b.S.pages[P]!.trashed, "the other browser sees it in the Trash");
  delete b.S.pages[P]!.trashed;
  await b.sync.flush();
  server.deliver([a.sync, b.sync]);
  assert.equal(server.recs.get(P)!.alive, true);
  assert.equal(a.S.pages[P]!.trashed, undefined);
});

test("🔴 a page restored from the Trash list after a reload comes back whole", async () => {
  const { server, a, P, B1, B2 } = await sharedPage();
  a.S.pages[P]!.trashed = Date.now();
  await a.sync.flush();
  server.outbox = [];
  // A fresh load that only opened the Trash list: ws_trash returns page summaries, never the page's blocks.
  const c = browser(server, "C");
  c.sync.ingest([...server.recs.values()].filter((r) => r.kind === "page" && !r.alive).map((r) => server.summary(r)));
  assert.ok(c.S.pages[P]!.trashed, "the Trash list shows it");
  delete c.S.pages[P]!.trashed;
  await c.sync.flush();
  assert.equal(server.recs.get(P)!.alive, true);
  assert.deepEqual(server.recs.get(P)!.props.content, [B1, B2], "restoring from a summary never empties the page");
  assert.ok(server.recs.get(B1) && server.recs.get(B2), "and never removes blocks it did not load");
  assert.equal(c.sync.dirty(), false);
});

/**
 * 🔴 THE DATA-LOSS CASE THE KNOWN-ID FILTER EXISTS FOR. Opening one row as a page brings its database's record (with
 * every row id in `rows`) but only that row. Nothing may be sent for the rows this browser never saw.
 */
test("opening one row of a shared database never touches the other rows", async () => {
  const server = new FakeServer();
  const a = browser(server, "A");
  const P = randomUUID();
  const C = randomUUID();
  const V = randomUUID();
  const rows = [randomUUID(), randomUUID(), randomUUID()];
  a.S.pages[P] = { id: P, kind: "database", parent: null, title: "Assignments", collection: C, views: [V], content: [] };
  a.S.collections[C] = { id: C, schema: { title: { name: "Name", type: "title" } } };
  a.S.views[V] = { id: V, type: "table", name: "Table", format: {} };
  a.S.rows[C] = rows.map((id, i) => ({ id, title: `Essay ${i + 1}` }));
  await a.sync.flush();

  const c = browser(server, "C");
  c.sync.ingest([server.json(server.recs.get(C)!), server.json(server.recs.get(rows[1]!)!)]);
  assert.equal(c.sync.dirty(), false, "a partly loaded database has nothing to send");
  c.S.rows[C]![0]!.title = "Essay 2, final";
  await c.sync.flush();
  assert.deepEqual(server.recs.get(C)!.props.rows, rows, "the database keeps every row, in order");
  assert.equal(server.recs.get(rows[1]!)!.props.title, "Essay 2, final");
});

test("a refusal that retrying cannot fix stops the retries and is reported once", async () => {
  const server = new FakeServer();
  let fatal: unknown = null;
  const S: CopyState = { pages: {}, blocks: {}, collections: {}, views: {}, rows: {} };
  let timers = 0;
  const sync = new SpaceSync({
    transport: { apply: async () => { throw Object.assign(new Error("not a member of this workspace"), { retryable: false }); } },
    state: () => S, changed: () => {}, client: "A", space: () => "space-1",
    timers: { set: () => { timers++; return null; }, clear: () => {} },
    onFatal: (e) => { fatal = e; },
  });
  void server;
  const P = randomUUID();
  S.pages[P] = { id: P, kind: "page", parent: null, title: "x", content: [] };
  await sync.flush();
  assert.equal((fatal as Error).message, "not a member of this workspace");
  assert.equal(timers, 0, "no retry was scheduled");
});

test("a comment for a block this browser never loaded is kept, not deleted", async () => {
  const { server, a, b, B1 } = await sharedPage();
  const CM = randomUUID();
  const c = browser(server, "C");
  // C hears about the comment (say on a page channel) without having the block it belongs to.
  a.S.blocks[B1]!.comments = [{ id: CM, text: "keep me" }];
  await a.sync.flush();
  const tx = server.outbox.pop()!;
  c.sync.receive(tx);
  await c.sync.flush();
  assert.ok(server.recs.has(CM), "the comment survives a browser that could not draw it");
  void b;
});

test("a sidebar summary moves a page even without the tx move flag", async () => {
  const { server, a, b, P } = await sharedPage();
  const Q = randomUUID();
  a.S.pages[Q] = { id: Q, kind: "page", parent: null, title: "Inbox", content: [] };
  await a.sync.flush();
  server.deliver([a.sync, b.sync]);
  b.sync.ingest([server.summary(server.recs.get(Q)!) as ServerRecord]);
  a.S.pages[Q]!.parent = P;
  await a.sync.flush();
  const moved = server.summary(server.recs.get(Q)!);
  b.sync.receive({ client: "A", items: [{ ...moved, set: {} }] });
  assert.equal(b.S.pages[Q]!.parent, P);
});
