import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimRefMarker, referenceLines } from "./claim-refs.ts";
import type { Citation } from "./answer.ts";

Deno.test("claimRefMarker renders bracketed numeric tags", () => {
  assertEquals(claimRefMarker(["S1", "S3"]), " [1,3]");
  assertEquals(claimRefMarker([]), "");
  assertEquals(claimRefMarker(undefined), "");
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
