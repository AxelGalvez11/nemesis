// Unit test for the entity→watch-fields mapping. No runner is wired into the web build, so run ad hoc:
//   npx tsx lib/entity.test.ts            (from apps/web)
// Exercises the pure logic the Monitor entity picker depends on: a picked catalog entity (search_entities
// result) → a precise, scoped topic-watch. The browser wiring is verified by screenshot, not here.
import assert from "node:assert/strict";
import type { SearchResult } from "@pharmabro/shared";
import { watchFieldsFromEntity } from "./entity";

const mk = (over: Partial<SearchResult>): SearchResult => ({
  type: "drug", id: "x", name: "X", subtitle: null, status: "approved", score: 1, ...over,
});

// Drug with a brand alias → mentions carries generic + brand (deduped); canonical name drives the rest.
{
  const f = watchFieldsFromEntity(mk({ type: "drug", name: "Semaglutide", subtitle: "Ozempic" }));
  assert.equal(f.title, "Semaglutide");
  assert.equal(f.topic, "Semaglutide");
  assert.equal(f.query_terms, "Semaglutide");
  assert.deepEqual(f.mentions, ["Semaglutide", "Ozempic"]);
}

// Drug-like with no brand → mentions is just the generic name.
{
  const f = watchFieldsFromEntity(mk({ type: "peptide", name: "Tesamorelin", subtitle: null }));
  assert.deepEqual(f.mentions, ["Tesamorelin"]);
}

// Name == brand → deduped to one mention.
{
  const f = watchFieldsFromEntity(mk({ type: "supplement", name: "Creatine", subtitle: "Creatine" }));
  assert.deepEqual(f.mentions, ["Creatine"]);
}

// Class / company → no drug name-scope (openFDA stays empty); evidence still flows via query_terms.
{
  const f = watchFieldsFromEntity(mk({ type: "class", name: "GLP-1 agonists", subtitle: null }));
  assert.deepEqual(f.mentions, []);
  assert.equal(f.query_terms, "GLP-1 agonists");
}

// Whitespace is trimmed on every field.
{
  const f = watchFieldsFromEntity(mk({ type: "drug", name: "  Metformin  ", subtitle: "  Glucophage  " }));
  assert.equal(f.topic, "Metformin");
  assert.deepEqual(f.mentions, ["Metformin", "Glucophage"]);
}

console.log("entity.test.ts OK");
