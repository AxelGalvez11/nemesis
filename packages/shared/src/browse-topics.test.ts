import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BROWSE_TOPICS,
  type BrowseCategory,
  groupBrowseTopics,
  watchFieldsFromBrowseTopic,
} from "./browse-topics.ts";

const CATEGORIES: BrowseCategory[] = ["drug", "condition", "class"];

Deno.test("BROWSE_TOPICS: every entry is well-formed (label, known category, non-empty query_terms)", () => {
  assertEquals(BROWSE_TOPICS.length > 0, true);
  for (const t of BROWSE_TOPICS) {
    assertEquals(t.label.trim().length > 0, true);
    assertEquals(CATEGORIES.includes(t.category), true);
    assertEquals(t.query_terms.trim().length > 0, true);
  }
});

Deno.test("BROWSE_TOPICS: labels are unique (no duplicate browse chips)", () => {
  const labels = BROWSE_TOPICS.map((t) => t.label.toLowerCase());
  assertEquals(new Set(labels).size, labels.length);
});

Deno.test("BROWSE_TOPICS: every drug carries mentions including its own label (openFDA name-scope)", () => {
  const drugs = BROWSE_TOPICS.filter((t) => t.category === "drug");
  assertEquals(drugs.length > 0, true);
  for (const d of drugs) {
    assertEquals((d.mentions ?? []).length > 0, true);
    const lower = (d.mentions ?? []).map((m) => m.toLowerCase());
    assertEquals(lower.includes(d.label.toLowerCase()), true);
  }
});

Deno.test("BROWSE_TOPICS: conditions and classes carry no drug mentions (no openFDA name-scope)", () => {
  for (const t of BROWSE_TOPICS) {
    if (t.category !== "drug") assertEquals(t.mentions ?? [], []);
  }
});

Deno.test("watchFieldsFromBrowseTopic: a drug → scoped watch with deduped mentions incl. the label", () => {
  const f = watchFieldsFromBrowseTopic({
    label: "Ozempic",
    category: "drug",
    query_terms: "semaglutide",
    mentions: ["Ozempic", "Wegovy", "ozempic"], // dupe (case) must collapse
  });
  assertEquals(f.title, "Ozempic");
  assertEquals(f.topic, "Ozempic");
  assertEquals(f.query_terms, "semaglutide");
  assertEquals(f.mentions, ["Ozempic", "Wegovy"]);
});

Deno.test("watchFieldsFromBrowseTopic: a condition → no mentions, query_terms preserved", () => {
  const f = watchFieldsFromBrowseTopic({
    label: "Type 2 diabetes",
    category: "condition",
    query_terms: "type 2 diabetes",
  });
  assertEquals(f.mentions, []);
  assertEquals(f.topic, "Type 2 diabetes");
  assertEquals(f.query_terms, "type 2 diabetes");
});

Deno.test("watchFieldsFromBrowseTopic: query_terms falls back to the label when blank", () => {
  const f = watchFieldsFromBrowseTopic({ label: "Statins", category: "class", query_terms: "  " });
  assertEquals(f.query_terms, "Statins");
});

Deno.test("groupBrowseTopics: returns the three non-empty categories in drug→condition→class order", () => {
  const groups = groupBrowseTopics();
  assertEquals(groups.map((g) => g.category), ["drug", "condition", "class"]);
  for (const g of groups) {
    assertEquals(g.topics.length > 0, true);
    assertEquals(g.topics.every((t) => t.category === g.category), true);
    assertEquals(g.label.trim().length > 0, true);
  }
});

Deno.test("groupBrowseTopics: drops a category with no members", () => {
  const groups = groupBrowseTopics([{ label: "Metformin", category: "drug", query_terms: "metformin", mentions: ["Metformin"] }]);
  assertEquals(groups.map((g) => g.category), ["drug"]);
});
