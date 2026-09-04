import assert from "node:assert/strict";
import test from "node:test";

import {
  addDocumentComment,
  commentsContextBlock,
  deleteDocumentComment,
  describeCommentSpot,
  listDocumentComments,
  openCommentsForDocs,
  resetPreviewComments,
  setCommentResolved,
  type DocumentComment,
} from "./document-comments";

// The preview lane IS the unit under test here: it is what the dev harness and the signed-out
// reader run on, and it must behave exactly like the real store — same shapes, same ordering,
// same open/resolved semantics — or the one place the design is reviewed reviews a different
// feature.

const DOC = { kind: "source" as const, id: "fixture-doc" };

test("a comment round-trips: add, list, resolve, reopen, delete", async () => {
  resetPreviewComments();
  const made = await addDocumentComment(null, DOC, { unit: 3, anchor: { x: 0.5, y: 0.25 }, body: "too wordy" });
  assert.ok(made);
  assert.equal(made.unit, 3);
  assert.equal(made.resolvedAt, null);

  let list = await listDocumentComments(null, DOC);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.body, "too wordy");

  assert.ok(await setCommentResolved(null, DOC, made.id, true));
  list = await listDocumentComments(null, DOC);
  // 🔴 RESOLVING IS A STATE, NOT A DELETION — the row stays listable so the learner can reopen.
  assert.equal(list.length, 1);
  assert.notEqual(list[0]?.resolvedAt, null);

  assert.ok(await setCommentResolved(null, DOC, made.id, false));
  list = await listDocumentComments(null, DOC);
  assert.equal(list[0]?.resolvedAt, null);

  assert.ok(await deleteDocumentComment(null, DOC, made.id));
  assert.equal((await listDocumentComments(null, DOC)).length, 0);
});

test("🔴 a blank note is refused, because an empty pin is furniture", async () => {
  resetPreviewComments();
  assert.equal(await addDocumentComment(null, DOC, { unit: 1, anchor: { x: 0.1, y: 0.1 }, body: "   " }), null);
  assert.equal((await listDocumentComments(null, DOC)).length, 0);
});

test("🔴 the packet block carries only OPEN comments, under the document's own name", async () => {
  resetPreviewComments();
  await addDocumentComment(null, DOC, { unit: 3, anchor: { x: 0.5, y: 0.5 }, body: "tighten this" });
  const resolved = await addDocumentComment(null, DOC, { unit: 4, anchor: {}, body: "done already" });
  await setCommentResolved(null, DOC, resolved!.id, true);
  await addDocumentComment(null, { kind: "source", id: "other-doc" }, { unit: 1, anchor: { box: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } }, body: "what is this diagram?" });

  const open = await openCommentsForDocs(null, [DOC, { kind: "source", id: "other-doc" }]);
  assert.equal(open.length, 2, "a resolved comment leaked into the packet, or an open one was dropped");

  const block = commentsContextBlock([
    { title: "Week 4 slides", unitLabel: "slide", comments: open.filter((comment) => comment.docId === DOC.id) },
    { title: "Fluid mechanics notes", unitLabel: "page", comments: open.filter((comment) => comment.docId === "other-doc") },
  ]);
  assert.match(block, /On "Week 4 slides" \(slide 3\): "tighten this"/);
  assert.match(block, /On "Fluid mechanics notes" \(page 1, marked area\): "what is this diagram\?"/);
  assert.ok(!block.includes("done already"), "a resolved comment reached the model");
});

test("the spot description names what the anchor actually is", () => {
  const base = { id: "c", docKind: "source" as const, docId: "d", body: "x", resolvedAt: null, createdAt: "now", parentId: null, author: "learner" as const };
  const point: DocumentComment = { ...base, unit: 7, anchor: { x: 0.2, y: 0.9 } };
  const area: DocumentComment = { ...base, unit: 2, anchor: { box: { x: 0, y: 0, width: 0.5, height: 0.5 } } };
  const block: DocumentComment = { ...base, unit: 1, anchor: { block: 4 } };
  assert.equal(describeCommentSpot(point, "page"), "page 7");
  assert.equal(describeCommentSpot(area, "slide"), "slide 2, marked area");
  // 1-based in prose, because "paragraph 0" is programmer talk on a learner's screen.
  assert.equal(describeCommentSpot(block, "section"), "section 1, paragraph 5");
});
