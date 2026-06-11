import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPubMedTerm, parsePubMedXml } from "./pubmed.ts";

const XML = `
<PubmedArticleSet><PubmedArticle>
<MedlineCitation><PMID>12345</PMID>
<Article>
<Journal><Title>The New England Journal of Medicine</Title>
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
