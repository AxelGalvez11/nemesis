import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCtGovDatedParams,
  buildOpenFdaDatedSearch,
  buildPubMedDatedParams,
  ctDate,
  ctStudyToWatchSource,
  fdaDate,
  fetchDatedClinicalTrials,
  fetchDatedOpenFda,
  fetchDatedPubMed,
  gatherDatedCandidates,
  openFdaLabelToWatchSource,
  pubmedArticleToWatchSource,
  pubmedDate,
  windowSince,
} from "./dated-sources.ts";
import { classifyAlertReason, sourceKey } from "../../../packages/shared/src/watch-detect.ts";

const SINCE = new Date("2026-05-19T00:00:00Z");
const UNTIL = new Date("2026-06-17T00:00:00Z");

// ── date formatters (each API wants its own format) ──────────────────────────────────────
Deno.test("date formatters emit the per-API formats (UTC, zero-padded)", () => {
  const d = new Date("2026-06-07T00:00:00Z");
  assertEquals(pubmedDate(d), "2026/06/07"); // NCBI mindate/maxdate
  assertEquals(ctDate(d), "2026-06-07"); // CT.gov RANGE
  assertEquals(fdaDate(d), "20260607"); // openFDA effective_time
});

// ── window cursor with overlap (advisor: re-fetch a small overlap; known-set dedupes it free) ─
Deno.test("windowSince: null cursor looks back the default; a set cursor backs off by the overlap", () => {
  const now = new Date("2026-06-17T00:00:00Z");
  // first run (no cursor) → bounded look-back so cycle 2 isn't spammed with the back-catalogue
  assertEquals(ctDate(windowSince(null, { now, defaultLookbackDays: 30 })), "2026-05-18");
  // later run → last_checked minus the overlap (guards indexing lag / clock skew)
  const lastChecked = new Date("2026-06-15T00:00:00Z");
  assertEquals(ctDate(windowSince(lastChecked, { now, overlapDays: 2 })), "2026-06-13");
});

// ── pure query/param builders (the 3 LIVE-VERIFIED shapes — watch-dated-probe.ts 3/3) ────────
Deno.test("buildPubMedDatedParams adds datetype=edat + mindate/maxdate to the term query", () => {
  const p = buildPubMedDatedParams("semaglutide", SINCE, UNTIL, 10);
  assertEquals(p.get("db"), "pubmed");
  assertEquals(p.get("term"), "semaglutide");
  assertEquals(p.get("retmode"), "json");
  assertEquals(p.get("retmax"), "10");
  assertEquals(p.get("datetype"), "edat"); // Entrez date = when INDEXED (new to a watcher), not pdat
  assertEquals(p.get("mindate"), "2026/05/19");
  assertEquals(p.get("maxdate"), "2026/06/17");
});

Deno.test("buildCtGovDatedParams uses the LastUpdatePostDate range filter and fetches FULL studies", () => {
  const p = buildCtGovDatedParams("semaglutide", SINCE, 10);
  assertEquals(p.get("query.term"), "semaglutide");
  assertEquals(p.get("pageSize"), "10");
  assertEquals(p.get("format"), "json");
  assertEquals(p.get("filter.advanced"), "AREA[LastUpdatePostDate]RANGE[2026-05-19,MAX]");
  // Must NOT restrict fields — the classifier needs study_type + phases (advisor: don't copy the
  // probe's field restriction). Omitting `fields` returns the full study object (all modules).
  assertEquals(p.get("fields"), null);
});

Deno.test("buildOpenFdaDatedSearch composes the name-scope with effective_time; null when no drug", () => {
  const s = buildOpenFdaDatedSearch(["lisinopril"], SINCE, UNTIL);
  assertEquals(
    s,
    '(openfda.generic_name:"lisinopril" OR openfda.brand_name:"lisinopril") AND effective_time:[20260519 TO 20260617]',
  );
  // multiple drugs OR together inside the scope
  const s2 = buildOpenFdaDatedSearch(["lisinopril", "losartan"], SINCE, UNTIL);
  assert(s2!.includes('openfda.generic_name:"losartan"'));
  // no drug named → null (caller SKIPS openFDA, never a bare full-text search — the name-drop guard)
  assertEquals(buildOpenFdaDatedSearch([], SINCE, UNTIL), null);
});

// ── pure mappers: raw API JSON → the lean WatchSource detection currency ──────────────────────
Deno.test("pubmedArticleToWatchSource carries pmid + publication_types onto the WatchSource", () => {
  const ws = pubmedArticleToWatchSource({
    pmid: "42308439",
    title: "Semaglutide and CV outcomes",
    publication_types: ["Randomized Controlled Trial", "Journal Article"],
    year: 2026,
  });
  assertEquals(ws.provider, "pubmed_oa"); // dedupes vs the live/library PubMed namespace
  assertEquals(ws.provider_id, "42308439");
  assertEquals(ws.url, "https://pubmed.ncbi.nlm.nih.gov/42308439/");
  assertEquals(ws.publication_types, ["Randomized Controlled Trial", "Journal Article"]);
});

Deno.test("ctStudyToWatchSource carries study_type + the latest phase; null without an NCT id", () => {
  const ws = ctStudyToWatchSource({
    protocolSection: {
      identificationModule: { nctId: "NCT06000001", briefTitle: "A phase 3 trial" },
      statusModule: { overallStatus: "RECRUITING", lastUpdatePostDateStruct: { date: "2026-06-12" } },
      designModule: { studyType: "INTERVENTIONAL", phases: ["PHASE2", "PHASE3"] },
    },
  });
  assert(ws);
  assertEquals(ws.provider, "clinicaltrials");
  assertEquals(ws.provider_id, "NCT06000001");
  assertEquals(ws.url, "https://clinicaltrials.gov/study/NCT06000001");
  assertEquals(ws.study_type, "INTERVENTIONAL");
  assertEquals(ws.trial_phase, "PHASE3"); // last phase wins (mirrors the live-evidence adapter)
  assertEquals(ws.published_date, "2026-06-12");
  assertEquals(ctStudyToWatchSource({ protocolSection: {} }), null);
});

Deno.test("openFdaLabelToWatchSource maps set_id + effective_time; no study-type (labels feed-only)", () => {
  const ws = openFdaLabelToWatchSource({
    set_id: "abc-123",
    effective_time: "20260212",
    openfda: { brand_name: ["Lipitor"], generic_name: ["atorvastatin"] },
  });
  assert(ws);
  assertEquals(ws.provider, "openfda");
  // VERSION-AWARE key: set_id + effective_time, so a later label REVISION surfaces as a new feed item
  // (set_id alone is stable across revisions → would permanently hide every future change after baseline).
  assertEquals(ws.provider_id, "abc-123:20260212");
  assertEquals(ws.url, "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=abc-123"); // URL = current label (set_id only)
  assertEquals(ws.published_date, "2026-02-12"); // YYYYMMDD → YYYY-MM-DD
  assertEquals(ws.study_type, undefined);
  assertEquals(ws.publication_types, undefined);
  assertEquals(openFdaLabelToWatchSource({ effective_time: "20260101" }), null); // no set_id
});

Deno.test("openFdaLabelToWatchSource: a label REVISION (same set_id, new effective_time) is a NEW key", () => {
  const v1 = openFdaLabelToWatchSource({ set_id: "s", effective_time: "20250101" })!;
  const v2 = openFdaLabelToWatchSource({ set_id: "s", effective_time: "20260101" })!;
  assert(sourceKey(v1) !== sourceKey(v2)); // the revision is detected, not swallowed as already-known
});

// ── end-to-end classification (advisor #3: a dated-fetched RCT must still fire the loud alert) ──
Deno.test("a dated-fetched late-phase trial classifies as a loud new_high_tier_study alert", () => {
  const ws = ctStudyToWatchSource({
    protocolSection: {
      identificationModule: { nctId: "NCT06000002", briefTitle: "Phase 3 RCT" },
      statusModule: { lastUpdatePostDateStruct: { date: "2026-06-10" } },
      designModule: { studyType: "INTERVENTIONAL", phases: ["PHASE3"] },
    },
  })!;
  assertEquals(classifyAlertReason(ws), "new_high_tier_study");
});

Deno.test("a dated-fetched observational study is feed-only (no loud alert)", () => {
  const ws = ctStudyToWatchSource({
    protocolSection: {
      identificationModule: { nctId: "NCT06000003", briefTitle: "Cohort" },
      statusModule: { lastUpdatePostDateStruct: { date: "2026-06-10" } },
      designModule: { studyType: "OBSERVATIONAL", phases: [] },
    },
  })!;
  assertEquals(classifyAlertReason(ws), null);
});

Deno.test("a dated-fetched retracted PubMed article classifies as a retraction alert", () => {
  const ws = pubmedArticleToWatchSource({
    pmid: "1",
    title: "Retracted: a drug study",
    publication_types: ["Randomized Controlled Trial", "Retracted Publication"],
    year: 2026,
  });
  assertEquals(classifyAlertReason(ws), "retraction"); // retraction outranks the RCT tier
});

// ── fault-tolerant fetchers (injected fetch, like the live sources) ───────────────────────────
const PUBMED_XML = `<PubmedArticleSet><PubmedArticle><MedlineCitation>
<PMID>42308439</PMID>
<Article><ArticleTitle>Semaglutide trial</ArticleTitle>
<Abstract><AbstractText>We ran a trial.</AbstractText></Abstract>
<PublicationTypeList><PublicationType>Randomized Controlled Trial</PublicationType></PublicationTypeList>
</Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

Deno.test("fetchDatedPubMed runs esearch→efetch and maps to WatchSources", async () => {
  const calls: string[] = [];
  const fetchImpl = (url: string) => {
    calls.push(url);
    if (url.includes("esearch")) return Promise.resolve(jsonResponse({ esearchresult: { idlist: ["42308439"], count: "254" } }));
    return Promise.resolve(new Response(PUBMED_XML, { status: 200 }));
  };
  const out = await fetchDatedPubMed({ query: "semaglutide", since: SINCE, until: UNTIL, max: 5, fetchImpl });
  assertEquals(out.length, 1);
  assertEquals(out[0].provider_id, "42308439");
  assertEquals(classifyAlertReason(out[0]), "new_high_tier_study");
  assert(calls[0].includes("datetype=edat")); // the dated query actually went out
});

Deno.test("fetchDatedPubMed is fault-tolerant: a non-200 esearch yields [] (never throws)", async () => {
  const fetchImpl = () => Promise.resolve(new Response("rate limited", { status: 429 }));
  assertEquals(await fetchDatedPubMed({ query: "x", since: SINCE, until: UNTIL, max: 5, fetchImpl }), []);
});

Deno.test("fetchDatedPubMed returns [] for an empty idlist without an efetch call", async () => {
  let efetched = false;
  const fetchImpl = (url: string) => {
    if (url.includes("efetch")) efetched = true;
    return Promise.resolve(jsonResponse({ esearchresult: { idlist: [], count: "0" } }));
  };
  assertEquals(await fetchDatedPubMed({ query: "x", since: SINCE, until: UNTIL, max: 5, fetchImpl }), []);
  assert(!efetched);
});

Deno.test("fetchDatedClinicalTrials maps the dated study list to WatchSources", async () => {
  const fetchImpl = (url: string) => {
    assert(url.includes("filter.advanced")); // dated filter present
    return Promise.resolve(jsonResponse({
      studies: [{
        protocolSection: {
          identificationModule: { nctId: "NCT06000002", briefTitle: "Phase 3 RCT" },
          statusModule: { lastUpdatePostDateStruct: { date: "2026-06-10" } },
          designModule: { studyType: "INTERVENTIONAL", phases: ["PHASE3"] },
        },
      }],
    }));
  };
  const out = await fetchDatedClinicalTrials({ query: "semaglutide", since: SINCE, max: 10, fetchImpl });
  assertEquals(out.length, 1);
  assertEquals(out[0].provider_id, "NCT06000002");
  assertEquals(classifyAlertReason(out[0]), "new_high_tier_study");
});

Deno.test("fetchDatedOpenFda skips the network entirely when no drug is named", async () => {
  let called = false;
  const fetchImpl = () => {
    called = true;
    return Promise.resolve(jsonResponse({ results: [] }));
  };
  const out = await fetchDatedOpenFda({ mentions: [], since: SINCE, until: UNTIL, max: 5, fetchImpl });
  assertEquals(out, []);
  assert(!called); // no bare full-text search → the name-drop fraud guard holds
});

Deno.test("fetchDatedOpenFda maps a dated label list to WatchSources", async () => {
  const fetchImpl = (url: string) => {
    assert(url.includes("effective_time")); // dated search present
    return Promise.resolve(jsonResponse({
      results: [{ set_id: "spl-1", effective_time: "20260212", openfda: { generic_name: ["atorvastatin"] } }],
    }));
  };
  const out = await fetchDatedOpenFda({ mentions: ["atorvastatin"], since: SINCE, until: UNTIL, max: 5, fetchImpl });
  assertEquals(out.length, 1);
  assertEquals(out[0].provider, "openfda");
  assertEquals(out[0].provider_id, "spl-1:20260212"); // version-aware key (set_id + effective_time)
});

// ── the registry fan-out: merge + first-wins dedupe + fault tolerance ─────────────────────────
Deno.test("gatherDatedCandidates merges the sources, dedupes by key, and survives one source failing", async () => {
  const fetchImpl = (url: string) => {
    if (url.includes("esearch")) return Promise.resolve(jsonResponse({ esearchresult: { idlist: ["42308439"], count: "1" } }));
    if (url.includes("efetch")) return Promise.resolve(new Response(PUBMED_XML, { status: 200 }));
    if (url.includes("clinicaltrials")) throw new Error("CT.gov down"); // one source fails…
    if (url.includes("api.fda.gov")) {
      return Promise.resolve(jsonResponse({
        results: [{ set_id: "spl-1", effective_time: "20260212", openfda: { generic_name: ["semaglutide"] } }],
      }));
    }
    return Promise.resolve(jsonResponse({}));
  };
  const out = await gatherDatedCandidates({
    query: "semaglutide",
    mentions: ["semaglutide"],
    since: SINCE,
    until: UNTIL,
    fetchImpl,
  });
  const keys = out.map(sourceKey).sort();
  // …the other two still return (fault tolerance), deduped by provider:provider_id (openFDA key is version-aware)
  assertEquals(keys, ["openfda:spl-1:20260212", "pubmed_oa:42308439"]);
});

// ── reviewer-prescribed coverage: the headline guarantees (timeout, non-200 branches, dedupe) ──
Deno.test("gatherDatedCandidates: a source that HANGS resolves to [] after the timeout (can't sink a cycle)", async () => {
  const hang = () => new Promise<Response>(() => {}); // never resolves
  const out = await gatherDatedCandidates({
    query: "semaglutide",
    mentions: ["semaglutide"],
    since: SINCE,
    until: UNTIL,
    timeoutMs: 50,
    fetchImpl: hang,
  });
  assertEquals(out, []);
});

Deno.test("fetchDatedClinicalTrials is fault-tolerant: a non-200 yields [] (never throws)", async () => {
  const fetchImpl = () => Promise.resolve(new Response("err", { status: 500 }));
  assertEquals(await fetchDatedClinicalTrials({ query: "x", since: SINCE, max: 10, fetchImpl }), []);
});

Deno.test("fetchDatedOpenFda: a 404 (openFDA 'no matches') yields [] without throwing", async () => {
  const fetchImpl = () => Promise.resolve(new Response("not found", { status: 404 }));
  assertEquals(await fetchDatedOpenFda({ mentions: ["x"], since: SINCE, until: UNTIL, max: 5, fetchImpl }), []);
});

Deno.test("fetchDatedOpenFda is fault-tolerant: a non-200 non-404 yields []", async () => {
  const fetchImpl = () => Promise.resolve(new Response("err", { status: 500 }));
  assertEquals(await fetchDatedOpenFda({ mentions: ["x"], since: SINCE, until: UNTIL, max: 5, fetchImpl }), []);
});

Deno.test("fetchDatedPubMed is fault-tolerant: esearch ok but efetch non-200 yields []", async () => {
  const fetchImpl = (url: string) =>
    url.includes("esearch")
      ? Promise.resolve(jsonResponse({ esearchresult: { idlist: ["1"], count: "1" } }))
      : Promise.resolve(new Response("err", { status: 500 })); // efetch fails
  assertEquals(await fetchDatedPubMed({ query: "x", since: SINCE, until: UNTIL, max: 5, fetchImpl }), []);
});

Deno.test("gatherDatedCandidates: the SAME key from two sources collapses to one (first-wins)", async () => {
  // PubMed and CT.gov both surface the same provider:provider_id → exercises the dedupe DROP branch.
  const fetchImpl = (url: string) => {
    if (url.includes("esearch")) return Promise.resolve(jsonResponse({ esearchresult: { idlist: ["42308439"], count: "1" } }));
    if (url.includes("efetch")) return Promise.resolve(new Response(PUBMED_XML, { status: 200 }));
    if (url.includes("clinicaltrials")) {
      // a (contrived) study that normalizes to the SAME key as the PubMed hit
      return Promise.resolve(jsonResponse({
        studies: [{ protocolSection: { identificationModule: { nctId: "42308439", briefTitle: "dupe" } } }],
      }));
    }
    return Promise.resolve(jsonResponse({ results: [] }));
  };
  const out = await gatherDatedCandidates({ query: "q", mentions: [], since: SINCE, until: UNTIL, fetchImpl });
  // pubmed_oa:42308439 and clinicaltrials:42308439 are DIFFERENT keys (provider differs) → both kept.
  assertEquals(out.length, 2);
  // now force a true collision: two openFDA labels with identical set_id+effective_time within a cycle
  const dupeFda = (url: string) =>
    url.includes("api.fda.gov")
      ? Promise.resolve(jsonResponse({
        results: [
          { set_id: "s", effective_time: "20260101", openfda: { generic_name: ["d"] } },
          { set_id: "s", effective_time: "20260101", openfda: { generic_name: ["d"] } },
        ],
      }))
      : Promise.resolve(jsonResponse({ esearchresult: { idlist: [], count: "0" } }));
  const out2 = await gatherDatedCandidates({ query: "q", mentions: ["d"], since: SINCE, until: UNTIL, fetchImpl: dupeFda });
  assertEquals(out2.length, 1); // the duplicate is dropped
});
