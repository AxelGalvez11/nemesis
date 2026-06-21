import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRetractionSources,
  fetchRetractedPmids,
  pmidFromSourceKey,
  recheckCandidatesFromEvents,
} from "./retraction-recheck.ts";
import { classifyAlertReason, sourceKey } from "../../../packages/shared/src/watch-detect.ts";

Deno.test("pmidFromSourceKey extracts a bare PMID from a pubmed source_key; null otherwise", () => {
  assertEquals(pmidFromSourceKey("pubmed_oa:27633186"), "27633186");
  assertEquals(pmidFromSourceKey("clinicaltrials:NCT06000001"), null); // not pubmed
  assertEquals(pmidFromSourceKey("openfda:spl-1:20260101"), null);
  assertEquals(pmidFromSourceKey("pubmed_oa:27633186#retracted"), null); // already a recheck synthetic
  assertEquals(pmidFromSourceKey("pubmed_oa:abc123"), null); // non-numeric provider_id (corrupt row) → null
});

Deno.test("buildRetractionSources turns a now-retracted candidate into a retraction-classified source", () => {
  const out = buildRetractionSources(
    [{ pmid: "1", title: "A trial" }, { pmid: "2", title: "Still valid" }],
    new Set(["1"]),
  );
  assertEquals(out.length, 1);
  // DISTINCT key so it doesn't collide with the original paper's event + surfaces as NEW
  assertEquals(out[0].provider_id, "1#retracted");
  assertEquals(sourceKey(out[0]), "pubmed_oa:1#retracted");
  assertEquals(classifyAlertReason(out[0]), "retraction"); // flows through the normal classifier
  assertEquals(out[0].url, "https://pubmed.ncbi.nlm.nih.gov/1/"); // links to the (retracted) paper
});

Deno.test("buildRetractionSources excludes non-retracted candidates and tolerates empty input", () => {
  assertEquals(buildRetractionSources([{ pmid: "9" }], new Set(["1"])), []);
  assertEquals(buildRetractionSources([], new Set(["1"])), []);
});

Deno.test("recheckCandidatesFromEvents keeps only high-tier (evidence + alert) PubMed papers, deduped first-wins", () => {
  const out = recheckCandidatesFromEvents([
    { channel: "evidence", source_key: "pubmed_oa:111", is_alert: true, title: "RCT one" },
    { channel: "evidence", source_key: "pubmed_oa:111", is_alert: true, title: "RCT one (dup)" }, // dup PMID → first wins
    { channel: "evidence", source_key: "clinicaltrials:NCT1", is_alert: true, title: "a trial" }, // not PubMed
    { channel: "evidence", source_key: "pubmed_oa:222#retracted", is_alert: true, title: "prior recheck" }, // synthetic → excluded
    { channel: "evidence", source_key: "pubmed_oa:333", is_alert: false, title: "feed-tier" }, // not a loud alert
    { channel: "news", source_key: "news:https://x", is_alert: false, title: "news" }, // the wall
    { channel: "evidence", source_key: "pubmed_oa:444", is_alert: true, title: "RCT two" },
  ]);
  assertEquals(out, [
    { pmid: "111", title: "RCT one" },
    { pmid: "444", title: "RCT two" },
  ]);
});

Deno.test("recheckCandidatesFromEvents tolerates a null/absent title", () => {
  assertEquals(
    recheckCandidatesFromEvents([{ channel: "evidence", source_key: "pubmed_oa:5", is_alert: true, title: null }]),
    [{ pmid: "5", title: undefined }],
  );
});

const RETRACTED_XML = `<PubmedArticleSet>
<PubmedArticle><MedlineCitation><PMID>1</PMID><Article><ArticleTitle>Now retracted</ArticleTitle>
<PublicationTypeList><PublicationType>Randomized Controlled Trial</PublicationType><PublicationType>Retracted Publication</PublicationType></PublicationTypeList>
</Article></MedlineCitation></PubmedArticle>
<PubmedArticle><MedlineCitation><PMID>2</PMID><Article><ArticleTitle>Still valid</ArticleTitle>
<PublicationTypeList><PublicationType>Randomized Controlled Trial</PublicationType></PublicationTypeList>
</Article></MedlineCitation></PubmedArticle>
</PubmedArticleSet>`;

Deno.test("fetchRetractedPmids returns only the PMIDs whose record now carries a retraction type", async () => {
  const fetchImpl = (url: string) => {
    assert(url.includes("efetch"), "hits the efetch endpoint");
    assert(url.includes("id=1%2C2") || url.includes("id=1,2"), "sends BOTH pmids, comma-joined in one batch");
    return Promise.resolve(new Response(RETRACTED_XML, { status: 200 }));
  };
  const retracted = await fetchRetractedPmids({ pmids: ["1", "2"], fetchImpl });
  assertEquals([...retracted], ["1"]);
});

Deno.test("fetchRetractedPmids is fault-tolerant: a non-200 yields an empty set (never throws)", async () => {
  const fetchImpl = () => Promise.resolve(new Response("rate limited", { status: 429 }));
  assertEquals((await fetchRetractedPmids({ pmids: ["1"], fetchImpl })).size, 0);
});

Deno.test("fetchRetractedPmids skips the network for an empty / non-numeric PMID list", async () => {
  let called = false;
  const fetchImpl = () => { called = true; return Promise.resolve(new Response("", { status: 200 })); };
  assertEquals((await fetchRetractedPmids({ pmids: [], fetchImpl })).size, 0);
  assertEquals((await fetchRetractedPmids({ pmids: ["abc"], fetchImpl })).size, 0);
  assert(!called);
});
