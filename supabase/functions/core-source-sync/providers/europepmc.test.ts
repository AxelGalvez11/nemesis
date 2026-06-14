import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bestFullTextUrl, type EpmcFullTextUrl } from "./europepmc.ts";

// Europe PMC returns a fullTextUrlList per article. We surface the best FREE full-text link (a LINK
// to free full text, not text we ground). Prefer a readable HTML article page, then PDF; only "Free"
// (availabilityCode "F") locations count; undefined when nothing free is offered.

// Captured from a live `resultType=core` response (dexamethasone COVID PMC9226592).
const FREE_LIST: EpmcFullTextUrl[] = [
  { availability: "Free", availabilityCode: "F", documentStyle: "html", site: "PubMedCentral", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9226592/?tool=EBI" },
  { availability: "Free", availabilityCode: "F", documentStyle: "pdf", site: "PubMedCentral", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9226592/pdf/?tool=EBI" },
  { availability: "Free", availabilityCode: "F", documentStyle: "html", site: "Europe_PMC", url: "https://europepmc.org/articles/PMC9226592" },
];

Deno.test("bestFullTextUrl prefers a free HTML article page", () => {
  assertEquals(bestFullTextUrl(FREE_LIST), "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9226592/?tool=EBI");
});

Deno.test("bestFullTextUrl falls back to a free PDF when no HTML is offered", () => {
  const pdfOnly: EpmcFullTextUrl[] = [
    { availability: "Free", availabilityCode: "F", documentStyle: "pdf", site: "PubMedCentral", url: "https://x/a.pdf" },
  ];
  assertEquals(bestFullTextUrl(pdfOnly), "https://x/a.pdf");
});

Deno.test("bestFullTextUrl returns undefined when nothing is free (subscription only / empty)", () => {
  const paywalled: EpmcFullTextUrl[] = [
    { availability: "Subscription required", availabilityCode: "S", documentStyle: "html", site: "Publisher", url: "https://paywall/x" },
  ];
  assertEquals(bestFullTextUrl(paywalled), undefined);
  assertEquals(bestFullTextUrl([]), undefined);
  assertEquals(bestFullTextUrl(undefined), undefined);
});
