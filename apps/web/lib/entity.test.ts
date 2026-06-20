// Unit test for the entity→watch-fields mapping. No runner is wired into the web build, so run ad hoc:
//   npx tsx lib/entity.test.ts            (from apps/web)
// Exercises the pure logic the Monitor entity picker depends on: a picked catalog entity (search_entities
// result) → a precise, scoped topic-watch. The browser wiring is verified by screenshot, not here.
import assert from "node:assert/strict";
import type { SearchResult } from "@pharmabro/shared";
import { isDrugLikeEntity, watchFieldsFromEntity } from "./entity";

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

// Full brand_names (from a get_drug fetch) → mentions carries generic + ALL brands, not just the single
// search_entities subtitle alias. This is the brand-coverage fix: a one-alias scope misses sibling brands.
{
  const f = watchFieldsFromEntity(
    mk({ type: "drug", name: "Semaglutide", subtitle: "Ozempic" }),
    ["Ozempic", "Wegovy", "Rybelsus"],
  );
  assert.deepEqual(f.mentions, ["Semaglutide", "Ozempic", "Wegovy", "Rybelsus"]);
}

// A supplied brand list takes precedence over the subtitle alias (subtitle ignored when brands present).
{
  const f = watchFieldsFromEntity(
    mk({ type: "drug", name: "Adalimumab", subtitle: "Humira" }),
    ["Humira", "Amjevita", "Hyrimoz"],
  );
  assert.deepEqual(f.mentions, ["Adalimumab", "Humira", "Amjevita", "Hyrimoz"]);
}

// Brand list that repeats the generic or has blank entries → deduped + trimmed.
{
  const f = watchFieldsFromEntity(
    mk({ type: "drug", name: "Creatine", subtitle: null }),
    ["  Creatine  ", "", "Creapure"],
  );
  assert.deepEqual(f.mentions, ["Creatine", "Creapure"]);
}

// Empty brand list → falls back to the subtitle alias.
{
  const f = watchFieldsFromEntity(mk({ type: "drug", name: "Insulin glargine", subtitle: "Lantus" }), []);
  assert.deepEqual(f.mentions, ["Insulin glargine", "Lantus"]);
}

// Comma-joined subtitle fallback (no brand list supplied) → split into separate mentions.
{
  const f = watchFieldsFromEntity(mk({ type: "drug", name: "Semaglutide", subtitle: "Ozempic, Wegovy, Rybelsus" }));
  assert.deepEqual(f.mentions, ["Semaglutide", "Ozempic", "Wegovy", "Rybelsus"]);
}

// Non-drug-like ignores any supplied brand list (no openFDA name-scope).
{
  const f = watchFieldsFromEntity(mk({ type: "company", name: "Novo Nordisk", subtitle: null }), ["Ozempic"]);
  assert.deepEqual(f.mentions, []);
}

// Defensive: a non-array brand_names (RPC schema drift past the unchecked cast) must NOT be spread into
// its characters — it falls back to the safe subtitle alias instead.
{
  const f = watchFieldsFromEntity(
    mk({ type: "drug", name: "Semaglutide", subtitle: "Ozempic" }),
    "Wegovy" as unknown as string[],
  );
  assert.deepEqual(f.mentions, ["Semaglutide", "Ozempic"]);
}

// isDrugLikeEntity gates which picks fetch a brand list.
assert.equal(isDrugLikeEntity("drug"), true);
assert.equal(isDrugLikeEntity("supplement"), true);
assert.equal(isDrugLikeEntity("peptide"), true);
assert.equal(isDrugLikeEntity("biologic"), true);
assert.equal(isDrugLikeEntity("class"), false);
assert.equal(isDrugLikeEntity("company"), false);

console.log("entity.test.ts OK");
