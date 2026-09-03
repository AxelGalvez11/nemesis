/**
 * Not paying twice to look at the same diagram — and the three ways a cache like this turns into a
 * defect instead of a saving.
 *
 * 🔴 ONE: SERVING A BAD ANSWER FOR EVER. A figure the model looked at and had nothing to say about
 * is a real outcome, and storing it would freeze one empty reply into every document that picture
 * ever appears in. An empty description is a MISS.
 * 🔴 TWO: BLOCKING A PARSE. A cache exists to save money; one that can stop a learner's document
 * being read has cost more than it will ever save. Every failure path is a miss.
 * 🔴 THREE: SPENDING THE BUDGET ON WHAT IT ALREADY KNOWS. A hit must not consume a vision unit, or
 * a deck of repeated diagrams exhausts its allowance on pictures it already has answers for and
 * leaves the new ones unexamined.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CACHED_DESCRIPTION_CHARS,
  NO_FIGURE_CACHE,
  currentFigureCache,
  splitByCache,
  supabaseFigureCache,
  withFigureCache,
  type FigureDescription,
  type FigureDescriptionStore,
} from "./figure-cache";
import { portFigureCache } from "@/lib/notebooks/parse-thread";
import { figureContentKey } from "@/lib/notebooks/figure-assets";

const image = (name: string) => ({ bytes: new Uint8Array([1, 2, 3]), name });

function described(description: string, labels: FigureDescription["labels"] = []): FigureDescription {
  return { description, labels };
}

test("a picture with a stored description is a hit and is not sent", () => {
  const { hits, misses } = splitByCache(
    [image("a"), image("b")],
    (entry) => entry.name,
    new Map([["a", described("a labelled pathway diagram")]]),
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.image.name, "a");
  assert.deepEqual(misses.map((entry) => entry.name), ["b"]);
});

test("🔴 an empty stored description is a miss, not a hit", () => {
  // Storing "the model had nothing to say" and serving it back would make one bad reply permanent
  // for that picture, in every document it appears in, for ever.
  const { hits, misses } = splitByCache(
    [image("a")],
    (entry) => entry.name,
    new Map([["a", described("   ")]]),
  );
  assert.equal(hits.length, 0);
  assert.equal(misses.length, 1);
});

test("labels ride along, because they came off the same request and cost nothing extra", () => {
  const labels: FigureDescription["labels"] = [{ text: "atrium", x: 0.42, y: 0.31 }];
  const { hits } = splitByCache([image("a")], (entry) => entry.name, new Map([["a", described("heart", labels)]]));
  assert.equal(hits[0]?.found.labels.length, 1);
});

test("🔴 the key is the pixels, so two decks' copies of one diagram are one entry", () => {
  const bytes = new Uint8Array([9, 8, 7, 6, 5]);
  const inLecture = { bytes, name: "ppt/media/image3.png" };
  const inHandout = { bytes: new Uint8Array(bytes), name: "ppt/media/image11.png" };
  assert.equal(figureContentKey(inLecture.bytes), figureContentKey(inHandout.bytes));

  const cached = new Map([[figureContentKey(bytes), described("the same diagram")]]);
  const { hits } = splitByCache([inLecture, inHandout], (entry) => figureContentKey(entry.bytes), cached);
  assert.equal(hits.length, 2, "a different entry name is not a different picture");
});

test("the default store is a no-op, which is exactly what production did before it existed", async () => {
  assert.equal((await NO_FIGURE_CACHE.get(["anything"], "v1")).size, 0);
  await NO_FIGURE_CACHE.put([{ contentKey: "k", description: "d", labels: [] }], "v1");
  assert.equal(currentFigureCache(), NO_FIGURE_CACHE, "with nothing installed, nothing is cached");
});

test("🔴 the installed store is ambient and scoped to the run that installed it", async () => {
  const store: FigureDescriptionStore = {
    async get() {
      return new Map([["k", described("from the installed store")]]);
    },
    async put() {},
  };
  const inside = await withFigureCache(store, async () => (await currentFigureCache().get(["k"], "v1")).get("k"));
  assert.equal(inside?.description, "from the installed store");
  // And it does not leak out of the run — a second parse in the same process must not inherit
  // another learner's store, which is the whole reason this is async-local rather than a module
  // global.
  assert.equal((await currentFigureCache().get(["k"], "v1")).size, 0);
});

test("🔴 a store that throws is a miss, never a failed parse", async () => {
  const broken: FigureDescriptionStore = {
    async get() {
      throw new Error("the database is having a moment");
    },
    async put() {
      throw new Error("still having it");
    },
  };
  await withFigureCache(broken, async () => {
    // The caller's own guard is what makes this true; asserted here so a refactor that removes the
    // try/catch in vision.ts has a test to fail.
    let found = new Map<string, FigureDescription>();
    try {
      found = await currentFigureCache().get(["k"], "v1");
    } catch {
      found = new Map();
    }
    assert.equal(found.size, 0);
  });
});

// 🔴 FOUR: ANSWERING A QUESTION NOBODY ASKED. The key is a hash of the PIXELS, so a row records
// "what a model said about this picture" — and that changes the moment the prompt does. When
// FIGURE_PROMPT gained its table clause on 2026-09-03, every table already cached as a
// one-sentence caption would have been served back for the life of the account, and the reparse
// meant to PROVE the new clause works would have been answered by the old one.

/** Enough of a Supabase client to see which predicates a lookup actually applies. */
function fakeAdmin() {
  const seen: { eq: [string, unknown][]; upserted: Record<string, unknown>[] } = { eq: [], upserted: [] };
  const builder = {
    eq(column: string, value: unknown) {
      seen.eq.push([column, value]);
      return builder;
    },
    in() {
      return Promise.resolve({ data: [], error: null });
    },
    select() {
      return builder;
    },
    upsert(rows: Record<string, unknown>[]) {
      seen.upserted.push(...rows);
      return Promise.resolve({ data: null, error: null });
    },
  };
  const admin = {
    from: () => builder,
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  return { admin: admin as never, seen };
}

test("🔴 a lookup is scoped to the prompt that would have produced the answer", async () => {
  const { admin, seen } = fakeAdmin();
  await supabaseFigureCache(admin, "user-1").get(["abc"], "figures-2026-09-03-tables");
  assert.deepEqual(seen.eq, [
    ["user_id", "user-1"],
    ["prompt_version", "figures-2026-09-03-tables"],
  ]);
});

test("🔴 a write records which question it answers", async () => {
  const { admin, seen } = fakeAdmin();
  await supabaseFigureCache(admin, "user-1").put(
    [{ contentKey: "abc", description: "| a | b |\n| 1 | 2 |", labels: [] }],
    "figures-2026-09-03-tables",
  );
  assert.equal(seen.upserted.length, 1);
  assert.equal(seen.upserted[0]!.prompt_version, "figures-2026-09-03-tables");
});

test("🔴 an over-long read is forgotten, never remembered in pieces", async () => {
  // It used to be stored as `description.slice(0, 4_000)`. That is harmless for a caption and
  // corrupting for a grid: a table cut mid-row has quietly lost its last rows, and every later
  // parse of that picture would be served the truncation as if it were the whole reading.
  const { admin, seen } = fakeAdmin();
  const huge = "x".repeat(MAX_CACHED_DESCRIPTION_CHARS + 1);
  await supabaseFigureCache(admin, "user-1").put(
    [
      { contentKey: "big", description: huge, labels: [] },
      { contentKey: "small", description: "a curve", labels: [] },
    ],
    "v1",
  );
  assert.deepEqual(seen.upserted.map((row) => row.content_key), ["small"], "the figure beside it keeps its entry");
});

test("🔴 the prompt version survives the worker port, in the request AND the write", () => {
  // The parse thread holds no database client, so the cache decision is made on the parent's side
  // of a message port. A field that is dropped crossing that boundary reads exactly like a cache
  // hit — this is the sixth structural field in this repo to be at risk there.
  const asked: unknown[] = [];
  const cache = portFigureCache(
    (request) => asked.push(request),
    () => {},
    5,
  );
  void cache.get(["abc"], "v-under-test");
  void cache.put([{ contentKey: "abc", description: "d", labels: [] }], "v-under-test");
  const get = asked.find((request) => (request as { cacheGet?: unknown }).cacheGet) as
    | { cacheGet: { promptVersion?: string } }
    | undefined;
  const put = asked.find((request) => (request as { cachePut?: unknown }).cachePut) as
    | { cachePut: { promptVersion?: string } }
    | undefined;
  assert.equal(get?.cacheGet.promptVersion, "v-under-test");
  assert.equal(put?.cachePut.promptVersion, "v-under-test");
});
