// Tests for balanceCitedSlice — the cited-slice rebalance that stops FDA labels from crowding out
// primary research. Run: deno test cite-balance.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { balanceCitedSlice, LABEL_SLICE_CAP } from "./cite-balance.ts";
import type { RetrievedChunk } from "./citation.ts";

function chunk(provider: string, id: string): RetrievedChunk {
  return {
    tag: id,
    chunk_id: id,
    chunk_text: "",
    source_id: id,
    provider,
    title: null,
    section: null,
    url: null,
    license: null,
    published_date: null,
    retrieved_at: null,
    similarity: 0,
  };
}

const labels = (n: number) => Array.from({ length: n }, (_, i) => chunk("openfda", `L${i}`));
const pubmed = (n: number) => Array.from({ length: n }, (_, i) => chunk("pubmed", `P${i}`));

// The core win: labels rank above research on the cross-encoder, but research still gets the floor.
Deno.test("balanceCitedSlice: caps the label family so research fills the rest of the slice", () => {
  const ordered = [...labels(10), ...pubmed(10)]; // labels out-rank pubmed
  const out = balanceCitedSlice(ordered, 12, 4);
  assertEquals(out.filter((c) => c.provider === "openfda").length, 4, "labels held to the cap");
  assertEquals(out.filter((c) => c.provider === "pubmed").length, 8, "research fills the remaining slots");
  assertEquals(out.length, 12);
});

// Safety net: a genuinely label-only retrieval must still show a full slice, not truncate to the cap.
Deno.test("balanceCitedSlice: backfills held labels when research is absent (never fewer than a plain slice)", () => {
  const out = balanceCitedSlice(labels(12), 12, 4);
  assertEquals(out.length, 12, "label-only query still shows a full slice");
  assertEquals(out.filter((c) => c.provider === "openfda").length, 12);
});

// Reorder-free within the kept set: a non-crowding mix is returned in the exact rerank order.
Deno.test("balanceCitedSlice: preserves rerank order when nothing is capped", () => {
  const ordered = [chunk("pubmed", "P0"), chunk("openfda", "L0"), chunk("clinicaltrials", "T0")];
  const out = balanceCitedSlice(ordered, 12, 4);
  assertEquals(out.map((c) => c.chunk_id), ["P0", "L0", "T0"]);
});

// Excess labels are deferred to the END, not dropped — relevance is preserved, just deprioritized.
Deno.test("balanceCitedSlice: moves above-cap labels after research instead of dropping them", () => {
  const ordered = [...labels(5), chunk("pubmed", "P0")]; // 5 labels, cap 4, 1 pubmed
  const out = balanceCitedSlice(ordered, 12, 4);
  assertEquals(out.map((c) => c.chunk_id), ["L0", "L1", "L2", "L3", "P0", "L4"]);
});

// FAERS is a distinct signal, not label prose — it must compete freely, not be capped with labels.
Deno.test("balanceCitedSlice: does not treat FAERS as a crowding label", () => {
  const ordered = [...Array.from({ length: 6 }, (_, i) => chunk("faers", `F${i}`)), ...pubmed(6)];
  const out = balanceCitedSlice(ordered, 12, 4);
  assertEquals(out.length, 12, "faers + pubmed both flow freely");
  assertEquals(out.filter((c) => c.provider === "faers").length, 6);
});

// The exported default is the value index.ts wires in; guard against an accidental edit.
Deno.test("LABEL_SLICE_CAP default is 4", () => {
  assertEquals(LABEL_SLICE_CAP, 4);
});
