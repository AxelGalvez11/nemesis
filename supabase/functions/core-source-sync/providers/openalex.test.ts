import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mapOpenAlexLicense,
  normalizeWork,
  type OpenAlexWork,
  providerAndId,
  reconstructAbstract,
} from "./openalex.ts";

// --- reconstructAbstract ----------------------------------------------------
// OpenAlex ships abstracts as an inverted index: word -> [positions]. A word can repeat at
// NON-CONTIGUOUS positions, so reconstruction must place every occurrence and then order by index.
Deno.test("reconstructAbstract rebuilds word order from a sparse, repeated inverted index", () => {
  // "the cat saw the dog" — "the" repeats at 0 and 3 (non-adjacent), positions arrive out of order.
  const idx: Record<string, number[]> = {
    saw: [2],
    the: [0, 3],
    dog: [4],
    cat: [1],
  };
  assertEquals(reconstructAbstract(idx), "the cat saw the dog");
});

Deno.test("reconstructAbstract returns empty string for missing/empty index", () => {
  assertEquals(reconstructAbstract(null), "");
  assertEquals(reconstructAbstract(undefined), "");
  assertEquals(reconstructAbstract({}), "");
});

// --- mapOpenAlexLicense ------------------------------------------------------
// Conservative: anything we can't verify as permissive (incl. null) -> cc_by_nc, which surfaces the
// source LIVE (we may cite it) but the commercial gate blocks STORING it. NC/ND beat plain BY.
Deno.test("mapOpenAlexLicense maps OpenAlex license tokens, defaulting unknown to restricted", () => {
  assertEquals(mapOpenAlexLicense("cc-by"), "cc_by");
  assertEquals(mapOpenAlexLicense("cc-by-sa"), "cc_by_sa");
  assertEquals(mapOpenAlexLicense("cc-by-nc"), "cc_by_nc");
  assertEquals(mapOpenAlexLicense("cc-by-nc-nd"), "cc_by_nc"); // nc wins over nd
  assertEquals(mapOpenAlexLicense("cc-by-nd"), "cc_by_nd");
  assertEquals(mapOpenAlexLicense("cc0"), "cc0");
  assertEquals(mapOpenAlexLicense("public-domain"), "public_domain");
  assertEquals(mapOpenAlexLicense(null), "cc_by_nc"); // unverifiable -> restricted (live-only)
  assertEquals(mapOpenAlexLicense(undefined), "cc_by_nc");
  assertEquals(mapOpenAlexLicense("some-bespoke-publisher-terms"), "cc_by_nc");
});

// --- providerAndId -----------------------------------------------------------
// A PMID present -> map to "pubmed_oa" + BARE pmid so it DEDUPES against the PubMed/Europe PMC live
// sources (those also key on pubmed_oa:<pmid>). No PMID -> the OpenAlex long tail: "openalex" + short id.
Deno.test("providerAndId strips the PMID URL to bare digits for dedupe", () => {
  const w: OpenAlexWork = {
    id: "https://openalex.org/W3042270788",
    ids: { pmid: "https://pubmed.ncbi.nlm.nih.gov/27633186" },
  };
  assertEquals(providerAndId(w), { provider: "pubmed_oa", provider_id: "27633186" });
});

Deno.test("providerAndId falls back to the short OpenAlex id when there is no PMID", () => {
  const w: OpenAlexWork = { id: "https://openalex.org/W4210642183", ids: { doi: "https://doi.org/10.17863/cam.57006" } };
  assertEquals(providerAndId(w), { provider: "openalex", provider_id: "W4210642183" });
});

// --- normalizeWork (full JSON -> NormalizedSource) ---------------------------
const NEJM_DEX: OpenAlexWork = {
  id: "https://openalex.org/W3042270788",
  title: "Dexamethasone in Hospitalized Patients with Covid-19",
  ids: {
    openalex: "https://openalex.org/W3042270788",
    doi: "https://doi.org/10.1056/nejmoa2021436",
    pmid: "https://pubmed.ncbi.nlm.nih.gov/32678530",
  },
  abstract_inverted_index: { Dexamethasone: [0], reduced: [1], mortality: [2] },
  primary_location: { source: { display_name: "New England Journal of Medicine" }, license: null },
  publication_year: 2020,
  type: "article",
  authorships: [{ author: { display_name: "RECOVERY Collaborative Group" } }],
  biblio: { volume: "384", issue: "8", first_page: "693", last_page: "704" },
};

Deno.test("normalizeWork maps a PMID-bearing work to a deduping pubmed_oa source, License-restricted", async () => {
  const s = await normalizeWork(NEJM_DEX);
  assert(s, "expected a normalized source");
  assertEquals(s!.provider, "pubmed_oa");
  assertEquals(s!.provider_id, "32678530"); // bare pmid
  assertEquals(s!.license, "cc_by_nc"); // license null -> restricted (surfaces live, never stored)
  assert(s!.content_text.includes("Dexamethasone reduced mortality"), "abstract reconstructed into content");
  assert(s!.content_text.startsWith("Dexamethasone in Hospitalized"), "title leads the content");
  assertEquals(s!.source_url, "https://pubmed.ncbi.nlm.nih.gov/32678530/");
  assertEquals(s!.subtitle, "New England Journal of Medicine");
  assertEquals((s!.metadata as Record<string, unknown>).journal, "New England Journal of Medicine");
  assertEquals((s!.metadata as Record<string, unknown>).year, 2020);
  assertEquals((s!.metadata as Record<string, unknown>).openalex_id, "W3042270788");
  assertEquals((s!.metadata as Record<string, unknown>).pmid, "32678530");
  assertEquals((s!.metadata as Record<string, unknown>).doi, "10.1056/nejmoa2021436");
  assertEquals((s!.metadata as Record<string, unknown>).authors, ["RECOVERY Collaborative Group"]);
  assertEquals((s!.metadata as Record<string, unknown>).volume, "384");
  assertEquals((s!.metadata as Record<string, unknown>).pages, "693-704");
  assertEquals(s!.content_hash.length, 64); // sha256 hex
});

Deno.test("normalizeWork keeps the OpenAlex long tail (no PMID) under the openalex provider with a permissive license", async () => {
  const w: OpenAlexWork = {
    id: "https://openalex.org/W4210642183",
    title: "A repository preprint",
    ids: { openalex: "https://openalex.org/W4210642183", doi: "https://doi.org/10.17863/cam.57006" },
    abstract_inverted_index: { Some: [0], findings: [1] },
    primary_location: { source: { display_name: "Cambridge Repository" }, license: "cc-by" },
    publication_year: 2021,
  };
  const s = await normalizeWork(w);
  assert(s);
  assertEquals(s!.provider, "openalex");
  assertEquals(s!.provider_id, "W4210642183");
  assertEquals(s!.license, "cc_by");
  assertEquals(s!.source_url, "https://doi.org/10.17863/cam.57006"); // no pmid -> doi link
});

Deno.test("normalizeWork rejects works without a usable abstract or title", async () => {
  assertEquals(await normalizeWork({ id: "https://openalex.org/W1", title: "No abstract", ids: {} }), null);
  assertEquals(
    await normalizeWork({ id: "https://openalex.org/W2", abstract_inverted_index: { a: [0] }, ids: {} }),
    null, // no title
  );
});
