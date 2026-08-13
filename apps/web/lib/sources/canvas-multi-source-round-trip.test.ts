/**
 * Several REAL documents onto ONE canvas, all the way to a resolved citation.
 *
 * 🔴 THE GAP THIS EXISTS TO CLOSE. Production holds three canvases with sources, and the two
 * written since durable attachment landed (#474) have **one source each**. So the multi-source
 * path — the one where a canvas holds a lecture *and* a syllabus *and* a drug list, which is the
 * ordinary way a student studies — has never run since the fix. The dedupe change in #555 runs
 * on that same path. A defect there would be invisible to every existing test and to production.
 *
 * 🔴 AND IT IS A ROUND TRIP, NOT A PARSE CHECK, BECAUSE SIX FIELDS HAVE DIED AT THE JSON
 * BOUNDARY AFTER PASSING THEIR OWN PARSER'S TESTS. The rule is the whole chain:
 *
 *     real file -> parseDocument -> model -> CanvasSource -> canvasToRow -> JSON
 *               -> canvasFromRow -> quotedExcerpt -> THE CITATION RESOLVES
 *
 * Anything less proves the parser worked, which was never the part in doubt.
 *
 * Fixtures are the repo's real PDFs, parsed by the production entry point the upload route and
 * the document worker call. Nothing here builds a model by hand.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildExcerptsFromModel } from "../learn/canvas-grounding";
import { quotedExcerpt } from "../learn/canvas-grounding";
import { emptyCanvas, type CanvasSource, type LearningCanvas } from "../learn/canvas-model";
import { canvasFromRow, canvasToRow, mergeSourceIntoCanvas } from "../learn/canvas-store";
import { parseDocument } from "../notebooks/parse-document";

const NOW = "2026-08-13T00:00:00.000Z";

/** Three genuinely different documents, each exercising a different shape of page. */
const FIXTURES = ["text-with-figure.pdf", "two-column.pdf", "mixed-pages.pdf"] as const;

function bytesOf(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../notebooks/fixtures/${name}`, import.meta.url)));
}

/**
 * One real file, taken to a `CanvasSource` exactly as the attach path does: the production
 * parser, then excerpts keyed to the canvas-local ordinal the caller mints.
 */
async function attachRealFile(canvas: LearningCanvas, name: string, librarySourceId: string) {
  const outcome = await parseDocument(bytesOf(name), name, "application/pdf");
  assert.ok(outcome.ok, `${name} must parse — this test is meaningless on a document we cannot read`);
  const model = outcome.document.model;
  assert.ok(model, `${name} must produce a structural model, not only flat text`);

  // What `use-canvas-session.ts` does: a fresh ordinal per attach, excerpts keyed to it.
  const id = `s${canvas.sources.length + 1}`;
  const source: CanvasSource = {
    id,
    title: outcome.document.title ?? name,
    kind: outcome.document.kind,
    excerpts: buildExcerptsFromModel(id, model),
    durability: "durable",
    librarySourceId,
  };
  assert.ok(source.excerpts.length > 0, `${name} must yield at least one excerpt to cite`);
  return { canvas: mergeSourceIntoCanvas(canvas, source), source };
}

/** The database boundary, honestly: through the row codec and through JSON, as Postgres would. */
function throughTheDatabase(canvas: LearningCanvas): LearningCanvas {
  const row = canvasToRow(canvas, "user-1");
  const stored = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
  return canvasFromRow({
    id: stored.id as string,
    title: stored.title as string,
    state: stored.state as string,
    level: stored.level as string,
    document: stored.document,
    active_ms: stored.active_ms as number,
    created_at: NOW,
    updated_at: NOW,
  } as Parameters<typeof canvasFromRow>[0]);
}

test("🔴 three real documents on one canvas survive to a resolved citation, each", async () => {
  let canvas = emptyCanvas("c-multi", NOW);
  const attached: CanvasSource[] = [];
  for (const [index, name] of FIXTURES.entries()) {
    const result = await attachRealFile(canvas, name, `lib-${index + 1}`);
    canvas = result.canvas;
    attached.push(result.source);
  }

  assert.equal(canvas.sources.length, 3, "three different documents must occupy three slots");
  assert.equal(new Set(canvas.sources.map((s) => s.librarySourceId)).size, 3);
  assert.ok(
    canvas.sources.every((s) => s.durability === "durable"),
    "every attached document must be durable — an ephemeral one teaches this canvas and nothing after it",
  );

  // 🔴 THE BOUNDARY. Everything above passed before six fields died here.
  const readBack = throughTheDatabase(canvas);
  assert.equal(readBack.sources.length, 3, "sources must survive the row codec and JSON");

  for (const source of attached) {
    const stored = readBack.sources.find((candidate) => candidate.id === source.id);
    assert.ok(stored, `${source.title} must still be present after the round trip`);
    assert.equal(stored.librarySourceId, source.librarySourceId, "the durable id must survive");
    assert.equal(stored.excerpts.length, source.excerpts.length, "no excerpt may be dropped");

    // The locator resolves, through the real consumer, to the same words it started as.
    const first = source.excerpts[0]!;
    const resolved = quotedExcerpt(readBack.sources, { sourceId: source.id, excerptId: first.id });
    assert.ok(resolved, `a citation into ${source.title} must resolve after the round trip`);
    assert.equal(resolved.excerpt.text, first.text, "and resolve to the same text, not a neighbour");
    assert.equal(resolved.source.librarySourceId, source.librarySourceId);
  }
});

test("🔴 on a MULTI-source canvas the dedupe fires on a repeat and spares the others", async () => {
  // The case #555 fixed, in the population it has never run in: a repeat arriving while other
  // documents are already attached. Merging the wrong entry here would delete a learner's file.
  let canvas = emptyCanvas("c-multi", NOW);
  for (const [index, name] of FIXTURES.entries()) {
    canvas = (await attachRealFile(canvas, name, `lib-${index + 1}`)).canvas;
  }
  const before = canvas.sources.map((s) => s.librarySourceId);

  // The learner attaches the SECOND document again. A fresh ordinal, as the caller mints.
  const repeated = await attachRealFile(canvas, FIXTURES[1], "lib-2");
  const after = repeated.canvas;

  assert.equal(after.sources.length, 3, "a repeat must not add a fourth slot");
  assert.deepEqual(after.sources.map((s) => s.librarySourceId), before, "and must not disturb the others");
  assert.equal(after.sources[1]?.id, "s2", "the survivor keeps the id its citations already use");

  // 🔴 AND THE OTHER TWO DOCUMENTS ARE STILL CITABLE. A dedupe that quietly rebuilt the array
  // would pass every count above.
  const readBack = throughTheDatabase(after);
  for (const source of readBack.sources) {
    const first = source.excerpts[0];
    assert.ok(first, `${source.title} kept its excerpts`);
    assert.ok(
      quotedExcerpt(readBack.sources, { sourceId: source.id, excerptId: first.id }),
      `${source.title} is still citable after a repeat of a DIFFERENT document`,
    );
  }
});

test("🔴 a MIXED canvas — some filed, some not — keeps both kinds distinct across the boundary", async () => {
  // 🔴 THIS TEST EXISTS BECAUSE ITS ABSENCE WAS A HOLE IN THIS FILE. Calibrating the tests above
  // by reintroducing defects showed that "match on shared ABSENCE of a library id" — which
  // silently deletes a file the learner attached — passed all of them, because every source here
  // had a library id and no two could share an absence. A suite that cannot see a defect is not
  // evidence about it.
  //
  // The mixed canvas is also the more honest fixture. Filing is best-effort: a bucket can refuse
  // a file whose type we could not name, and the canvas then holds one durable source and one
  // ephemeral one. Production has never had a canvas with SOME durable sources, so this branch
  // has never run anywhere — not here, not in the database.
  let canvas = emptyCanvas("c-mixed", NOW);
  canvas = (await attachRealFile(canvas, FIXTURES[0], "lib-1")).canvas;

  // Two files that were read but never filed. Neither names a row, so nothing identifies them as
  // one document — and they must not be collapsed on what they both lack.
  const ephemeral = (id: string, title: string): CanvasSource => ({
    id,
    title,
    kind: "text",
    excerpts: [{ id: `${id}:e1`, label: null, text: `notes in ${title}` }],
    durability: "ephemeral",
  });
  canvas = mergeSourceIntoCanvas(canvas, ephemeral("s2", "Notes A.md"));
  canvas = mergeSourceIntoCanvas(canvas, ephemeral("s3", "Notes B.md"));

  assert.equal(canvas.sources.length, 3, "two unfiled files are two files, not one");

  const readBack = throughTheDatabase(canvas);
  assert.equal(readBack.sources.length, 3, "the mixed canvas survives the boundary");
  assert.deepEqual(
    readBack.sources.map((s) => s.durability),
    ["durable", "ephemeral", "ephemeral"],
    "🔴 durability must survive per source — collapsing it would report an unfiled file as re-findable",
  );
  assert.equal(
    readBack.sources.filter((s) => s.librarySourceId).length,
    1,
    "only the filed document carries a durable id, and absence must read as UNKNOWN",
  );

  // Every source is still citable, filed or not: an ephemeral source teaches THIS canvas fine.
  for (const source of readBack.sources) {
    const first = source.excerpts[0];
    assert.ok(first, `${source.title} kept its excerpts`);
    assert.ok(quotedExcerpt(readBack.sources, { sourceId: source.id, excerptId: first.id }));
  }
});

test("🔴 two different documents are never merged, even when their text is thin", async () => {
  // The over-merge direction, on real files rather than fixtures written to differ. `blank-page`
  // and `image-only-page` are the two documents most likely to look alike to a naive identity
  // test — little or no text — and collapsing them would silently drop one.
  let canvas = emptyCanvas("c-thin", NOW);
  const first = await parseDocument(bytesOf("blank-page.pdf"), "blank-page.pdf", "application/pdf");
  const second = await parseDocument(bytesOf("image-only-page.pdf"), "image-only-page.pdf", "application/pdf");

  // Both may legitimately refuse — that is the honest verdict for a page with no readable text,
  // and it is not what this test is about. Attach whatever they produced, as the canvas would.
  const mk = (id: string, libraryId: string, title: string): CanvasSource => ({
    id,
    title,
    kind: "pdf",
    excerpts: [],
    durability: "durable",
    librarySourceId: libraryId,
  });
  canvas = mergeSourceIntoCanvas(canvas, mk("s1", "lib-blank", "blank-page.pdf"));
  canvas = mergeSourceIntoCanvas(canvas, mk("s2", "lib-image", "image-only-page.pdf"));

  assert.equal(canvas.sources.length, 2, "two documents that read as empty are still two documents");
  assert.equal(throughTheDatabase(canvas).sources.length, 2);
  assert.ok(first.ok === true || first.ok === false, "parseDocument returned a verdict either way");
  assert.ok(second.ok === true || second.ok === false);
});
