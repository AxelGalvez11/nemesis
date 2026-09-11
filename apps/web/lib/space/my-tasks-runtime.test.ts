import assert from "node:assert/strict";
import { test } from "node:test";

import { space } from "../../space/app/runtime.js";
import { createFakeSupabase } from "./fake-backend";

type Runtime = {
  sb: unknown;
  me: { id: string };
  state: { pages: Record<string, unknown>; collections: Record<string, unknown>; views: Record<string, unknown>; rows: Record<string, unknown[]>; sidebar: { private: string[] } };
  tasks: { items: Array<Record<string, unknown>>; loaded: boolean };
  sync: { saved(): Promise<boolean> };
  boot(): Promise<void>;
  loadTasks(): Promise<void>;
  resetState(): void;
};
const runtime = space as unknown as Runtime;

test("🔴 My Tasks lists the rows this person is assigned to and leaves out the ones that are done", async () => {
  const fake = createFakeSupabase();
  runtime.resetState();
  runtime.sb = fake;
  await runtime.boot();
  const S = runtime.state;
  const me = runtime.me.id;
  const [pid, cid, vid] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  S.collections[cid] = {
    id: cid,
    schema: {
      title: { name: "Name", type: "title" },
      who: { name: "Owner", type: "person" },
      st: { name: "Status", type: "status", options: [{ id: "a", value: "In progress", color: "blue", group: "in_progress" }, { id: "b", value: "Done", color: "green", group: "complete" }] },
      due: { name: "Due", type: "date" },
    },
  };
  S.views[vid] = { id: vid, type: "table", name: "Table", format: { table_properties: [{ property: "title", visible: true, width: 280 }] } };
  S.rows[cid] = [
    { id: crypto.randomUUID(), title: "Contract law essay", who: [me], st: "In progress", due: "2026-09-20", created: 1 },
    { id: crypto.randomUUID(), title: "Evidence reading", who: [me], st: "Done", created: 2 },
    { id: crypto.randomUUID(), title: "Circuits lab", st: "In progress", created: 3 },
  ];
  S.pages[pid] = { id: pid, kind: "database", icon: null, title: "Coursework", content: [], lastEdited: 1, parent: null, section: "private", collection: cid, views: [vid] };
  S.sidebar.private.unshift(pid);
  assert.equal(await runtime.sync.saved(), true, "the database reached the server");

  await runtime.loadTasks();
  assert.equal(runtime.tasks.loaded, true);
  assert.deepEqual(
    runtime.tasks.items.map((t) => [t.title, t.database, t.status, t.status_color, t.due, t.page_id]),
    [["Contract law essay", "Coursework", "In progress", "blue", "2026-09-20", pid]],
    "the done row and the row assigned to nobody are left out",
  );
});
