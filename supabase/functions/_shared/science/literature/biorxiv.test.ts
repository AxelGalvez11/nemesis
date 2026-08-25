import { assertEquals } from "jsr:@std/assert@1";
import { rankRecent } from "./biorxiv.ts";

// ── the bioRxiv relevance rule ────────────────────────────────────────────────────────────────
//
// api.biorxiv.org has no search endpoint. This connector fetches the newest ~200 preprints and
// decides for itself which ones answer the query, so `rankRecent` IS its relevance — there is no
// upstream ranker to fall back on and no score to defer to.
//
// 🔴 EVERY "must not return" CASE BELOW IS A REAL OBSERVED RESULT, not an invented worry. They were
// produced live on 2026-08-24 by driving the seven literature indexes across four disciplines. The
// old rule kept any preprint sharing ONE token of length > 1 with the query, matched as a substring.
//
// The reason this is guarded rather than merely fixed: these rows reach a learner labelled as
// evidence. A wrong paper under a student's own question does not read as "the preprint server had
// nothing" — it reads as the system asserting relevance. Empty is honest; confident and wrong is a
// fabrication, and it is the failure mode this file exists to keep out.

/** The neuroscience preprint that came back for a property-law query, verbatim. */
const METHYLPHENIDATE = {
  doi: "10.1101/2026.08.01.000001",
  title: "Intravenous methylphenidate for acute traumatic disorders of consciousness: A phase 1 dose study",
  abstract:
    "We report adverse events and dose-limiting toxicity in patients with traumatic brain injury. " +
    "Secondary outcomes included recovery of consciousness.",
  category: "neuroscience",
  server: "medrxiv",
  version: "1",
};

/** The C. elegans preprint that came back for a Thirty Years War query, verbatim. */
const C_ELEGANS = {
  doi: "10.1101/2026.08.02.000002",
  title: "C. elegans Nuclear Hormone Receptor NHR-49 promotes attractive chemotaxis independently of metabolism",
  abstract:
    "Chemotaxis toward attractive odorants was assayed over many years of accumulated strains. " +
    "The causes of this behaviour remain unclear.",
  category: "genetics",
  server: "biorxiv",
  version: "1",
};

/** A preprint that genuinely is about the medical query asked of it. */
const METFORMIN = {
  doi: "10.1101/2026.08.03.000003",
  title: "Metformin and cardiovascular outcomes: a randomised controlled trial in type 2 diabetes",
  abstract: "Participants received metformin or placebo. Cardiovascular outcomes were adjudicated blind.",
  category: "endocrinology",
  server: "medrxiv",
  version: "1",
};

Deno.test("a property-law query does not return a neuroscience preprint", () => {
  // Matched under the old rule on the single word 'adverse' — as in adverse events.
  const kept = rankRecent([METHYLPHENIDATE], "adverse possession doctrine property law", 10);
  assertEquals(kept.length, 0);
});

Deno.test("a history query does not return a genetics preprint", () => {
  // The purest form of the old bug. 'of' cleared a length > 1 filter and appears in every abstract
  // ever written, so a single stopword was enough to certify a worm paper as relevant to the
  // Thirty Years War. 'years', 'causes' and 'toward' compounded it.
  const kept = rankRecent([C_ELEGANS], "causes of the Thirty Years War historiography", 10);
  assertEquals(kept.length, 0);
});

Deno.test("substrings do not count: 'war' is not inside 'warfare', 'law' is not inside 'flawed'", () => {
  const decoy = {
    doi: "10.1101/x",
    title: "A flawed model of warfare-like competition between cells",
    abstract: "Cells move toward one another.",
    category: "cell biology",
    server: "biorxiv",
    version: "1",
  };
  assertEquals(rankRecent([decoy], "war law", 10).length, 0);
});

Deno.test("a preprint that genuinely meets the query is still returned", () => {
  // The guard above must not have been bought by refusing everything.
  const kept = rankRecent([METFORMIN], "metformin cardiovascular outcomes randomised trial", 10);
  assertEquals(kept.length, 1);
  assertEquals(kept[0].paper.doi, METFORMIN.doi);
});

Deno.test("a single distinctive term is a usable query", () => {
  // required() clamps to the number of terms available. Without that clamp the two-match floor
  // could never be met by a one-word query, and every 'CRISPR' or 'metformin' search would return
  // nothing while looking like an honest empty result.
  assertEquals(rankRecent([METFORMIN], "metformin", 10).length, 1);
});

Deno.test("a query of nothing but stopwords returns nothing, not the newest preprints", () => {
  // The old code's explicit fallback was `papers.slice(0, limit)` — recent preprints handed back
  // as answers to a question they were never compared against.
  assertEquals(rankRecent([METFORMIN, C_ELEGANS], "the study of new results", 10).length, 0);
});

Deno.test("relevance comes from overlap, not from the subject being biology", () => {
  // 🔴 THE FIELD-AGNOSTIC GUARD (CLAUDE.md: no feature may be scoped to one discipline). The fix
  // must reject the law query above because nothing MATCHED, never because the rule knows biology.
  // Given a preprint that really is about the law question, the same rule must surface it.
  const lawPreprint = {
    doi: "10.1101/2026.08.04.000004",
    title: "Adverse possession doctrine and registered property title: an empirical review",
    abstract: "We examine adverse possession claims and their disposition under property law.",
    category: "law",
    server: "biorxiv",
    version: "1",
  };
  const kept = rankRecent([lawPreprint, METHYLPHENIDATE], "adverse possession doctrine property law", 10);
  assertEquals(kept.length, 1);
  assertEquals(kept[0].paper.doi, lawPreprint.doi);
});

Deno.test("a title match outranks the same term buried in an abstract", () => {
  const inTitle = {
    doi: "10.1101/a",
    title: "Metformin and cardiovascular outcomes in adults",
    abstract: "Background section.",
    category: "endocrinology",
    server: "medrxiv",
    version: "1",
  };
  const inAbstract = {
    doi: "10.1101/b",
    title: "A cohort of adults followed for ten years",
    abstract: "Some participants took metformin; cardiovascular outcomes were recorded.",
    category: "endocrinology",
    server: "medrxiv",
    version: "1",
  };
  const kept = rankRecent([inAbstract, inTitle], "metformin cardiovascular outcomes", 10);
  assertEquals(kept.length, 2);
  assertEquals(kept[0].paper.doi, "10.1101/a");
});

Deno.test("limit is honoured", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ ...METFORMIN, doi: `10.1101/n${i}` }));
  assertEquals(rankRecent(many, "metformin cardiovascular outcomes", 5).length, 5);
});
