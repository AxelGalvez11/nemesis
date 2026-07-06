# Retraction / Research-Integrity Detection — source assessment (verified 2026-06-09)

## TL;DR
Single highest-leverage credibility guard. NOT a LIVE_SOURCES gather provider — it is a
post-retrieval FILTER keyed on DOI/PMID. Build it as a batch-resolvable guard, not a per-source entry.

## Primary sources (verified, not memory)
- Crossref REST API `updated-by` mechanism — VERIFIED on real retracted DOI
  10.1016/s0140-6736(97)11096-0 (Wakefield 1998): returns `updated-by` array with
  `{type:"retraction", source:"retraction-watch", DOI:..., updated:2010-02-06}` and a
  `correction` entry. Title prefixed "RETRACTED:". The retraction NOTICE carries the inverse `update-to`.
  Filter form: `https://api.crossref.org/works?filter=update-type:retraction`.
- Crossref + Retraction Watch acquisition (Sep 2023, blog): $175k acquisition + ~$120k/yr,
  5yr term, "keep the data populated on an ongoing basis and always open."
- License: Crossref REST API metadata license page — metadata treated as 'facts' = public domain
  (CC0); freely reusable without a license; Retraction Watch data carries a CITATION REQUEST
  (cite the source if used in a published work). So effectively CC0 + attribution-courtesy.
- Freshness: updated EVERY WORKING DAY by Retraction Watch (verified on docs + GitLab README).
- Full CSV (GitLab `crossref/retraction-watch-data`, `git clone`) columns VERIFIED:
  Record ID, Title, Subject, Institution, Journal, Publisher, Country, Author, URLS, ArticleType,
  RetractionDate, RetractionDOI, RetractionPubMedID, OriginalPaperDate, OriginalPaperDOI,
  OriginalPaperPubMedID, RetractionNature, Reason, Paywalled, Notes.
  `RetractionNature` ∈ {Retraction, Correction, Expression of Concern, Reinstatement}.
- Labs API (api.labs.crossref.org/data/retractionwatch) is DEPRECATED — "experiment no longer
  running"; use production REST API + GitLab CSV.
- PubMed: PublicationType "Retracted Publication" (the paper) vs "Retraction of Publication"
  (the notice); CommentsCorrections RefType `RetractionOf`/`PartialRetractionOf`. Filterable via
  E-utilities. NLM-curated, public-domain. VERIFIED on NLM MEDLINE docs.

## How to wire the hard guard (never cite retracted)
1. PRIMARY: full Retraction Watch CSV ingested into a local table keyed on
   normalized OriginalPaperDOI + OriginalPaperPubMedID. O(1) set-membership at answer time —
   no network call on the hot path. Refresh daily via cron (CSV is small, ~60k rows).
2. Each retrieved candidate already carries PMID (pubmed_oa provider_id) or a DOI (extractable).
   Before grounding/citation, drop any chunk whose DOI/PMID is in the retracted set.
   Surface a "this was retracted" flag rather than silently dropping for transparency.
3. Only flag where RetractionNature == "Retraction" (and optionally "Expression of Concern" as a
   soft warning); "Correction" and "Reinstatement" must NOT block.
4. Live API double-check (Crossref `updated-by`) only as a freshness backstop for brand-new
   retractions not yet in the daily CSV — time-bounded, fault-tolerant, never blocks the answer.

## Provenance risk
LOW for false positives if matched on EXACT (normalized DOI / PMID) — mirrors the existing
resolveSourceIds exact-pair discipline. Risk is the inverse of the openFDA name-drop bug:
that bug ADMITTED junk; this guard REMOVES junk. The only risk is over-blocking corrections/EoC
as retractions — mitigated by gating on RetractionNature. DOI normalization (case, trailing
slashes, doi.org prefix) is the one real correctness hazard.
