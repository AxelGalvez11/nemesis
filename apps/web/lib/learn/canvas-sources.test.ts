import assert from "node:assert/strict";
import { test } from "node:test";

import type { CanvasSource } from "./canvas-model";
import { refreshedCoverageNotes } from "./canvas-sources";

// ── The coverage disclosure stops lying once a document is read more fully ────────────────────

const src = (over: Partial<CanvasSource> = {}): CanvasSource =>
  ({ excerpts: [], id: "s1", kind: "pdf", librarySourceId: "lib-1", title: "Lecture", ...over }) as CanvasSource;

test("🔴🔴 a note that is no longer true is REMOVED, not left standing", () => {
  // 🔴 THE WHOLE POINT. `coverageNote` is computed once when a file is attached, and coverage now
  // improves in the background minutes later (the automatic figure pass). Without this, a canvas
  // keeps telling the learner "8 pictures were not read" about a document whose pictures now have
  // descriptions — the data got better and the words on screen did not, which is this project's
  // definition of degraded-not-complete.
  return refreshedCoverageNotes([src({ coverageNote: "8 pictures were not read." })], async () => null).then((next) => {
    assert.equal(next[0]?.coverageNote, undefined, "the stale sentence survived a clean re-read");
  });
});

test("🔴 an unchanged note returns the SAME array, so the common case writes nothing", () => {
  // A canvas save on every load would be write amplification on the one path every session takes.
  const sources = [src()];
  return refreshedCoverageNotes(sources, async () => null).then((next) => {
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
