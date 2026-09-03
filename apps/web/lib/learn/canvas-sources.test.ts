import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { CanvasSource } from "./canvas-model";
import { refreshedCoverageNotes, restoredFileNames } from "./canvas-sources";

// ── The coverage disclosure stops lying once a document is read more fully ────────────────────

const src = (over: Partial<CanvasSource> = {}): CanvasSource =>
  ({ excerpts: [], id: "s1", kind: "pdf", librarySourceId: "lib-1", title: "Lecture", ...over }) as CanvasSource;

test("🔴🔴 a note that is no longer true is REMOVED, not left standing", () => {
  // 🔴 THE WHOLE POINT. `coverageNote` is computed once when a file is attached, and coverage now
  // improves in the background minutes later (the automatic figure pass). Without this, a canvas
  // keeps telling the learner "8 pictures were not read" about a document whose pictures now have
  // descriptions — the data got better and the words on screen did not, which is this project's
  // definition of degraded-not-complete.
  // 🔴 RE-ARGUED 2026-09-03: the loader answers for the whole canvas at once now (one `.in()`
  // query, the shape `restoredFileNames` has). A row whose coverage is null is a document that
  // withheld nothing, which is what `async () => null` used to stand for.
  return refreshedCoverageNotes([src({ coverageNote: "8 pictures were not read." })], async () => new Map([["lib-1", null]])).then((next) => {
    assert.equal(next[0]?.coverageNote, undefined, "the stale sentence survived a clean re-read");
  });
});

test("🔴 an unchanged note returns the SAME array, so the common case writes nothing", () => {
  // A canvas save on every load would be write amplification on the one path every session takes.
  const sources = [src()];
  return refreshedCoverageNotes(sources, async () => new Map([["lib-1", null]])).then((next) => {
    assert.equal(next, sources, "a no-op refresh is still producing a new array, and a write with it");
  });
});

test("🔴 a source with no library row is left exactly as it is", () => {
  // Pasted text and model knowledge have no parsed document behind them. "No row" means "nothing to
  // refresh here", never "this source lost its coverage".
  const sources = [src({ coverageNote: "kept", librarySourceId: undefined })];
  return refreshedCoverageNotes(sources, async () => { throw new Error("must not be asked"); }).then((next) => {
    assert.equal(next, sources);
    assert.equal(next[0]?.coverageNote, "kept");
  });
});

test("🔴🔴 fifty attached documents are one query, not fifty", () => {
  // This was one query per source under an unbounded `Promise.all`, on every canvas load. A browser
  // runs six requests at a time to one host, so the other forty-four queued, and so did everything
  // the session needed after them.
  const sources = Array.from({ length: 50 }, (_, at) => src({ id: `s${at}`, librarySourceId: `lib-${at}` }));
  const asked: (readonly string[])[] = [];
  return refreshedCoverageNotes(sources, async (ids) => {
    asked.push(ids);
    return new Map(ids.map((id) => [id, null]));
  }).then(() => {
    assert.equal(asked.length, 1, `${asked.length} round trips for one canvas`);
    assert.equal(asked[0]?.length, 50, "a source was left out of the one query");
  });
});

test("🔴 a row the Library did not return leaves the disclosure standing", () => {
  // "The Library did not answer" is not "this document is now fully read". Blanking a disclosure on
  // a failed lookup is the silent upgrade from partial to whole this whole area keeps failing
  // towards, so an absent row changes nothing, and the same array comes back.
  const sources = [src({ coverageNote: "8 pictures were not read." })];
  return refreshedCoverageNotes(sources, async () => new Map()).then((next) => {
    assert.equal(next, sources);
    assert.equal(next[0]?.coverageNote, "8 pictures were not read.");
  });
});

test("the batched reader is the ONLY reader of the embed's shape", () => {
  // The one-source reader used to parse `parsed_documents(coverage)` itself; two readers of one
  // embed shape is how a panel and a packet come to disagree about what a document missed.
  const sources = readFileSync(new URL("./canvas-sources.ts", import.meta.url), "utf8");
  assert.match(sources, /return \(await loadStoredCoverages\(\[librarySourceId\]\)\)\.get\(librarySourceId\) \?\? null;/, "the one-source reader grew its own query again");
  assert.match(sources, /\.select\("id,parsed_documents\(coverage\)"\)\s*\.in\("id", \[\.\.\.ids\]\)/, "the coverage read is no longer one `.in()` query");
  assert.ok(!/withIds\.map\(async \(source\) => \{/.test(sources), "the per-source fan-out is back");
});

// ── A source gets its own file name back ──────────────────────────────────────────────────────

const names = (map: Record<string, string>) => async () => new Map(Object.entries(map));

test("🔴🔴 the reported case: a canvas written with a prettified name is corrected on read", () => {
  // Owner, 2026-09-03: *"these are being renamed. Shouldn't they keep their original file names?"*
  // The attach path stopped prettifying, but a canvas holds its OWN copy of every title — measured
  // on production the same day: 81 sources across 28 canvases still say `08 insulin` about a
  // `library_sources` row whose `file_name` is `08-insulin.pdf`.
  return restoredFileNames([src({ title: "08 insulin" })], names({ "lib-1": "08-insulin.pdf" })).then((next) => {
    assert.equal(next[0]?.title, "08-insulin.pdf", "the canvas is still holding the prettified name");
  });
});

test("🔴🔴 a promoted web page keeps its page title, because its file name is one we invented", () => {
  // `attachUrl` files a page as `<page title>.md`. Measured on production: 136 of the 217 stale
  // titles are these, and restoring them would show a learner a `.md` extension no page ever had.
  const sources = [src({ sourceUrl: "https://en.wikipedia.org/wiki/Hydroxy_group", title: "Hydroxy group - Wikipedia" })];
  return restoredFileNames(sources, async () => {
    throw new Error("a promoted page must not even be looked up");
  }).then((next) => {
    assert.equal(next, sources);
    assert.equal(next[0]?.title, "Hydroxy group - Wikipedia");
  });
});

test("🔴 a name that already matches returns the SAME array, so the common case writes nothing", () => {
  const sources = [src({ title: "08-insulin.pdf" })];
  return restoredFileNames(sources, names({ "lib-1": "08-insulin.pdf" })).then((next) => {
    assert.equal(next, sources, "a no-op restore is producing a new array, and a canvas write with it");
  });
});

test("🔴 a missing row changes nothing — 'the Library did not answer' is not 'this has no name'", () => {
  // Blanking a title on a failed lookup would be a far worse bug than the stale one it replaces.
  const sources = [src({ title: "08 insulin" })];
  return restoredFileNames(sources, async () => new Map()).then((next) => {
    assert.equal(next, sources);
    assert.equal(next[0]?.title, "08 insulin");
  });
});

test("🔴 a source that was never filed is left alone and never asked about", () => {
  const sources = [src({ librarySourceId: undefined, title: "pasted notes" })];
  return restoredFileNames(sources, async () => {
    throw new Error("must not be asked");
  }).then((next) => {
    assert.equal(next, sources);
  });
});

test("🔴 the canvas asks ONCE for the whole list, not once per source", () => {
  // Canvas open is already the heaviest path in the product (a 30-source canvas pays a round trip
  // per source for its coverage notes today). This must not add thirty more.
  let calls = 0;
  const sources = [src({ id: "s1", librarySourceId: "lib-1" }), src({ id: "s2", librarySourceId: "lib-2" })];
  return restoredFileNames(sources, async (ids) => {
    calls += 1;
    assert.deepEqual([...ids], ["lib-1", "lib-2"]);
    return new Map([["lib-1", "one.pdf"], ["lib-2", "two.docx"]]);
  }).then((next) => {
    assert.equal(calls, 1, "the restore is querying per source again");
    assert.deepEqual(next.map((source) => source.title), ["one.pdf", "two.docx"]);
  });
});

test("🔴 the canvas load runs BOTH refreshes, or one of the two stale fields survives", () => {
  // Calibration: drop either call and this reddens. They are the same failure about two fields —
  // a canvas holds a copy of what the Library knows, and nothing else ever looks again.
  const session = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8");
  assert.match(session, /restoredFileNames\(await refreshedCoverageNotes\(found\.sources\)\)/, "a canvas load stopped correcting one of its stale source fields");
});
