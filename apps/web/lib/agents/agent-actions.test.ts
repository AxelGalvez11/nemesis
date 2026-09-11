import assert from "node:assert/strict";
import { test } from "node:test";

import { addFlashcards, addPracticeTest, AGENT_CARD_TAG, createPage, readPage, type AgentDb } from "./agent-actions";

type Row = Record<string, unknown>;

/** Just enough of a Supabase client: three plain tables, and the workspace calls recorded. */
function fakeDb(loadPage: unknown = null) {
  const tables: Record<string, Row[]> = { study_decks: [], study_cards: [], study_artifacts: [] };
  const calls: Array<{ name: string; args: Row }> = [];
  const db = {
    from(table: string) {
      let inserted: Row[] | null = null;
      const query: Row = {};
      const chain = () => query;
      query.select = chain;
      query.order = chain;
      query.limit = chain;
      query.insert = (row: Row | Row[]) => {
        inserted = (Array.isArray(row) ? row : [row]).map((r) => ({ id: crypto.randomUUID(), ...r }));
        tables[table]!.push(...inserted);
        return query;
      };
      query.single = async () => ({ data: inserted ? inserted[0] : null, error: null });
      query.then = (resolve: (value: unknown) => void) => resolve({ data: inserted ?? tables[table], error: null });
      return query;
    },
    async rpc(name: string, args: Row) {
      calls.push({ name, args });
      if (name === "ws_bootstrap") return { data: { space: { id: "space-1" }, roots: [{ id: "p1", props: { title: "Lecture notes" } }], recents: [] }, error: null };
      if (name === "ws_apply") return { data: { results: [], denied: [] }, error: null };
      if (name === "ws_load_page") return { data: loadPage, error: null };
      return { data: null, error: { message: "unknown" } };
    },
  };
  return { db: db as unknown as AgentDb, tables, calls };
}

test("🔴 flashcards go into the deck with that name, made when there is none, as the person's own cards marked as made by AI", async () => {
  const { db, tables } = fakeDb();
  const first = await addFlashcards(db, "user-1", { deck: "Contract law", cards: [{ front: "What makes an offer?", back: "A definite promise the other side can accept." }, { front: "  ", back: "no front" }] });
  assert.deepEqual(first, { deck: "Contract law", created_deck: true, added: 1 });
  assert.equal(tables.study_decks!.length, 1);
  assert.equal(tables.study_decks![0]!.user_id, "user-1");
  assert.deepEqual(
    { user: tables.study_cards![0]!.user_id, deck: tables.study_cards![0]!.deck_id, type: tables.study_cards![0]!.card_type, tags: tables.study_cards![0]!.tags },
    { user: "user-1", deck: tables.study_decks![0]!.id, type: "basic", tags: [AGENT_CARD_TAG] },
  );

  const second = await addFlashcards(db, "user-1", { deck: "contract LAW", cards: [{ front: "Acceptance?", back: "Agreeing to the offer's terms." }] });
  assert.deepEqual(second, { deck: "Contract law", created_deck: false, added: 1 }, "a deck is found by name whatever the capitals");
  assert.equal(tables.study_decks!.length, 1);
  await assert.rejects(addFlashcards(db, "user-1", { deck: "Contract law", cards: [{ front: "", back: "" }] }), /front and a back/);
});

test("a practice test keeps the questions Study can use and says how many it dropped", async () => {
  const { db, tables } = fakeDb();
  const saved = await addPracticeTest(db, "user-1", {
    title: "Load paths in bridges",
    questions: [
      { question: "Which member carries tension in a suspension bridge?", options: ["The deck", "The main cable", "The tower"], answer: 1, explanation: "The cable hangs in tension." },
      { question: "Name the force that squeezes the towers.", answer: "Compression", also_accept: ["compressive force"] },
      { question: "A broken one", options: ["Only one option"], answer: 0 },
    ],
  });
  assert.deepEqual(saved, { title: "Load paths in bridges", questions: 2, dropped: 1 });
  const artifact = tables.study_artifacts![0]!;
  assert.deepEqual({ user: artifact.user_id, kind: artifact.kind, status: artifact.status }, { user: "user-1", kind: "test", status: "ready" });
  assert.equal((artifact.content as { questions: unknown[]; attempts: unknown[] }).questions.length, 2);
  await assert.rejects(addPracticeTest(db, "user-1", { title: "Empty", questions: [{ question: "?", options: ["a"], answer: 3 }] }), /None of the questions could be used/);
});

test("🔴 a page from Markdown lands in the person's Private section in one write, parents before children", async () => {
  const { db, calls } = fakeDb();
  const made = await createPage(db, { title: "Study guide", markdown: "# Big ideas\n\n- First\n- Second\n\nA closing paragraph." });
  assert.deepEqual(calls.map((c) => c.name), ["ws_bootstrap", "ws_apply"]);
  const { p_space, p_ops } = calls[1]!.args as { p_space: string; p_ops: Array<Row & { id: string; parent_id: string | null }> };
  assert.equal(p_space, "space-1");
  assert.deepEqual({ kind: p_ops[0]!.kind, section: p_ops[0]!.section, parent: p_ops[0]!.parent_id, id: p_ops[0]!.id }, { kind: "page", section: "private", parent: null, id: made.id });
  assert.equal((p_ops[0]!.props as Row).title, "Study guide");
  const earlier = new Set<string>();
  for (const op of p_ops) {
    if (op.parent_id) assert.ok(earlier.has(op.parent_id), "every block's parent is written before it");
    earlier.add(op.id);
  }
  assert.ok(p_ops.length >= 4, "the heading, both list items and the paragraph are blocks");
});

test("a page reads back as text in reading order, with its headings and lists marked", async () => {
  const { db } = fakeDb({
    page: { id: "p1", kind: "page", props: { title: "Photosynthesis", content: ["b1", "b2"] } },
    records: [
      { id: "b1", kind: "block", type: "sub_header", props: { title: [["Inputs"]], children: [] } },
      { id: "b2", kind: "block", type: "bulleted_list", props: { title: [["Light and water"]], children: ["b3"] } },
      { id: "b3", kind: "block", type: "text", props: { title: [["Carbon dioxide too"]] } },
    ],
  });
  assert.deepEqual(await readPage(db, "p1"), { id: "p1", title: "Photosynthesis", text: "## Inputs\n- Light and water\n  Carbon dioxide too" });
  const { db: missing } = fakeDb({ error: "not_found" });
  await assert.rejects(readPage(missing, "nope"), /could not be opened/);
});
