import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildEvidenceMap } from "./evidence-map-points.ts";
import type { Citation } from "./answer.ts";

const cite = (over: Partial<Citation>): Citation => ({
  chunk_tag: "1", source_id: "s", source_type: "pubmed_oa", title: "T", section: null,
  url: null, license: null, published_date: "2020-01-01", retrieved_at: null, ...over,
});

Deno.test("buildEvidenceMap scales year→x and weight→y within the box", () => {
  const m = buildEvidenceMap(
    [cite({ chunk_tag: "1", year: "2010", evidence_weight: 20 }), cite({ chunk_tag: "2", year: "2024", evidence_weight: 90 })],
    [cite({ chunk_tag: "3", year: "2017", evidence_weight: 55 })],
    600, 300,
  );
  if (!m) throw new Error("expected a map");
  assertEquals(m.years, [2010, 2024]);
  const [a, b, c] = m.points;
  assertEquals(a.x < c.x && c.x < b.x, true);   // chronological left→right
  assertEquals(b.y < a.y, true);                 // higher weight = higher on the chart (smaller y)
  assertEquals(a.cited, true);
  assertEquals(c.cited, false);
});

Deno.test("buildEvidenceMap returns null under 3 datable sources", () => {
  assertEquals(buildEvidenceMap([cite({})], [], 600, 300), null);
});
