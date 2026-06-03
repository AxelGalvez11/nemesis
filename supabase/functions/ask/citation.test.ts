// Tests for citation enforcement (§7 step 6). Pure function: given the model's
// raw answer (with possibly-hallucinated [n] tags) and the retrieved chunk set,
// drop tags that don't map to a real chunk, refuse when the bottom line has no
// valid support (AC3), and build the citations[] from survivors.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceCitations, type RetrievedChunk } from "./citation.ts";

function chunks(): RetrievedChunk[] {
  return [
    { tag: "1", chunk_id: "c1", source_id: "s1", provider: "openfda", title: "Sertraline label",
      section: "WARNINGS", url: "https://openfda/1", license: "fda_public",
      published_date: "2024-01-01", retrieved_at: "2026-06-01T00:00:00Z", similarity: 0.74 },
    { tag: "2", chunk_id: "c2", source_id: "s2", provider: "pubmed_oa", title: "SSRI review",
      section: null, url: "https://pubmed/2", license: "ncbi", published_date: "2023-05-01",
      retrieved_at: "2026-05-01T00:00:00Z", similarity: 0.62 },
  ];
}

function base() {
  return {
    bottom_line: { text: "Sertraline is an SSRI with documented warnings.", citations: ["1"] },
    what_we_know: [
      { text: "The label warns about serotonin syndrome.", citations: ["1"] },
      { text: "A review summarizes SSRI tolerability.", citations: ["2"] },
    ],
    what_we_do_not_know: [{ text: "Long-term individualized risk is uncertain.", citations: [] }],
    safety_notes: [{ text: "Boxed warning notes suicidality risk in young adults.", citations: ["1"] }],
    questions_to_ask: ["Is this appropriate for me?"],
    chunks: chunks(),
  };
}

Deno.test("enforce: fully-cited answer is kept and not refused", () => {
  const r = enforceCitations(base());
  assertEquals(r.refusedUnsupported, false);
  assertEquals(r.answer_sections.what_we_know.length, 2);
  assertEquals(r.answer_sections.safety_notes.length, 1);
  // two distinct sources cited -> two citations
  assertEquals(r.citations.length, 2);
});

Deno.test("enforce: bracketed tags from the model resolve (e.g. '[1]' -> '1')", () => {
  // DeepSeek emits citations as ["[1]","[2]"]; the valid set is bare "1","2".
  const inp = base();
  inp.bottom_line.citations = ["[1]"];
  inp.what_we_know[0].citations = ["[1]", "[2]"];
  inp.what_we_know[1].citations = ["[2]"];
  inp.safety_notes[0].citations = ["[1]"];
  const r = enforceCitations(inp);
  assertEquals(r.refusedUnsupported, false); // bottom line "[1]" matched chunk "1"
  assertEquals(r.citations.length, 2);
  assertEquals(r.citations.map((c) => c.chunk_tag).sort(), ["1", "2"]);
});

Deno.test("enforce: hallucinated tag is dropped from a kept point", () => {
  const inp = base();
  inp.what_we_know[0].citations = ["1", "9"]; // 9 does not exist
  const r = enforceCitations(inp);
  const point = r.answer_sections.what_we_know.find((p) => p.text.includes("serotonin"))!;
  assertEquals(point.citation_ids, ["1"]); // 9 stripped
  assert(!r.citations.some((c) => c.chunk_tag === "9"));
});

Deno.test("enforce: bottom line with only a hallucinated tag refuses (AC3)", () => {
  const inp = base();
  inp.bottom_line.citations = ["9"]; // nothing real backs the claim
  const r = enforceCitations(inp);
  assertEquals(r.refusedUnsupported, true);
});

Deno.test("enforce: bottom line with no tags refuses (AC3)", () => {
  const inp = base();
  inp.bottom_line.citations = [];
  const r = enforceCitations(inp);
  assertEquals(r.refusedUnsupported, true);
});

Deno.test("enforce: an unsupported load-bearing point is dropped", () => {
  const inp = base();
  inp.what_we_know.push({ text: "It also reverses aging.", citations: [] }); // claim, no source
  const r = enforceCitations(inp);
  assert(!r.answer_sections.what_we_know.some((p) => p.text.includes("aging")));
});

Deno.test("enforce: limitations + questions are kept without citations", () => {
  const r = enforceCitations(base());
  assertEquals(r.answer_sections.what_we_do_not_know.length, 1);
  assertEquals(r.answer_sections.questions_to_ask.length, 1);
});

Deno.test("enforce: duplicate tags across points dedupe in citations[]", () => {
  const inp = base();
  inp.safety_notes[0].citations = ["1"]; // same source as bottom_line + what_we_know[0]
  const r = enforceCitations(inp);
  assertEquals(r.citations.filter((c) => c.chunk_tag === "1").length, 1);
});

Deno.test("enforce: oldest_source_date is the min across cited sources", () => {
  const r = enforceCitations(base());
  // s2 retrieved 2026-05-01 is older than s1 2026-06-01
  assertEquals(r.oldest_source_date, "2026-05-01");
});

Deno.test("enforce: plain_english_summary echoes the (supported) bottom line", () => {
  const r = enforceCitations(base());
  assert(r.plain_english_summary.includes("SSRI"));
});

Deno.test("enforce: a point with a missing citations array does not throw", () => {
  // DeepSeek can omit the (schema-required) citations field; must not crash.
  const inp = base();
  // deno-lint-ignore no-explicit-any
  (inp.what_we_know as any).push({ text: "Unsourced extra claim." });
  const r = enforceCitations(inp);
  assertEquals(r.refusedUnsupported, false);
  assert(!r.answer_sections.what_we_know.some((p) => p.text.includes("Unsourced extra")));
});
