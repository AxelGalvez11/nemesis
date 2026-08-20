// Can a claim EXTRACTION minted ever show the learner where it came from?
//
// 🔴 THE WHOLE CHAIN OR NOTHING, BECAUSE EVERY LINK OF IT ALREADY PASSED ITS OWN TESTS WHILE THE
// PRODUCT SHOWED NO CITATION. `groundCanonicalAnchor` had 36 green tests and zero callers;
// extraction had green tests proving it records anchors; the canvas had green tests proving it
// resolves refs. All true, all simultaneously, and a learner still could not see the origin of a
// single extracted fact. So this test refuses to start from anything hand-written:
//
//     real .xlsx -> parseDocument -> DocumentModel -> sourceContextFromModel
//                -> extractKnowledgeObjects  (mints the DURABLE anchor)
//                -> CanvasSource via buildExcerptsFromModel  (mints the CANVAS-LOCAL excerpts)
//                -> canvasToRow -> JSON -> canvasFromRow      (the boundary six fields died at)
//                -> citationsForKnowledge -> THE LEARNER CAN BE SHOWN THE PLACE
//
// 🔴 `two-tables.xlsx` IS THE FIXTURE ON PURPOSE, AND IT IS WHAT MAKES A WRONG ANSWER VISIBLE. It
// holds TWO grids, so its claims land in two different excerpts: the reagent codes in one, the
// glassware codes in the other. An implementation that resolved a claim to "the first excerpt of
// the right document" — the single most likely wrong shortcut, and one a one-table fixture would
// bless — sends the glassware claim to the reagent table and this test goes red. A fixture where
// every claim lives in one unit cannot tell a working join from no join at all.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { sourceContextFromModel } from "@/lib/sources/source-context";

import { parseDocument } from "../notebooks/parse-document";
import { buildExcerptsFromModel, quotedExcerpt } from "./canvas-grounding";
import { emptyCanvas, type CanvasSource, type LearningCanvas } from "./canvas-model";
import { canvasFromRow, canvasToRow, mergeSourceIntoCanvas } from "./canvas-store";
import { citationsForKnowledge } from "./knowledge-citation";
import { extractKnowledgeObjects } from "./knowledge-extraction";
import type { KnowledgeObject } from "./knowledge-types";

const NOW = "2026-08-15T00:00:00.000Z";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LIBRARY_ID = "lib-two-tables";

interface Attached {
  canvas: LearningCanvas;
  source: CanvasSource;
  objects: KnowledgeObject[];
}

/**
 * One real spreadsheet, taken to knowledge AND to a canvas source the way production does both.
 *
 * 🔴 THE TWO HALVES COME FROM THE SAME PARSE, WHICH IS THE POINT. The durable anchors are built
 * from `sourceContextFromModel`, the canvas excerpts from `buildExcerptsFromModel` — the same pair
 * of production calls `use-canvas-session.ts` and `canvas-knowledge.ts` make. If those two ever
 * disagree about what a unit is, the join fails here rather than in front of a learner.
 */
async function attachRealSpreadsheet(name: string, canvasSourceId: string): Promise<Attached> {
  const bytes = new Uint8Array(readFileSync(new URL(`../notebooks/fixtures/xlsx/${name}`, import.meta.url)));
  const outcome = await parseDocument(bytes, name, XLSX);
  assert.ok(outcome.ok, `${name} must parse — this test proves nothing about a document we cannot read`);
  const model = outcome.document.model;
  assert.ok(model, `${name} must produce a structural model; a flat-text fallback has no units to anchor to`);

  const context = sourceContextFromModel({ model, sourceId: LIBRARY_ID, sourceKind: model.format });
  const extraction = extractKnowledgeObjects(context);

  const source: CanvasSource = {
    durability: "durable",
    excerpts: buildExcerptsFromModel(canvasSourceId, model),
    id: canvasSourceId,
    kind: outcome.document.kind,
    librarySourceId: LIBRARY_ID,
    title: outcome.document.title ?? name,
  };

  return { canvas: mergeSourceIntoCanvas(emptyCanvas("c-cite", NOW), source), objects: extraction.objects, source };
}

/** The database boundary, honestly: through the row codec and through JSON, as Postgres would. */
function throughTheDatabase(canvas: LearningCanvas): LearningCanvas {
  const row = canvasToRow(canvas, "user-1");
  const stored = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
  return canvasFromRow({
    active_ms: stored.active_ms as number,
    created_at: NOW,
    document: stored.document,
    id: stored.id as string,
    level: stored.level as string,
    state: stored.state as string,
    title: stored.title as string,
    updated_at: NOW,
  } as Parameters<typeof canvasFromRow>[0]);
}

/** The claim's own words, so "did it resolve to the right place?" is answerable from the text. */
function termsOf(object: KnowledgeObject): [string, string] {
  assert.ok(object.pair, "this fixture's knowledge is association pairs; the test reads their halves");
  return [object.pair.left, object.pair.right];
}

test("🔴 a claim EXTRACTION minted resolves to the excerpt that actually states it", async () => {
  const { canvas, objects } = await attachRealSpreadsheet("two-tables.xlsx", "s1");

  assert.ok(objects.length > 0, "the fixture must yield knowledge, or this test is vacuous");
  assert.ok(
    objects.every((object) => (object.sourceAnchors?.length ?? 0) > 0),
    "extraction must record a DURABLE anchor on every object — the citation has nothing to convert otherwise",
  );
  assert.ok(
    objects.every((object) => object.sourceRefs === undefined),
    "and NO canvas-local ref: if extraction ever mints one, this whole conversion is the wrong fix",
  );

  // 🔴 THE BOUNDARY. Everything above holds in memory; six structural fields have died right here.
  const readBack = throughTheDatabase(canvas);

  const seenExcerpts = new Set<string>();
  for (const object of objects) {
    const citations = citationsForKnowledge(readBack.sources, object);
    assert.equal(
      citations.length,
      1,
      `"${object.statement}" must resolve to exactly one place it can be shown`,
    );

    const citation = citations[0]!;
    seenExcerpts.add(citation.ref.excerptId);

    const resolved = quotedExcerpt(readBack.sources, citation.ref);
    assert.ok(resolved, "the citation must resolve through the real consumer the surface uses");

    // 🔴 THE ASSERTION THAT CANNOT BE SATISFIED BY THE WRONG EXCERPT. Both halves of the claim have
    // to appear in the text the citation points at. On this fixture the glassware claims and the
    // reagent claims live in different grids, so a resolution that lands on the wrong one fails
    // here rather than looking plausible.
    const [left, right] = termsOf(object);
    assert.ok(
      resolved.excerpt.text.includes(left) && resolved.excerpt.text.includes(right),
      `the cited text must contain "${left}" and "${right}", but it was: ${resolved.excerpt.text.slice(0, 120)}`,
    );
    assert.equal(citation.sourceTitle, readBack.sources[0]!.title, "the learner is shown the document's own name");
  }

  assert.ok(
    seenExcerpts.size > 1,
    "🔴 CALIBRATION: this fixture's claims MUST span more than one excerpt, or the test cannot " +
      "distinguish a real unit join from a hardcoded first excerpt",
  );
});

test("🔴 an anchor this canvas cannot honestly point at produces NO citation", async () => {
  const { canvas, objects } = await attachRealSpreadsheet("two-tables.xlsx", "s1");
  const readBack = throughTheDatabase(canvas);
  const real = objects.find((object) => (object.sourceAnchors?.length ?? 0) > 0)!;
  const anchor = real.sourceAnchors![0]!;

  // A document this canvas does not hold. The unit id is REAL and so is the quote — only the
  // source differs, which is exactly the case a `sourceId` mix-up would produce.
  assert.deepEqual(
    citationsForKnowledge(readBack.sources, { sourceAnchors: [{ ...anchor, sourceId: "lib-somewhere-else" }] }),
    [],
    "an anchor from another document must produce silence, never this canvas's nearest excerpt",
  );

  // A unit that no longer exists — what a reparse into a different block structure looks like.
  assert.deepEqual(
    citationsForKnowledge(readBack.sources, { sourceAnchors: [{ ...anchor, unitId: "unit-that-no-longer-exists" }] }),
    [],
    "a unit that did not survive must produce silence",
  );

  // The same anchor against a source that was never filed. `librarySourceId` is what an anchor
  // matches on, so an ephemeral attachment can carry the same text and still not be citable.
  const ephemeral: CanvasSource = { ...readBack.sources[0]!, durability: "ephemeral" };
  delete (ephemeral as { librarySourceId?: string }).librarySourceId;
  assert.deepEqual(
    citationsForKnowledge([ephemeral], real),
    [],
    "a source with no library row cannot be cited durably, however well its text matches",
  );

  // And a claim carrying no anchors at all — model knowledge, which must never acquire a source.
  assert.deepEqual(citationsForKnowledge(readBack.sources, { sourceAnchors: [] }), []);
  assert.deepEqual(citationsForKnowledge(readBack.sources, {}), []);

  // 🔴 A CANVAS WITH NO SOURCES AT ALL, WHICH IS THE ORDINARY CASE RATHER THAN AN EDGE ONE. A canvas
  // started by typing a topic holds no files, and knowledge identity is content-derived, so a claim
  // minted on one canvas legitimately arrives at another that never held the document behind it.
  // Both must stay silent. Pinned because this is the path a future "well, show the source name at
  // least" fallback would be added to first, and it is the path where such a fallback would be a
  // claim about a document the learner never attached here.
  assert.deepEqual(
    citationsForKnowledge([], real),
    [],
    "a canvas holding no sources can cite nothing, however well-anchored the claim is",
  );
});

// ── The production call site ────────────────────────────────────────────────
//
// 🔴 THIS IS THE GUARD THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT, AND IT PINS THE CALL RATHER THAN
// THE IMPORT. `groundCanonicalAnchor` was written, documented and covered by 36 passing tests while
// no production code called it — a state every test above would also have tolerated, because they
// all invoke the conversion themselves. An `assert.match(source, /citationsForKnowledge/)` would be
// no better: it stays green when someone keeps the import and deletes the call, which is precisely
// how a lane dies. So the CALL EXPRESSION and the RETURN are both pinned, because computing a value
// the hook never hands out is the same dead end wearing a different shape.
//
// This reads source text rather than rendering, matching the convention canvas-document.test.ts and
// canvas-policy-view.test.ts set — this app has no DOM harness.

const RUNTIME = readFileSync(new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url), "utf8");

/**
 * The file with its commentary removed.
 *
 * 🔴 A GUARD ABOUT WHAT RENDERS MUST READ WHAT RENDERS. The first draft of the check below asserted
 * the view contains no "source unknown" placeholder — and it failed, on the comment that explains
 * why there is no such placeholder. A prose match cannot tell a rendered string from a note saying
 * that string must never be rendered, and the version that "passes" by rewording a comment is
 * worse: it is a guard whose colour depends on documentation.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const VIEW = codeOnly(
  readFileSync(new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url), "utf8"),
);

test("🔴 the runtime CALLS the conversion, on the decision it is about to show", () => {
  assert.match(
    RUNTIME,
    /citationsForKnowledge\(\s*canvas\.sources,\s*decision\.knowledge\s*\)/,
    "the conversion must run on the live decision path, against THIS canvas's sources",
  );
});

test("🔴 and hands the result out — a value nobody receives is a value nobody renders", () => {
  // The hook's returned object literal. Computing `citations` and omitting it here would leave the
  // conversion running and invisible, which is indistinguishable from the bug this fixes.
  const returned = RUNTIME.slice(RUNTIME.lastIndexOf("\n  return {"));
  assert.match(returned, /^\s*citations,$/m, "`citations` must be part of what usePolicyRuntime returns");
});

test("🔴 the surface renders it, and renders NOTHING when there is nothing honest to show", () => {
  assert.match(VIEW, /const \{ citations,/, "the view must actually read it off the runtime");
  // 🔴 REPOINTED 2026-08-19 TO THE PROPERTY, NOT THE SHAPE. This demanded the literal
  // `if (citations.length === 0) return null;`. The de-duplication that fixed
  // "From 3.1Functional Groups, 3.1Functional Groups" moved the emptiness question into
  // `citationLine`, which returns null for an empty list AND for a list of blank titles — strictly
  // more cases than the old line caught — and this went red for a change that improved exactly what
  // it exists to protect. What matters is that the early return happens before any markup.
  const trail = /function SourceTrail\(\{ citations \}[\s\S]{0,400}?\n\}/.exec(VIEW);
  assert.ok(trail, "SourceTrail is gone");
  const markupAt = trail[0].indexOf("return <");
  const beforeMarkup = markupAt === -1 ? trail[0] : trail[0].slice(0, markupAt);
  assert.match(beforeMarkup, /return null;/, "an empty list must render nothing at all, by returning null before any markup");
  // 🔴 EVERY SCREEN THAT SHOWS A CLAIM, NOT JUST THE CORRECTION. Disclosing the origin on one screen
  // and not another makes the same fact look sourced in one place and unsourced in the other.
  //
  // 🔴🔴 DERIVED FROM THE SCREENS RATHER THAN A LITERAL, AND THE LITERAL IS WHY. This asserted `2`,
  // which was correct while `show_correction` and `contrast` were the only two claim-bearing
  // screens — and it is exactly the kind of number that goes stale silently. A third screen that
  // shows a claim and FORGETS the trail would have made this go red for the right reason; a third
  // that remembers it would have made it go red for the wrong one, and the tempting fix is to bump
  // the number. Counting both sides means adding a screen can only fail this when the screen is
  // actually missing its disclosure.
  //
  // 🔴 AND A CLAIM IS NOT ONLY A `cue → answer` LINE ANY MORE. The worked-example screen puts the
  // material's own reasoning on the page, step by step, and shows no cue-arrow-answer at all — so
  // counting only that literal would have let the newest claim-bearing screen ship with no
  // disclosure while this test stayed green. Both shapes are counted, and the two-sided equality is
  // kept: adding a screen can still only fail this when the screen is actually missing its trail.
  // 🔴 REPOINTED 2026-08-19. This counted the literal `{decision.objective.cue} → {…answer}`, which
  // three screens each wrote out by hand — and writing it three times is what let a one-sided claim
  // print as "X → X" on all three at once. The join now happens once, in `<TaughtClaimLines>`, so
  // the thing to count is the shared component. The equality below is unchanged and is the part
  // that matters: as many trails as screens showing a claim.
  // 🔴 MATCHED BY COMPONENT, NOT BY EXACT PROPS. This pinned the full call `<TaughtClaimLines
  // decision={decision} />` and went red the day the component gained a second prop — for a change
  // that added nothing and removed nothing from what it is counting. What this test is about is HOW
  // MANY SCREENS SHOW A CLAIM, so that is what it counts; the props those screens pass are the
  // component's business.
  const cueAndAnswer = (VIEW.match(/<TaughtClaimLines[\s>]/g) ?? []).length;
  const workedSteps = (VIEW.match(/modelled\.modelled\.steps\.map/g) ?? []).length;
  const claimScreens = cueAndAnswer + workedSteps;
  const trails = (VIEW.match(/<SourceTrail citations=\{citations\} \/>/g) ?? []).length;
  assert.ok(cueAndAnswer >= 2, `expected the claim-bearing screens to still exist, found ${cueAndAnswer}`);
  assert.equal(workedSteps, 1, "the worked example must still render the grounded steps it was built from");
  assert.equal(trails, claimScreens, "every screen that shows a claim must disclose where it came from");
  // 🔴 NO FALLBACK, AND THIS IS THE HALF THAT PROTECTS THE CONTRACT. `groundCanonicalAnchor`
  // returning null is the function saying it cannot honestly point at anything; a placeholder would
  // convert that refusal into a claim. These are the exact shapes such a placeholder takes.
  assert.doesNotMatch(VIEW, /Source unknown/i);
  assert.doesNotMatch(VIEW, /citations\.length === 0 \?/, "no else-branch may render a stand-in citation");
  assert.doesNotMatch(VIEW, /citations\[0\] \?\?/, "no defaulted citation");
});

test("two anchors landing in one excerpt are one place, not corroboration", async () => {
  const { canvas, objects } = await attachRealSpreadsheet("two-tables.xlsx", "s1");
  const readBack = throughTheDatabase(canvas);
  const real = objects.find((object) => (object.sourceAnchors?.length ?? 0) > 0)!;
  const anchor = real.sourceAnchors![0]!;

  // The same claim grounded twice — extraction plus `groundClaims`, or a term stated twice in one
  // table. Showing "From X · From X" would present one mention as two independent sources.
  const citations = citationsForKnowledge(readBack.sources, { sourceAnchors: [anchor, { ...anchor }] });
  assert.equal(citations.length, 1, "one place is one citation, however many anchors point at it");
});
