# PharmaOrb Evidence API Broker

The Evidence API broker gives PharmaOrb broad research coverage without bulk-ingesting every paper first.

Instead of downloading PubMed or publisher content wholesale, the broker searches trusted public evidence sources in real time, deduplicates records, ranks the likely evidence value, and labels what kind of access PharmaOrb has.

## Endpoint

```http
GET /api/v1/evidence/search?q=berberine+glucose&limit=20
```

Response shape:

```json
{
  "query": "berberine glucose",
  "count": 1,
  "searched_sources": ["pubmed", "europepmc", "openalex"],
  "warnings": [],
  "results": [
    {
      "title": "Example randomized trial",
      "doi": "10.1000/example",
      "pmid": "12345678",
      "source_rank": ["pubmed", "openalex", "unpaywall"],
      "publication_types": ["Randomized Controlled Trial"],
      "score": 92,
      "access": {
        "status": "legal_full_text",
        "source": "unpaywall",
        "license": "CC-BY",
        "can_index": true,
        "can_store_full_text": true,
        "can_show_snippets": true
      }
    }
  ]
}
```

## Sources In This Slice

- PubMed / NCBI E-utilities: biomedical search, PMID, abstracts, publication types.
- Europe PMC: life-science search and open-access full-text signals.
- OpenAlex: scholarly graph coverage, DOI/PMID/PMCID mapping, citation metadata.
- Unpaywall: DOI-to-open-access resolver.

## Legal Access Labels

- `legal_full_text`: reusable full text was resolved. Index/store only when `can_index` and `can_store_full_text` are true.
- `open_version`: an open landing page or PDF was found, but reuse permissions are not confirmed.
- `preprint`: open preprint source, reserved for arXiv/bioRxiv-style adapters.
- `abstract_or_metadata_only`: no legal reusable full text; use abstract and metadata only.
- `metadata_only`: no abstract or full text is available.

## Cache Tables

- `papers`: normalized paper metadata and source provenance.
- `paper_access`: per-paper access decisions.
- `source_calls`: provider request telemetry and cache provenance.
- `legal_fulltext_chunks`: optional reusable full-text chunks, server-only until snippet review policies are added.

## Environment

- `NCBI_API_KEY`: optional, improves PubMed E-utilities rate limits.
- `UNPAYWALL_EMAIL`: optional but recommended; used as the API contact email for Unpaywall and OpenAlex.

## Product Fit

This becomes the evidence-broker layer underneath Ask, Evidence Map, Research Gaps, Study Designer, reports, CLI, API, and MCP. It lets the app say exactly what the answer is based on:

- full-text PMC/Europe PMC/OpenAlex/Unpaywall records when legally reusable,
- PubMed abstracts when full text is unavailable,
- metadata/citation graph when only metadata is available,
- and explicit warnings when a source fails.
