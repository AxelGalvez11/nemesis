# PharmaOrb Evidence API Broker Plan

## Goal

Build the first MVP slice of the PharmaOrb Evidence API: a backend-only broker that federates biomedical and scholarly evidence sources in real time, deduplicates papers, ranks evidence, resolves legal access, and exposes a bounded API endpoint for the web app and future developer API.

This deliberately does not bulk-ingest PubMed. The system caches metadata and provenance, and only stores/indexes full text when a source/license explicitly allows it.

## Scope

- Add a broker endpoint: `GET /api/v1/evidence/search?q=...`.
- Query live source adapters for PubMed, Europe PMC, and OpenAlex.
- Resolve legal access with source-provided access signals plus Unpaywall when a DOI exists.
- Merge duplicate papers across DOI, PMID, PMCID, arXiv ID, and title.
- Rank results by evidence type, biomedical source quality, identifier confidence, and recency.
- Return transparent access badges: full text, open version, preprint, abstract-only, or metadata-only.
- Add Supabase cache/provenance tables for future API persistence.
- Document environment variables and legal caching rules.

## Out Of Scope For This Slice

- Bulk downloading or indexing all of PubMed.
- Fetching publisher paywalled full text.
- Building paid external API-key authentication.
- Running extraction agents, PRISMA workflows, evidence-gap generation, or study designer outputs.
- Storing embeddings for all broker results.

## Implementation Steps

1. Create evidence broker tests first:
   - Deduplication by DOI/PMID/title.
   - Access resolution prioritizing legal reusable full text.
   - Ranking stronger human evidence above weak metadata hits.
   - Search orchestration handling partial source failures.

2. Add broker library:
   - Shared paper/access/source types.
   - Dedupe, access resolver, ranking helpers.
   - Source adapters for PubMed, Europe PMC, OpenAlex, and Unpaywall.
   - Orchestrator that fans out, dedupes, ranks, enriches access, and returns warnings.

3. Add web API route:
   - `GET /api/v1/evidence/search`.
   - Validate query and limit.
   - Cap results to avoid runaway calls.
   - Return JSON suitable for Ask, Evidence Map, and future public API.

4. Add Supabase migration:
   - `papers`
   - `paper_access`
   - `source_calls`
   - `legal_fulltext_chunks`
   - RLS enabled, authenticated read only for paper metadata/access, service role writes, no public full-text chunk reads yet.

5. Document setup:
   - `NCBI_API_KEY` optional.
   - `UNPAYWALL_EMAIL` optional but recommended.
   - Legal caching policy.
   - Example endpoint response.

## Verification

- Run broker unit tests with `tsx`.
- Run web typecheck.
- Confirm the endpoint compiles and returns the expected schema in pure orchestration tests.

## Follow-Up

- Add CORE and arXiv adapters after this MVP.
- Add API keys/credits for external developer usage.
- Persist search cache and source-call logs from the route.
- Connect Ask to the broker for ambiguous terms and broad web-like evidence gathering.
- Feed broker results into discovery reports, evidence maps, and document exports.
