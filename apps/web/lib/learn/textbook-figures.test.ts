import assert from "node:assert/strict";
import test from "node:test";

import { candidateFrom, licenceFromCcUrl, textbookFigures, type FigureHit } from "./textbook-figures";
import { REUSABLE_LICENCES } from "./visual-provenance";

// The licence mapping is the single most consequential function in the figure lane: everything
// downstream trusts that a candidate carrying `CC-BY-4.0` really is CC BY 4.0. Nemesis is a paid
// product, so a NonCommercial figure reaching a learner is a legal problem no other test here
// would catch.

const hit = (over: Partial<FigureHit> = {}): FigureHit => ({
  alt: "",
  attribution: "Environmental Biology by Matthew R. Fisher, CC BY 4.0",
  bookTitle: "Environmental Biology",
  bookUrl: "https://openoregon.pressbooks.pub/envirobiology",
  caption: "Figure 3.1 Energy flow through an ecosystem.",
  chapterTitle: "3.1 Energy Flow through Ecosystems",
  id: "abc",
  imageUrl: "https://openoregon.pressbooks.pub/app/uploads/energy.png",
  licence: "https://creativecommons.org/licenses/by/4.0/",
  similarity: 0.71,
  ...over,
});

test("🔴 NonCommercial and NoDerivatives licences map to nothing", () => {
  // The tempting bug is a `startsWith("…/licenses/by")` test, which reads as reasonable and admits
  // by-nc, by-nc-sa and by-nd. Nemesis charges money; NC forbids exactly that, and ND forbids the
  // adaptation that turning a chapter into a lesson IS.
  for (const url of [
    "https://creativecommons.org/licenses/by-nc/4.0/",
    "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    "https://creativecommons.org/licenses/by-nd/4.0/",
  ]) {
    assert.equal(licenceFromCcUrl(url), null, `${url} must not map to a reusable licence`);
  }
});

test("the permitted families map, and only at versions the ladder lists", () => {
  assert.equal(licenceFromCcUrl("https://creativecommons.org/licenses/by/4.0/"), "CC-BY-4.0");
  assert.equal(licenceFromCcUrl("https://creativecommons.org/licenses/by/3.0/"), "CC-BY-3.0");
  assert.equal(licenceFromCcUrl("https://creativecommons.org/licenses/by-sa/4.0/"), "CC-BY-SA-4.0");
  assert.equal(licenceFromCcUrl("https://creativecommons.org/publicdomain/zero/1.0/"), "CC0-1.0");
  // 🔴 A REAL GRANT WE HAVE SIMPLY NOT DECIDED ON IS STILL A REFUSAL. CC BY 2.0 exists and is
  // permissive; it is not in REUSABLE_LICENCES, so admitting it here would put a licence string
  // downstream that `chooseAsset` would then reject with a confusing reason.
  assert.equal(licenceFromCcUrl("https://creativecommons.org/licenses/by/2.0/"), null);
});

test("🔴 the version comes from the url, never assumed", () => {
  // Recording a 3.0 figure as 4.0 would be inventing the terms we hold it under. Real books in
  // this catalogue carry 3.0 grants.
  assert.notEqual(licenceFromCcUrl("https://creativecommons.org/licenses/by/3.0/"), "CC-BY-4.0");
});

test("every licence this can produce is one the ladder already permits", () => {
  // Guards a drift that would be invisible: adding a family here without adding it to
  // REUSABLE_LICENCES yields candidates rejected downstream for a reason nobody can act on.
  for (const url of [
    "https://creativecommons.org/licenses/by/3.0/",
    "https://creativecommons.org/licenses/by/4.0/",
    "https://creativecommons.org/licenses/by-sa/3.0/",
    "https://creativecommons.org/licenses/by-sa/4.0/",
    "https://creativecommons.org/publicdomain/zero/1.0/",
    "https://creativecommons.org/publicdomain/mark/1.0/",
  ]) {
    const licence = licenceFromCcUrl(url);
    assert.ok(licence, `${url} should map`);
    assert.ok(REUSABLE_LICENCES.includes(licence), `${licence} is not in REUSABLE_LICENCES`);
  }
});

test("junk, empty and non-CC strings map to nothing", () => {
  for (const value of [null, undefined, "", "   ", "open access", "free to use", "https://example.org"]) {
    assert.equal(licenceFromCcUrl(value), null);
  }
});

test("a usable row becomes a candidate carrying its credit line", () => {
  const candidate = candidateFrom(hit());
  assert.ok(candidate);
  assert.equal(candidate.provenance, "reference_image");
  assert.equal(candidate.providerId, "textbook-shelf");
  assert.equal(candidate.licence?.licence, "CC-BY-4.0");
  assert.match(candidate.licence?.attribution ?? "", /Matthew R\. Fisher/);
  // The caption shown is the author's own sentence, not something a model wrote.
  assert.match(candidate.caption ?? "", /Energy flow through an ecosystem/);
});

test("🔴 a row missing its credit line is dropped here, not passed on", () => {
  // CC BY requires attribution wherever the picture appears. A candidate without one would be
  // refused by `chooseAsset` as `attribution-missing`, which reads as a bookkeeping failure in the
  // registry; dropping it here keeps "we have no picture" and "we mishandled a picture" distinct.
  assert.equal(candidateFrom(hit({ attribution: "   " })), null);
});

test("🔴 a NonCommercial row cannot become a candidate even if everything else is present", () => {
  const candidate = candidateFrom(hit({
    attribution: "Some Book, CC BY-NC 4.0",
    licence: "https://creativecommons.org/licenses/by-nc/4.0/",
  }));
  assert.equal(candidate, null);
});

test("a row with no image is dropped", () => {
  assert.equal(candidateFrom(hit({ imageUrl: "" })), null);
});

test("search failures are an empty shelf, never a thrown error", async () => {
  // A teaching turn must not die because a search index is down. "No trustworthy picture exists" is
  // an outcome §42 already renders honestly.
  assert.deepEqual(
    await textbookFigures("mitosis", 4, { search: () => Promise.reject(new Error("index down")) }),
    [],
  );
  assert.deepEqual(
    await textbookFigures("   ", 4, { search: () => Promise.reject(new Error("never called")) }),
    [],
  );
});

test("unusable rows are filtered out of a mixed result rather than failing the whole search", async () => {
  const mixed: FigureHit[] = [
    hit({ id: "good" }),
    hit({ id: "nc", licence: "https://creativecommons.org/licenses/by-nc/4.0/" }),
    hit({ id: "nocredit", attribution: "" }),
  ];
  const out = await textbookFigures("ecosystem", 4, { search: () => Promise.resolve(mixed) });
  assert.equal(out.length, 1, "only the usable row should survive");
  assert.equal(out[0]?.licence?.licence, "CC-BY-4.0");
});
