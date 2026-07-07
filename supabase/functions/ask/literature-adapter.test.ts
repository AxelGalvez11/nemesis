// Unit tests for the SCIENCE_CONNECTORS adapter (ConnectorHit -> NormalizedSource mapping).
// Pure mapping only — no network. Run: deno test supabase/functions/ask/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ConnectorHit } from "../_shared/science/types.ts";
import {
  connectorHitToNormalizedSource,
  extractExternalIds,
  LITERATURE_CONNECTOR_DEFS,
  type LiteratureConnectorDef,
} from "./literature-adapter.ts";

function defFor(origin: string): LiteratureConnectorDef {
  const def = LITERATURE_CONNECTOR_DEFS.find((d) => d.origin === origin);
  if (!def) throw new Error(`no def registered for origin ${origin}`);
  return def;
}

Deno.test("LITERATURE_CONNECTOR_DEFS registers exactly the 4 net-new connectors (not pubmed/europepmc/openalex)", () => {
  const origins = LITERATURE_CONNECTOR_DEFS.map((d) => d.origin).sort();
  assertEquals(origins, ["arxiv", "biorxiv", "crossref", "semantic_scholar"]);
});

// ---- extractExternalIds: per-connector id shapes ----

Deno.test("extractExternalIds: crossref reads the DOI straight off hit.id", () => {
  const hit: ConnectorHit = { id: "10.1056/nejmoa2021436", title: "t", extra: {} };
  assertEquals(extractExternalIds("crossref", hit), { doi: "10.1056/nejmoa2021436" });
});

Deno.test("extractExternalIds: crossref DOI is lowercased/normalized", () => {
  const hit: ConnectorHit = { id: "10.1056/NEJMoa2021436", title: "t", extra: {} };
  assertEquals(extractExternalIds("crossref", hit).doi, "10.1056/nejmoa2021436");
});

Deno.test("extractExternalIds: semantic_scholar reads PMID + DOI from extra.externalIds, not hit.id", () => {
  const hit: ConnectorHit = {
    id: "649def34f8be52c8b66281af98ae884c09aef38b", // opaque paperId — must NOT be used for dedupe
    title: "t",
    extra: { externalIds: { PubMed: "27633186", DOI: "10.1056/nejmoa1602044" } },
  };
  assertEquals(extractExternalIds("semantic_scholar", hit), {
    pmid: "27633186",
    doi: "10.1056/nejmoa1602044",
  });
});

Deno.test("extractExternalIds: semantic_scholar with no externalIds yields neither id", () => {
  const hit: ConnectorHit = { id: "abc123", title: "t", extra: {} };
  assertEquals(extractExternalIds("semantic_scholar", hit), { pmid: undefined, doi: undefined });
});

Deno.test("extractExternalIds: biorxiv parses the doi out of the colon-joined hit.id", () => {
  const hit: ConnectorHit = { id: "medrxiv:10.1101/2024.01.01.24300001", title: "t", extra: {} };
  assertEquals(extractExternalIds("biorxiv", hit).doi, "10.1101/2024.01.01.24300001");
});

Deno.test("extractExternalIds: biorxiv prefers extra.doi when present", () => {
  const hit: ConnectorHit = {
    id: "biorxiv:10.1101/wrong",
    title: "t",
    extra: { doi: "10.1101/2024.05.05.500000" },
  };
  assertEquals(extractExternalIds("biorxiv", hit).doi, "10.1101/2024.05.05.500000");
});

Deno.test("extractExternalIds: arxiv reads a published DOI from extra.doi (preprint id itself is not a DOI)", () => {
  const hit: ConnectorHit = { id: "2101.00001", title: "t", extra: { doi: "10.1234/something" } };
  assertEquals(extractExternalIds("arxiv", hit).doi, "10.1234/something");
});

Deno.test("extractExternalIds: arxiv with no published DOI yields undefined", () => {
  const hit: ConnectorHit = { id: "2101.00001", title: "t", extra: {} };
  assertEquals(extractExternalIds("arxiv", hit), { doi: undefined });
});

Deno.test("extractExternalIds: DOI URL form is normalized to the bare DOI", () => {
  const hit: ConnectorHit = { id: "https://doi.org/10.1056/NEJMoa2021436", title: "t", extra: {} };
  assertEquals(extractExternalIds("crossref", hit).doi, "10.1056/nejmoa2021436");
});

// ---- connectorHitToNormalizedSource: mapping + dedupe-key selection ----

Deno.test("connectorHitToNormalizedSource: PMID-bearing hit maps to provider pubmed_oa + bare pmid (collapses into the existing PubMed/Europe PMC entry)", () => {
  const hit: ConnectorHit = {
    id: "649def34f8be52c8b66281af98ae884c09aef38b",
    title: "RECOVERY trial",
    summary: "A randomized trial of dexamethasone.",
    url: "https://www.semanticscholar.org/paper/649de...",
    extra: { abstract: "A randomized trial of dexamethasone.", externalIds: { PubMed: "32678530" } },
  };
  const mapped = connectorHitToNormalizedSource(defFor("semantic_scholar"), hit);
  assertEquals(mapped?.provider, "pubmed_oa");
  assertEquals(mapped?.provider_id, "32678530");
});

Deno.test("connectorHitToNormalizedSource: DOI-only hit maps to the SHARED doi_lit provider (not the origin connector's own name), keyed doi:<doi>", () => {
  const hit: ConnectorHit = {
    id: "10.1101/2024.01.01.573922",
    title: "A bioRxiv preprint",
    summary: "Some abstract text.",
    url: "https://www.biorxiv.org/content/10.1101/2024.01.01.573922v1",
    extra: { doi: "10.1101/2024.01.01.573922", abstract: "Some abstract text." },
  };
  const mapped = connectorHitToNormalizedSource(defFor("biorxiv"), hit);
  assertEquals(mapped?.provider, "doi_lit");
  assertEquals(mapped?.provider_id, "doi:10.1101/2024.01.01.573922");
});

Deno.test("connectorHitToNormalizedSource: same DOI from two different new connectors collapses to the SAME key (cross-connector dedupe)", () => {
  const crossrefHit: ConnectorHit = {
    id: "10.1038/s41586-021-03819-2",
    title: "Same paper via Crossref",
    summary: "Abstract A.",
    extra: { abstract: "Abstract A." },
  };
  const s2Hit: ConnectorHit = {
    id: "opaque-s2-id",
    title: "Same paper via Semantic Scholar",
    summary: "Abstract B.",
    extra: { abstract: "Abstract B.", externalIds: { DOI: "10.1038/S41586-021-03819-2" } }, // different case, same DOI
  };
  const a = connectorHitToNormalizedSource(defFor("crossref"), crossrefHit);
  const b = connectorHitToNormalizedSource(defFor("semantic_scholar"), s2Hit);
  assertEquals(`${a?.provider}:${a?.provider_id}`, `${b?.provider}:${b?.provider_id}`);
});

Deno.test("connectorHitToNormalizedSource: neither PMID nor DOI falls back to the connector's own native id", () => {
  const hit: ConnectorHit = {
    id: "2101.00001",
    title: "An arXiv preprint",
    summary: "Abstract text.",
    url: "https://arxiv.org/abs/2101.00001",
    extra: { summary: "Abstract text." }, // arxiv's raw Atom <summary> field IS the abstract
  };
  const mapped = connectorHitToNormalizedSource(defFor("arxiv"), hit);
  assertEquals(mapped?.provider, "arxiv");
  assertEquals(mapped?.provider_id, "2101.00001");
});

Deno.test("connectorHitToNormalizedSource: returns null when the hit has no summary at all (nothing groundable to cite)", () => {
  const hit: ConnectorHit = { id: "10.1/x", title: "Title only, no abstract" };
  assertEquals(connectorHitToNormalizedSource(defFor("crossref"), hit), null);
});

Deno.test("connectorHitToNormalizedSource: returns null when the hit has no title", () => {
  const hit: ConnectorHit = { id: "10.1/x", title: "", summary: "Some abstract.", extra: { abstract: "Some abstract." } };
  assertEquals(connectorHitToNormalizedSource(defFor("crossref"), hit), null);
});

Deno.test("connectorHitToNormalizedSource: returns null when summary is only the metadata fallback stub (no real abstract) — matches fetchOpenAlex, never cites a bare authors/venue/year stub", () => {
  // Mirrors exactly what crossref.ts's toHit produces for an abstract-less work: summary falls
  // back to "authors. venue. year" (see literature/crossref.ts:60), and extra carries no `abstract`
  // field at all (undefined, not empty string) because the work never had one.
  const hit: ConnectorHit = {
    id: "10.1/x",
    title: "A work with no abstract",
    summary: "Smith J, Doe A. Nature. 2020", // the metadata-fallback stub, NOT a real abstract
    extra: { author: [{ name: "Smith J" }] }, // no `abstract` key — this IS the abstract-less case
  };
  assertEquals(connectorHitToNormalizedSource(defFor("crossref"), hit), null);
});

Deno.test("connectorHitToNormalizedSource: every mapped hit is license cc_by_nc (restricted: citable live, never stored)", () => {
  const hit: ConnectorHit = { id: "10.1/x", title: "T", summary: "S", extra: { abstract: "S" } };
  const mapped = connectorHitToNormalizedSource(defFor("crossref"), hit);
  assertEquals(mapped?.license, "cc_by_nc");
});

Deno.test("connectorHitToNormalizedSource: content_text is title + blank line + summary (groundable text for the reranker)", () => {
  const hit: ConnectorHit = { id: "10.1/x", title: "My Title", summary: "My abstract body.", extra: { abstract: "My abstract body." } };
  const mapped = connectorHitToNormalizedSource(defFor("crossref"), hit);
  assertEquals(mapped?.content_text, "My Title\n\nMy abstract body.");
});

Deno.test("connectorHitToNormalizedSource: falls back to a doi.org URL when the hit carries no url", () => {
  const hit: ConnectorHit = { id: "10.1/x", title: "T", summary: "S", extra: { doi: "10.1/x", abstract: "S" } };
  const mapped = connectorHitToNormalizedSource(defFor("crossref"), hit);
  assertEquals(mapped?.source_url, "https://doi.org/10.1/x");
});
