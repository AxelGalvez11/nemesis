import assert from "node:assert/strict";
import { test } from "node:test";

import type { CanvasSource } from "./canvas-model";
import { sourcePill, sourcePills } from "./source-pill";

// 🔴 REPORTED 2026-08-20: *"should a have pill sources like chatgpt and sources should have small
// circle favicon thumbnails, users should be able to click on the sources linked to the webpage or
// if its a document then users should see a popup preview of the doc."*
//
// The two halves of that sentence are two different resolutions, and the difference is not
// cosmetic — it is whether pressing the pill can go anywhere at all. `CanvasSource.sourceUrl` is
// documented as ABSENT for every file upload, and absent means "not a link", never "the URL was
// lost". There is nowhere to send that learner, so the pill shows them the passage instead.

const PAGE: CanvasSource = {
  excerpts: [{ id: "e1", label: "Groups containing sulfur", text: "Sulfur forms more bonds than oxygen." }],
  id: "s1",
  kind: "text",
  sourceUrl: "https://en.wikipedia.org/wiki/Functional_group",
  title: "Functional group - Wikipedia",
};

const UPLOAD: CanvasSource = {
  excerpts: [{ id: "e1", label: "3.1 Functional Groups", text: "A functional group decides how a molecule reacts." }],
  id: "s2",
  kind: "pdf",
  title: "PHCY 2119 Lecture 4",
};

const cite = (sourceId: string, excerptId: string, sourceTitle: string, label: string | null) => ({
  label,
  ref: { excerptId, sourceId },
  sourceTitle,
});

// ── A page is a link ────────────────────────────────────────────────────────

test("🔴 a source with a URL becomes a link, named by its site", () => {
  const pill = sourcePill([PAGE], cite("s1", "e1", "Functional group - Wikipedia", "Groups containing sulfur"));
  assert.equal(pill?.kind, "web");
  assert.equal(pill?.kind === "web" && pill.url, "https://en.wikipedia.org/wiki/Functional_group");
  // `en.` is a language mirror, not the source's name. The learner recognises "Wikipedia".
  assert.equal(pill?.kind === "web" && pill.label, "Wikipedia");
  assert.equal(pill?.kind === "web" && pill.host, "en.wikipedia.org", "the favicon needs the real host");
});

// ── An upload is a preview ──────────────────────────────────────────────────

test("🔴🔴 a source with NO URL becomes a preview carrying the cited passage", () => {
  // Calibration: make the `url` branch unconditional and this reddens — the pill would claim to be
  // a link to nowhere.
  const pill = sourcePill([UPLOAD], cite("s2", "e1", "PHCY 2119 Lecture 4", "3.1 Functional Groups"));
  assert.equal(pill?.kind, "document");
  assert.equal(pill?.kind === "document" && pill.excerpt, "A functional group decides how a molecule reacts.");
  assert.equal(pill?.kind === "document" && pill.section, "3.1 Functional Groups");
});

test("🔴 the DOCUMENT'S name is on the pill; the section rides in the preview", () => {
  // A learner recognises "PHCY 2119 Lecture 4". They do not recognise a heading out of context,
  // which is what the old grey line printed and what made it read as a bug.
  const pill = sourcePill([UPLOAD], cite("s2", "e1", "PHCY 2119 Lecture 4", "3.1 Functional Groups"));
  assert.equal(pill?.kind === "document" && pill.label, "PHCY 2119 Lecture 4");
});

test("🔴 a citation whose excerpt is gone still names its document", () => {
  // A reparse can dissolve the excerpt an anchor pointed at. The document is still real and still
  // worth naming; refusing the pill there would take away provenance to protect a preview.
  const pill = sourcePill([UPLOAD], cite("s2", "gone", "PHCY 2119 Lecture 4", null));
  assert.equal(pill?.kind, "document");
  assert.equal(pill?.kind === "document" && pill.excerpt, "");
});

// ── Refusal ─────────────────────────────────────────────────────────────────

test("🔴🔴 a source this canvas does not hold produces NOTHING", () => {
  // `knowledge-citation.ts` argues this at length one layer up: a citation the learner could follow
  // and find nothing behind is worse than no citation. There is deliberately no "unknown source"
  // pill, and the renderer draws silence.
  assert.equal(sourcePill([PAGE], cite("missing", "e1", "Somewhere", null)), null);
});

test("🔴 a malformed URL falls back to the document pill rather than a broken link", () => {
  const broken: CanvasSource = { ...PAGE, id: "s3", sourceUrl: "not a url" };
  const pill = sourcePill([broken], cite("s3", "e1", "Functional group", null));
  assert.equal(pill?.kind, "document", "a pill that cannot resolve a host must not claim to be a link");
});

// ── One press, one pill ─────────────────────────────────────────────────────

test("🔴🔴 two anchors into the same place are ONE pill", () => {
  // Listing a single source twice presents one mention as corroboration — the same argument
  // `citationsForKnowledge` makes about excerpts. De-duplicated by what pressing it DOES: a page by
  // its URL, a document by its identity, because the pill opens the whole document either way.
  const twoIntoOnePage = sourcePills(
    [PAGE],
    [cite("s1", "e1", "Functional group - Wikipedia", "A"), cite("s1", "e1", "Functional group - Wikipedia", "B")],
  );
  assert.equal(twoIntoOnePage.length, 1);

  const withSecondExcerpt: CanvasSource = {
    ...UPLOAD,
    excerpts: [...UPLOAD.excerpts, { id: "e2", label: "3.2", text: "Another passage." }],
  };
  const twoIntoOneDoc = sourcePills(
    [withSecondExcerpt],
    [cite("s2", "e1", "PHCY 2119 Lecture 4", "3.1"), cite("s2", "e2", "PHCY 2119 Lecture 4", "3.2")],
  );
  assert.equal(twoIntoOneDoc.length, 1, "one document, opened one way, is one pill");
});

test("a page and an upload cited together are two pills, in order", () => {
  const pills = sourcePills(
    [PAGE, UPLOAD],
    [cite("s2", "e1", "PHCY 2119 Lecture 4", null), cite("s1", "e1", "Functional group - Wikipedia", null)],
  );
  assert.deepEqual(pills.map((pill) => pill.kind), ["document", "web"]);
});
