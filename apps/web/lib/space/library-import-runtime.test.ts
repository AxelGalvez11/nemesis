import assert from "node:assert/strict";
import { test } from "node:test";

import { space } from "../../space/app/runtime.js";
import { createFakeSupabase } from "./fake-backend";

type Runtime = {
  sb: unknown;
  boot(): Promise<void>;
  importJob: Promise<void> | null;
  libraryImport: unknown;
  resetState(): void;
  onImported(fn: (it: { parentId: string; count: number }) => void): () => void;
};
const runtime = space as unknown as Runtime;

/** A fresh tab on the same account: nothing loaded, then the workspace opens and any import runs to its end. */
async function openTab(fake: ReturnType<typeof createFakeSupabase>) {
  runtime.resetState();
  runtime.libraryImport = null;
  runtime.sb = fake;
  await runtime.boot();
  await (runtime.importJob ?? Promise.resolve());
}

test("🔴 the old Library's notes come across once, under one page, and a reload does not repeat it", async () => {
  const fake = createFakeSupabase();
  fake.seedLibrary([
    { id: "note-1", title: "Torts", content: "# Duty of care\n\nThe standard is the reasonable person." },
    { id: "note-2", title: "Evidence", content: "- Hearsay\n- Relevance" },
  ]);
  await openTab(fake);

  const pages = [...fake.server.recs.values()].filter((r) => r.kind === "page");
  const holders = pages.filter((p) => p.props.title === "From your old Library");
  assert.equal(holders.length, 1);
  assert.deepEqual(pages.filter((p) => p.parent_id === holders[0]!.id).map((p) => p.props.title).sort(), ["Evidence", "Torts"]);
  const torts = pages.find((p) => p.props.title === "Torts")!;
  const heading = [...fake.server.recs.values()].find((r) => r.kind === "block" && r.page_id === torts.id && r.type === "header");
  assert.deepEqual(heading?.props.title, [["Duty of care"]], "the note's content arrived as blocks");
  const saved = (await fake.rpc("ws_bootstrap", {})).data as { settings: { libraryImport?: { done?: boolean; count?: number } } };
  assert.deepEqual([saved.settings.libraryImport?.done, saved.settings.libraryImport?.count], [true, 2]);

  await openTab(fake);
  const again = [...fake.server.recs.values()].filter((r) => r.kind === "page" && r.props.title === "From your old Library");
  assert.equal(again.length, 1, "a reload brings nothing twice");
});

test("🔴 an import cut short finishes on the next load, with nothing made twice and nothing saved written over", async () => {
  const fake = createFakeSupabase();
  fake.seedLibrary([
    { id: "note-1", title: "Torts", content: "# Duty of care\n\n- Breach\n  - Foreseeable harm\n- Causation" },
    { id: "note-2", title: "Evidence", content: "Hearsay\n\nRelevance" },
    { id: "note-3", title: "Contracts", content: "Offer and acceptance" },
  ]);
  const toasts: number[] = [];
  const stop = runtime.onImported(({ count }) => toasts.push(count));
  const recs = () => [...fake.server.recs.values()];
  const page = (title: string) => recs().find((r) => r.kind === "page" && r.props.title === title)!;
  await openTab(fake);
  const whole = recs().map((r) => r.id).sort();

  // What a tab closed halfway leaves: Evidence never arrived, Torts is missing its nested item, and settings never
  // recorded the end. Since then the person renamed Torts.
  const evidence = page("Evidence");
  for (const r of recs()) if (r.id === evidence.id || r.page_id === evidence.id || r.props.pageId === evidence.id) fake.server.recs.delete(r.id);
  const torts = page("Torts");
  const nested = recs().find((r) => r.kind === "block" && r.page_id === torts.id && r.parent_id !== torts.id)!;
  fake.server.recs.delete(nested.id);
  torts.props.title = "Torts, revised";
  await fake.rpc("ws_save_settings", { p_patch: { libraryImport: null } });

  await openTab(fake);
  assert.deepEqual(recs().map((r) => r.id).sort(), whole, "exactly the records of one whole import");
  assert.equal(fake.server.recs.get(torts.id)!.props.title, "Torts, revised", "what was saved stays as it was");
  const settings = (await fake.rpc("ws_bootstrap", {})).data as { settings: { libraryImport?: { done?: boolean } } };
  assert.equal(settings.settings.libraryImport?.done, true);

  // A tab that opened before another finished finds everything there and adds nothing.
  await fake.rpc("ws_save_settings", { p_patch: { libraryImport: null } });
  await openTab(fake);
  assert.deepEqual(recs().map((r) => r.id).sort(), whole);
  assert.deepEqual(toasts, [3, 3], "a toast for each run that added pages, none for the run that found them all");
  stop();
});
