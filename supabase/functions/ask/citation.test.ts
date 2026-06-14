// Tests for citation enforcement (§7 step 6). Pure function: given the model's
// raw answer (with possibly-hallucinated [n] tags) and the retrieved chunk set,
// drop tags that don't map to a real chunk, refuse when the bottom line has no
// valid support (AC3), and build the citations[] from survivors.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { citationMeta, collectSourceTexts, enforceCitations, type RetrievedChunk } from "./citation.ts";

function metaChunk(extra: Partial<RetrievedChunk>): RetrievedChunk {
  return { tag: "1", chunk_id: "c", source_id: "s", provider: "pubmed_oa", title: "t", section: null, url: null, license: null, published_date: null, retrieved_at: null, similarity: 0, ...extra };
}

Deno.test("citationMeta stamps doaj_vetted from a DOAJ-listed journal ISSN (positive-only)", () => {
  assertEquals(citationMeta(metaChunk({ issn: ["1932-6203"] })).doaj_vetted, true); // PLoS ONE — DOAJ-listed
  assertEquals(citationMeta(metaChunk({ issn: ["0028-4793"] })).doaj_vetted, undefined); // NEJM — not in DOAJ
  assertEquals(citationMeta(metaChunk({})).doaj_vetted, undefined); // no ISSN -> no claim
});

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

Deno.test("enforce: refuses only when NOTHING is cited (AC3)", () => {
  // Whole answer unsupported: bottom line + every body point cite nothing real.
  const inp = base();
  inp.bottom_line.citations = ["9"]; // hallucinated
  inp.what_we_know = [
    { text: "Unsupported claim A.", citations: [] },
    { text: "Unsupported claim B.", citations: ["9"] },
  ];
  inp.safety_notes = [{ text: "Unsupported safety note.", citations: [] }];
  const r = enforceCitations(inp);
  assertEquals(r.refusedUnsupported, true);
});

Deno.test("enforce: bottom line uncited but body cited is NOT refused (backfill)", () => {
  // The model often cites the detail points and leaves the summary bare; the
  // answer is still source-grounded, so attribute the bottom line to the body.
  const inp = base();
  inp.bottom_line.citations = []; // model left the summary uncited
  const r = enforceCitations(inp);
  assertEquals(r.refusedUnsupported, false);
  assert(r.citations.length >= 1); // body sources carry through
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

// ---------------------------------------------------------------------------
// collectSourceTexts — the include_source_text verification payload
// ---------------------------------------------------------------------------

Deno.test("collectSourceTexts: one verbatim entry per tagged chunk that has text", () => {
  const out = collectSourceTexts([
    { tag: "1", chunk_text: "Alpha label text." },
    { tag: "2", chunk_text: "Beta trial text." },
  ]);
  assertEquals(out, [
    { tag: "1", text: "Alpha label text." },
    { tag: "2", text: "Beta trial text." },
  ]);
});

Deno.test("collectSourceTexts: skips chunks with no/empty/whitespace text (nothing to verify)", () => {
  const out = collectSourceTexts([
    { tag: "1", chunk_text: "real" },
    { tag: "2", chunk_text: undefined },
    { tag: "3", chunk_text: "" },
    { tag: "4", chunk_text: "   " },
  ]);
  assertEquals(out.map((s) => s.tag), ["1"]);
});

Deno.test("collectSourceTexts: at most one entry per tag (first non-empty wins)", () => {
  const out = collectSourceTexts([
    { tag: "1", chunk_text: "first" },
    { tag: "1", chunk_text: "dup" },
  ]);
  assertEquals(out, [{ tag: "1", text: "first" }]);
});
