import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { AnswerSections } from "../../../packages/shared/src/answer.ts";
import type { RetrievedChunk } from "./citation.ts";
import { evidenceRole, rateSourceSupport, relationForSupport } from "./source-support.ts";

const sections: AnswerSections = {
  what_we_know: [
    {
      text: "The label warns about gastrointestinal adverse reactions.",
      citation_ids: ["1"],
      support: [{ citation_tag: "1", quote: "Gastrointestinal adverse reactions have been reported." }],
    },
    {
      text: "A randomized trial reported lower HbA1c with semaglutide.",
      citation_ids: ["2"],
    },
  ],
  what_we_do_not_know: [],
  safety_notes: [],
  questions_to_ask: [],
};

function chunk(extra: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    tag: "1",
    chunk_id: "c",
    source_id: "s",
    provider: "pubmed_oa",
    title: "source",
    section: null,
    url: null,
    license: null,
    published_date: null,
    retrieved_at: null,
    similarity: 0.7,
    chunk_text: "Gastrointestinal adverse reactions have been reported.",
    ...extra,
  };
}

Deno.test("evidenceRole marks official labels as high-weight regulatory sources", () => {
  const role = evidenceRole(chunk({ provider: "openfda" }));
  assertEquals(role.role, "official_label");
  assertEquals(role.weight, 92);
});

Deno.test("evidenceRole marks randomized controlled trials from publication types", () => {
  const role = evidenceRole(chunk({ publication_types: ["Randomized Controlled Trial", "Journal Article"] }));
  assertEquals(role.role, "randomized_trial");
});

Deno.test("evidenceRole treats MedlinePlus as high-value consumer-health guidance", () => {
  const role = evidenceRole(chunk({ provider: "medlineplus" }));
  assertEquals(role.role, "consumer_health");
  assertEquals(role.weight, 76);
});

Deno.test("rateSourceSupport gives direct support when a verbatim support quote exists", () => {
  const ratings = rateSourceSupport([
    chunk({ tag: "1", provider: "openfda" }),
  ], sections);
  const r = ratings.get("1")!;
  assertEquals(r.support_level, "direct");
  assertEquals(r.claim_relation, "supports");
  assertEquals(r.evidence_role, "official_label");
});

Deno.test("rateSourceSupport labels uncited reranked sources as reviewed", () => {
  const ratings = rateSourceSupport([
    chunk({ tag: "3", provider: "medlineplus" }),
  ], sections);
  const r = ratings.get("3")!;
  assertEquals(r.support_level, "reviewed");
  assertEquals(r.claim_relation, "reviewed");
  assertEquals(r.evidence_role, "consumer_health");
});

Deno.test("relationForSupport maps legacy support levels into claim relations", () => {
  assertEquals(relationForSupport("direct"), "supports");
  assertEquals(relationForSupport("partial"), "partial");
  assertEquals(relationForSupport("weak"), "mentions");
  assertEquals(relationForSupport("background"), "mentions");
  assertEquals(relationForSupport(undefined), "reviewed");
});
