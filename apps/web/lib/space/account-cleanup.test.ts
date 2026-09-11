import assert from "node:assert/strict";
import { test } from "node:test";

import { listFiles, removeFolders, type StorageBucket } from "./account-cleanup";

/** A bucket over a set of paths that lists one level at a time, the way storage does: folders come back without an id. */
function bucketOf(paths: string[], failOn?: string) {
  const objects = new Set(paths);
  const removals: number[] = [];
  const bucket: StorageBucket = {
    async list(path, { limit, offset }) {
      if (path === failOn) return { data: null, error: new Error("storage is down") };
      const prefix = `${path}/`;
      const names = new Map<string, boolean>();
      for (const p of [...objects].sort()) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const cut = rest.indexOf("/");
        if (cut === -1) names.set(rest, true);
        else names.set(rest.slice(0, cut), names.get(rest.slice(0, cut)) ?? false);
      }
      const entries = [...names].map(([name, file]) => ({ name, id: file ? `id-${name}` : null }));
      return { data: entries.slice(offset, offset + limit), error: null };
    },
    async remove(list) {
      removals.push(list.length);
      for (const p of list) objects.delete(p);
      return { error: null };
    },
  };
  return { bucket, objects, removals };
}

test("🔴 a workspace's folder and a page's folder are emptied, and nothing beside them is touched", async () => {
  const { bucket, objects } = bucketOf(["s1/p1/brief.pdf", "s1/p1/notes.pdf", "s1/p2/slide.png", "s2/p3/mine.pdf", "s2/p9/theirs.pdf"]);
  assert.deepEqual(await listFiles(bucket, "s1/"), ["s1/p1/brief.pdf", "s1/p1/notes.pdf", "s1/p2/slide.png"]);
  assert.equal(await removeFolders(bucket, ["s1/", "s2/p3/"]), 4);
  assert.deepEqual([...objects], ["s2/p9/theirs.pdf"], "a page kept by someone else keeps its file");
});

test("a large folder is listed page by page and removed a thousand files at a time", async () => {
  const many = Array.from({ length: 2500 }, (_, i) => `s1/p1/file-${String(i).padStart(4, "0")}.pdf`);
  const { bucket, objects, removals } = bucketOf(many);
  assert.equal(await removeFolders(bucket, ["s1/p1/"]), 2500);
  assert.deepEqual(removals, [1000, 1000, 500]);
  assert.equal(objects.size, 0);
});

test("a storage error stops the cleanup and is not swallowed", async () => {
  const { bucket, objects } = bucketOf(["s1/p1/a.pdf", "s1/p2/b.pdf"], "s1/p2");
  await assert.rejects(removeFolders(bucket, ["s1/"]), /storage is down/);
  assert.equal(objects.size, 2, "nothing was removed before the whole folder could be listed");
});
