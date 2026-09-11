import assert from "node:assert/strict";
import { test } from "node:test";

import { space } from "../../space/app/runtime.js";
import { createFakeSupabase } from "./fake-backend";

type Runtime = {
  sb: unknown;
  state: { pages: Record<string, unknown>; collections: Record<string, unknown>; views: Record<string, unknown>; rows: Record<string, Array<Record<string, unknown>>>; sidebar: { private: string[] } };
  sync: { saved(): Promise<boolean> };
  boot(): Promise<void>;
  resetState(): void;
  ensurePage(id: string, force?: boolean): Promise<void>;
  watchPage(id: string): void;
  submitForm(viewId: string, answers: Record<string, unknown>): Promise<{ ok: boolean; row: string }>;
};
const runtime = space as unknown as Runtime;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("🔴 a form response becomes a row at the end of its database, keeping only the form's questions", async () => {
  const fake = createFakeSupabase();
  runtime.resetState();
  runtime.sb = fake;
  await runtime.boot();
  const S = runtime.state;
  const [pid, cid, form, table, first] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  S.collections[cid] = {
    id: cid,
    schema: {
      title: { name: "Name", type: "title" },
      st: { name: "Status", type: "status", options: [{ id: "a", value: "Done", color: "green", group: "complete" }] },
      grade: { name: "Grade", type: "text" },
    },
  };
  S.views[form] = { id: form, type: "form", name: "Form", format: { table_properties: [] }, form: { title: "Feedback", description: "", questions: ["title", "st"] } };
  S.views[table] = { id: table, type: "table", name: "Table", format: { table_properties: [{ property: "title", visible: true, width: 280 }] } };
  S.rows[cid] = [{ id: first, title: "Existing response", created: 1 }];
  S.pages[pid] = { id: pid, kind: "database", icon: null, title: "Presentation feedback", content: [], lastEdited: 1, parent: null, section: "private", collection: cid, views: [form, table] };
  S.sidebar.private.unshift(pid);
  assert.equal(await runtime.sync.saved(), true, "the database reached the server");
  await runtime.ensurePage(pid, true);
  // Someone looking at the database: its page channel is open, as it is for any open page.
  runtime.watchPage(pid);

  const res = await runtime.submitForm(form, { title: "Group 4 on contract law", st: "Done", grade: "A+" });
  assert.equal(res.ok, true);
  const row = fake.server.recs.get(res.row);
  assert.deepEqual(row?.props, { title: "Group 4 on contract law", st: "Done" }, "Grade is not one of the form's questions");
  assert.deepEqual(fake.server.recs.get(cid)?.props.rows, [first, res.row], "the response goes at the end");

  await wait(80);
  assert.deepEqual(S.rows[cid]!.map((r) => r.id), [first, res.row], "the open database shows the response without a reload");
  assert.equal(S.rows[cid]![1]!.title, "Group 4 on contract law");
});
