import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimRefMarker, referenceLines } from "./claim-refs.ts";
import type { Citation } from "./answer.ts";

Deno.test("claimRefMarker renders bracketed numeric tags", () => {
  assertEquals(claimRefMarker(["S1", "S3"]), " [1,3]");
  assertEquals(claimRefMarker([]), "");
  assertEquals(claimRefMarker(undefined), "");
});

Deno.test("claimRefMarker sorts ids ascending regardless of input order", () => {
  assertEquals(claimRefMarker(["3", "1"]), " [1,3]");
  assertEquals(claimRefMarker(["S7", "S3", "S1"]), " [1,3,7]");
});

Deno.test("claimRefMarker dedupes repeated ids (defense-in-depth; upstream validTags already dedupes)", () => {
  assertEquals(claimRefMarker(["1", "1", "3"]), " [1,3]");
});

const base: Omit<Citation, "chunk_tag" | "source_id" | "url"> = {
  source_type: "pubmed_oa",
  title: "A study",
  section: null,
  license: "cc_by",
  published_date: "2024-01-01",
  retrieved_at: "2026-06-10",
};

Deno.test("referenceLines numbers by chunk_tag digit, not array position (citations may arrive reranked)", () => {
  // Deliberately OUT of tag order — citations are "in reranked order", not tag order.
  const citations: Citation[] = [
    { ...base, chunk_tag: "S3", source_id: "live:pubmed_oa:3", url: "https://example.com/3", title: "Third source" },
    { ...base, chunk_tag: "S1", source_id: "live:pubmed_oa:1", url: "https://example.com/1", title: "First source" },
    { ...base, chunk_tag: "S2", source_id: "live:pubmed_oa:2", url: "https://example.com/2", title: "Second source" },
  ];
  const lines = referenceLines(citations, "vancouver");
  assertEquals(lines.length, 3);
  // Line "1." must describe the citation tagged S1, regardless of input array order.
  assertEquals(lines[0]!.startsWith("1."), true);
  assertEquals(lines[0]!.includes("First source"), true);
  assertEquals(lines[1]!.startsWith("2."), true);
  assertEquals(lines[1]!.includes("Second source"), true);
  assertEquals(lines[2]!.startsWith("3."), true);
  assertEquals(lines[2]!.includes("Third source"), true);
});

Deno.test("referenceLines numbers by tag digit (not position) on a non-contiguous tag set, so a marker for a gapped tag matches its reference line", () => {
  // Production ordinary case: buildCitations (supabase/functions/ask/research/orchestrate.ts)
  // keeps only the cited SUBSET of retrieval tags without renumbering, so gaps like {1,3,7}
  // are expected. Pass citations in scrambled (non-ascending) order to prove sort, not input
  // order, drives numbering.
  const citations: Citation[] = [
    { ...base, chunk_tag: "S7", source_id: "live:pubmed_oa:7", url: "https://example.com/7", title: "Seventh source" },
    { ...base, chunk_tag: "S1", source_id: "live:pubmed_oa:1", url: "https://example.com/1", title: "First source" },
    { ...base, chunk_tag: "S3", source_id: "live:pubmed_oa:3", url: "https://example.com/3", title: "Third source" },
  ];
  const lines = referenceLines(citations, "vancouver");
  assertEquals(lines.length, 3);
  assertEquals(lines[0]!.startsWith("1."), true);
  assertEquals(lines[0]!.includes("First source"), true);
  assertEquals(lines[1]!.startsWith("3."), true);
  assertEquals(lines[1]!.includes("Third source"), true);
  assertEquals(lines[2]!.startsWith("7."), true);
  assertEquals(lines[2]!.includes("Seventh source"), true);

  // A point citing only tag "7" must render marker " [7]" — and that number must equal the
  // leading number of the correct reference line (not a re-derived array position like "3.").
  const marker = claimRefMarker(["S7"]);
  assertEquals(marker, " [7]");
  const referencedLine = lines.find((l) => l.startsWith(`${marker.trim().replace(/[[\]]/g, "")}.`));
  assertEquals(referencedLine?.includes("Seventh source"), true);
});

Deno.test("referenceLines appends the URL when present", () => {
  const citations: Citation[] = [
    { ...base, chunk_tag: "S1", source_id: "live:pubmed_oa:1", url: "https://example.com/1" },
  ];
  const lines = referenceLines(citations, "vancouver");
  assertEquals(lines[0]!.endsWith(" — https://example.com/1"), true);
});

Deno.test("referenceLines omits the URL suffix when absent", () => {
  const citations: Citation[] = [
    { ...base, chunk_tag: "S1", source_id: "live:pubmed_oa:1", url: null },
  ];
  const lines = referenceLines(citations, "vancouver");
  assertEquals(lines[0]!.includes(" — "), false);
});

Deno.test("referenceLines on an empty citation list returns an empty array", () => {
  assertEquals(referenceLines([], "vancouver"), []);
});
