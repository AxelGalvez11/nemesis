import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPubMedTerm, espellCorrect, parsePubMedXml } from "./pubmed.ts";

/** Build a fake fetch that records every URL it's asked for and returns canned Responses in order. */
function recordingFetch(
  responses: Array<Response | Error>,
): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  let i = 0;
  const fetchImpl = ((url: string | URL | Request) => {
    urls.push(String(url));
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next.clone());
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
}

const espellXml = (corrected: string) =>
  `<?xml version="1.0"?><eSpellResult><Database>pubmed</Database><Query>q</Query><CorrectedQuery>${corrected}</CorrectedQuery></eSpellResult>`;

const XML = `
<PubmedArticleSet><PubmedArticle>
<MedlineCitation><PMID>12345</PMID>
<Article>
<Journal><ISSN IssnType="Print">0028-4793</ISSN><Title>The New England Journal of Medicine</Title>
<ISOAbbreviation>N Engl J Med</ISOAbbreviation>
<JournalIssue><Volume>390</Volume><Issue>2</Issue><PubDate><Year>2024</Year></PubDate></JournalIssue></Journal>
<ArticleTitle>Tesamorelin in HIV lipodystrophy.</ArticleTitle>
<Pagination><MedlinePgn>101-110</MedlinePgn></Pagination>
<Abstract><AbstractText>Tesamorelin reduced visceral fat.</AbstractText></Abstract>
<AuthorList>
<Author><LastName>Falutz</LastName><ForeName>Julian</ForeName><Initials>J</Initials></Author>
<Author><LastName>Mamputu</LastName><ForeName>Jean-Claude</ForeName><Initials>JC</Initials></Author>
</AuthorList>
<PublicationTypeList>
<PublicationType>Randomized Controlled Trial</PublicationType>
<PublicationType>Journal Article</PublicationType>
</PublicationTypeList>
</Article>
<MeshHeadingList><MeshHeading><DescriptorName>Humans</DescriptorName></MeshHeading></MeshHeadingList>
</MedlineCitation>
</PubmedArticle></PubmedArticleSet>`;

Deno.test("parsePubMedXml captures bibliographic + publication-type metadata", () => {
  const [a] = parsePubMedXml(XML);
  assertEquals(a.pmid, "12345");
  assertEquals(a.journal, "The New England Journal of Medicine");
  assertEquals(a.journal_iso, "N Engl J Med");
  assertEquals(a.issn, ["0028-4793"]);
  assertEquals(a.volume, "390");
  assertEquals(a.issue, "2");
  assertEquals(a.pages, "101-110");
  assertEquals(a.year, 2024);
  assertEquals(a.authors, ["Falutz J", "Mamputu JC"]);
  assertEquals(a.publication_types, ["Randomized Controlled Trial", "Journal Article"]);
});

Deno.test("buildPubMedTerm: default search is broad — paywalled (abstract-indexed) papers included", () => {
  // The fetch only ever pulls the abstract, so the old `free full text[sb]` filter dropped citable
  // paywalled abstracts for no gain. Broad is the default; OA-only is opt-in.
  assertEquals(buildPubMedTerm("metformin AND lactic acidosis", false), "metformin AND lactic acidosis");
});

Deno.test("buildPubMedTerm: oaOnly opt-in re-applies the free-full-text filter", () => {
  assertEquals(buildPubMedTerm("metformin", true), "metformin AND free full text[sb]");
});

Deno.test("espellCorrect: returns the NCBI correction for a misspelled topic", async () => {
  const { fetchImpl, urls } = recordingFetch([new Response(espellXml("metformin liver"), { status: 200 })]);
  const out = await espellCorrect("metfromin livr", { fetchImpl, apiKey: "" });
  assertEquals(out, "metformin liver");
  // hit the espell endpoint against db=pubmed
  assertEquals(urls.length, 1);
  assertEquals(urls[0].includes("espell.fcgi"), true);
  assertEquals(urls[0].includes("db=pubmed"), true);
});

Deno.test("espellCorrect: keeps the original when the correction only differs in case", async () => {
  const { fetchImpl } = recordingFetch([new Response(espellXml("Metformin"), { status: 200 })]);
  const out = await espellCorrect("metformin", { fetchImpl, apiKey: "" });
  assertEquals(out, "metformin");
});

Deno.test("espellCorrect: keeps the original when NCBI returns an empty correction", async () => {
  const { fetchImpl } = recordingFetch([new Response(espellXml(""), { status: 200 })]);
  const out = await espellCorrect("ozempic heart", { fetchImpl, apiKey: "" });
  assertEquals(out, "ozempic heart");
});

Deno.test("espellCorrect: skips the network call for very short queries", async () => {
  const { fetchImpl, urls } = recordingFetch([new Response(espellXml("x"), { status: 200 })]);
  const out = await espellCorrect("ab", { fetchImpl, apiKey: "" });
  assertEquals(out, "ab");
  assertEquals(urls.length, 0); // never called NCBI
});

Deno.test("espellCorrect: returns the original on a network error (best-effort, never throws)", async () => {
  const { fetchImpl } = recordingFetch([new Error("network down")]);
  const out = await espellCorrect("metfromin", { fetchImpl, apiKey: "" });
  assertEquals(out, "metfromin");
});

Deno.test("espellCorrect: returns the original on an HTTP error with no key", async () => {
  const { fetchImpl, urls } = recordingFetch([new Response("", { status: 429 })]);
  const out = await espellCorrect("metfromin", { fetchImpl, apiKey: "" });
  assertEquals(out, "metfromin");
  assertEquals(urls.length, 1); // no key → no unauthenticated retry
});

Deno.test("espellCorrect: a 400 from a bad key retries unauthenticated (bad key never worse than no key)", async () => {
  const { fetchImpl, urls } = recordingFetch([
    new Response("API key invalid", { status: 400 }),
    new Response(espellXml("semaglutide"), { status: 200 }),
  ]);
  const out = await espellCorrect("semaglutid", { fetchImpl, apiKey: "BADKEY" });
  assertEquals(out, "semaglutide");
  assertEquals(urls.length, 2);
  assertEquals(urls[0].includes("api_key=BADKEY"), true); // first try carried the key
  assertEquals(urls[1].includes("api_key="), false); // retry dropped it
});
