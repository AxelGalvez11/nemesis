import { assert, assertEquals } from "jsr:@std/assert@1";
import { distinctiveTerms, relevanceOf, requiredMatches, STOPWORDS } from "./relevance.ts";

// ── the relevance floor ───────────────────────────────────────────────────────────────────────
//
// Owner 2026-08-24: *"I need the searches to be accurate to have relevance. If it doesn't have
// relevance, then I don't see why we would use this."*
//
// 🔴 EVERY "must not keep" CASE HERE IS A REAL RESULT FROM A REAL INDEX, captured live on
// 2026-08-24 while driving the six-index fan-out across four disciplines. None of them is invented,
// and none of them is an index misbehaving — each was a genuine best-effort answer from a search
// engine that had nothing better for that question. The bug was showing them to a learner anyway.

const keeps = (query: string, title: string, body = "") => relevanceOf(query, title, body).keep;

Deno.test("🔴🔴🔴 a sports paper does not answer a property-law question", () => {
  // arXiv's honest best for "adverse possession doctrine property law". It matched on the single
  // word "possession" — in the basketball sense.
  assertEquals(
    keeps(
      "adverse possession doctrine property law",
      "Space-Creating versus Dead Possession: An Off-Ball Possession-Quality Index for Broadcast Football",
      "We introduce a possession-quality index computed from broadcast tracking data.",
    ),
    false,
  );
});

Deno.test("🔴🔴🔴 a physics paper does not answer a Thirty Years War question", () => {
  // arXiv again, for "causes of the Thirty Years War historiography" — matched "thirty" and "years".
  assertEquals(
    keeps(
      "causes of the Thirty Years War historiography",
      "Thirty Years of heavy Fermions: Scientific Setting for their Discovery and Partial Understanding",
      "A review of the discovery of heavy fermion materials.",
    ),
    false,
  );
});

Deno.test("🔴🔴 a statistics-methods paper does not answer a drug question", () => {
  // This one is why research-DESIGN words are non-distinctive. Returned for "metformin
  // cardiovascular outcomes randomised trial", clearing an earlier version of the bar on nothing
  // but "randomised" and "trial" — words that describe how a study was run, in any field.
  assertEquals(
    keeps(
      "metformin cardiovascular outcomes randomised trial",
      "Sample size calculations for multilevel factorial longitudinal cluster randomised trials",
      "We derive sample size formulae for cluster randomised designs with factorial structure.",
    ),
    false,
  );
});

Deno.test("a plankton paper does not answer a law question", () => {
  // "Plankton: the paradox and the power law" — matched "law", inside "power law".
  assertEquals(keeps("adverse possession doctrine property law", "Plankton: the paradox and the power law"), false);
});

Deno.test("🔴 the papers that DO answer are kept — the floor is not bought by refusing everything", () => {
  // Each of these was returned and kept in the same live run. A guard that only ever says no would
  // pass every test above and destroy the feature.
  const real: [string, string][] = [
    ["adverse possession doctrine property law", "Property Rules, Liability Rules, and Adverse Possession"],
    ["adverse possession doctrine property law", "The Right To Property And The Doctrine Of Adverse Possession"],
    ["causes of the Thirty Years War historiography", "Historiography During The Thirty Years' War"],
    ["fatigue crack propagation in welded steel joints", "Fatigue crack propagation in API 5L X-70 pipeline steel longitudinal welded joints"],
    ["metformin cardiovascular outcomes randomised trial", "Impact of metformin on cardiovascular disease: a meta-analysis of randomised trials"],
  ];
  for (const [query, title] of real) {
    assert(keeps(query, title), `a paper that genuinely answers "${query}" was dropped: ${title}`);
  }
});

Deno.test("🔴🔴🔴 the rule behaves identically for a law student and a machinist", () => {
  // CLAUDE.md's design test, run directly. Two queries from opposite ends of the university, each
  // with a matching paper and a plausible near-miss. The rule must treat both the same way while
  // containing no word belonging to either field.
  assert(keeps("adverse possession doctrine property law", "Adverse Possession and the Doctrine of Property Title"));
  assert(!keeps("adverse possession doctrine property law", "Ball possession and match outcome in elite football"));
  assert(keeps("fatigue crack propagation in welded steel joints", "Crack propagation in welded steel joints under fatigue loading"));
  assert(!keeps("fatigue crack propagation in welded steel joints", "Compassion fatigue among hospice nurses"));
});

Deno.test("🔴 ordinary inflection is not a miss", () => {
  // 🔴 THIS TEST IS DELIBERATELY NARROW, BECAUSE THE OBVIOUS VERSION PROVED NOTHING. The first
  // attempt used a four-term query against a title sharing two terms exactly — which clears a bar of
  // two whether or not inflection is handled, so deleting `normalise` entirely left the suite green.
  // Every term below MUST be matched through inflection for the record to survive: "welded" against
  // "welding", "joints" against "joint". Nothing else in the title can carry it.
  assert(keeps("welded joints", "Welding of steel joint details"), "inflection is no longer normalised");
  // 🔴 AND THE INVERSE, PINNING THAT THIS IS SUFFIX STRIPPING AND NOT PREFIX TRUNCATION — the
  // obvious "simplification" someone reaches for next. Truncating every long token to its first
  // four characters would make "propagation" and "property" the same word, and "cracking" and
  // "cracked" the same word, so a paper on cracked cement would answer a question about crack
  // propagation. Both terms have to collide for this to bite, which is why the case is this
  // specific: a vaguer inverse assertion passed happily while truncation was in place.
  assert(!keeps("propagation cracking", "Property of cracked cement in cold weather"));
});

Deno.test("🔴 a single distinctive term is a usable query", () => {
  // requiredMatches clamps to the terms available. Without the clamp, a floor of two would return
  // nothing for every one-word question while reading as "no such research exists".
  assertEquals(requiredMatches(1), 1);
  assert(keeps("estoppel", "Promissory estoppel in commercial contracts"));
  assert(keeps("metformin", "Metformin in type 2 diabetes"));
});

Deno.test("a query of nothing but stopwords keeps nothing, rather than keeping everything", () => {
  assertEquals(distinctiveTerms("what about all of these results").length, 0);
  assertEquals(keeps("what about all of these results", "Any paper at all", "with any abstract"), false);
});

Deno.test("🔴🔴🔴 the non-distinctive list contains no subject vocabulary", () => {
  // The one way this file could re-scope the product to a single discipline. Every entry must be
  // either an English function word or a term used in the academic writing of EVERY field. A word
  // belonging to medicine, law, physics or any other subject would silently make that field's
  // queries weaker than everyone else's.
  const subjectWords = [
    "patient", "clinical", "disease", "drug", "gene", "protein", "cell", "tumour", "tumor",
    "court", "statute", "contract", "tort", "quantum", "circuit", "beam", "market", "war",
    "diabetes", "cancer", "therapy", "dose", "surgical", "molecular",
  ];
  for (const word of subjectWords) {
    assert(!STOPWORDS.has(word), `"${word}" belongs to a field and must not be treated as meaningless`);
  }
});

Deno.test("title matches outrank the same terms buried in an abstract", () => {
  const inTitle = relevanceOf("metformin cardiovascular", "Metformin and cardiovascular outcomes", "Background.");
  const inBody = relevanceOf("metformin cardiovascular", "A cohort followed for ten years", "Participants took metformin; cardiovascular events recorded.");
  assertEquals(inTitle.matched, inBody.matched);
  assert(inTitle.score > inBody.score, "a title match no longer outranks an abstract match");
});
