// Unit test for the suggestion→watch-fields mapping. No runner is wired into the web build, so run ad hoc:
//   npx tsx lib/entity.test.ts            (from apps/web)
// Exercises the pure logic the Monitor picker depends on: a picked suggestion (catalog drug OR a
// MeSH-resolved entity) → a precise, scoped topic-watch. The browser wiring is verified by screenshot.
import assert from "node:assert/strict";
import type { EntitySuggestion } from "@nemesis/shared";
import { isCatalogDrug, watchFieldsFromEntity } from "./entity";

const mk = (over: Partial<EntitySuggestion>): EntitySuggestion => ({
  kind: "drug", source: "catalog", id: "x", name: "X", subtitle: null, score: 1, ...over,
});

// Catalog drug with a brand alias → mentions carries generic + brand (deduped); canonical name drives the rest.
{
  const f = watchFieldsFromEntity(mk({ name: "Semaglutide", subtitle: "Ozempic" }));
  assert.equal(f.title, "Semaglutide");
  assert.equal(f.topic, "Semaglutide");
  assert.equal(f.query_terms, "Semaglutide");
  assert.deepEqual(f.mentions, ["Semaglutide", "Ozempic"]);
}

// Catalog drug with no brand → mentions is just the generic name.
{
  const f = watchFieldsFromEntity(mk({ name: "Tesamorelin", subtitle: null }));
  assert.deepEqual(f.mentions, ["Tesamorelin"]);
}

// Name == brand → deduped to one mention.
{
  const f = watchFieldsFromEntity(mk({ name: "Creatine", subtitle: "Creatine" }));
  assert.deepEqual(f.mentions, ["Creatine"]);
}

// A catalog 'topic' (a class/company, which catalogToSuggestion maps to kind topic) → no name-scope.
{
  const f = watchFieldsFromEntity(mk({ kind: "topic", name: "GLP-1 agonists", subtitle: null }));
  assert.deepEqual(f.mentions, []);
  assert.equal(f.query_terms, "GLP-1 agonists");
}

// A MeSH condition → no name-scope; query_terms is the canonical descriptor, NOT expanded with synonyms.
{
  const f = watchFieldsFromEntity(mk({ kind: "condition", source: "mesh", id: "68003920", name: "Diabetes Mellitus", subtitle: "Diabetes, Diabetes Mellitus" }));
  assert.deepEqual(f.mentions, []);
  assert.equal(f.query_terms, "Diabetes Mellitus");
}

// A MeSH DRUG → still no name-scope: synonyms (Ozempic…) must NOT leak into the openFDA scope from MeSH.
{
  const f = watchFieldsFromEntity(mk({ kind: "drug", source: "mesh", id: "68", name: "Semaglutide", subtitle: "Ozempic, Rybelsus" }));
  assert.deepEqual(f.mentions, [], "a MeSH-sourced drug does not populate the openFDA name-scope");
}

// Whitespace is trimmed on every field.
{
  const f = watchFieldsFromEntity(mk({ name: "  Metformin  ", subtitle: "  Glucophage  " }));
  assert.equal(f.topic, "Metformin");
  assert.deepEqual(f.mentions, ["Metformin", "Glucophage"]);
}

// Full brand_names (from a get_drug fetch) → mentions carries generic + ALL brands, not just the single
// catalog subtitle alias. This is the brand-coverage fix: a one-alias scope misses sibling brands.
{
  const f = watchFieldsFromEntity(
    mk({ name: "Semaglutide", subtitle: "Ozempic" }),
    ["Ozempic", "Wegovy", "Rybelsus"],
  );
  assert.deepEqual(f.mentions, ["Semaglutide", "Ozempic", "Wegovy", "Rybelsus"]);
}

// A supplied brand list takes precedence over the subtitle alias (subtitle ignored when brands present).
{
  const f = watchFieldsFromEntity(
    mk({ name: "Adalimumab", subtitle: "Humira" }),
    ["Humira", "Amjevita", "Hyrimoz"],
  );
  assert.deepEqual(f.mentions, ["Adalimumab", "Humira", "Amjevita", "Hyrimoz"]);
}

// Brand list that repeats the generic or has blank entries → deduped + trimmed.
{
  const f = watchFieldsFromEntity(mk({ name: "Creatine", subtitle: null }), ["  Creatine  ", "", "Creapure"]);
  assert.deepEqual(f.mentions, ["Creatine", "Creapure"]);
}

// Empty brand list → falls back to the subtitle alias.
{
  const f = watchFieldsFromEntity(mk({ name: "Insulin glargine", subtitle: "Lantus" }), []);
  assert.deepEqual(f.mentions, ["Insulin glargine", "Lantus"]);
}

// Comma-joined subtitle fallback (no brand list supplied) → split into separate mentions.
{
  const f = watchFieldsFromEntity(mk({ name: "Semaglutide", subtitle: "Ozempic, Wegovy, Rybelsus" }));
  assert.deepEqual(f.mentions, ["Semaglutide", "Ozempic", "Wegovy", "Rybelsus"]);
}

// A MeSH entity ignores any supplied brand list (no openFDA name-scope from a non-catalog pick).
{
  const f = watchFieldsFromEntity(mk({ kind: "device", source: "mesh", name: "Insulin Infusion Systems", subtitle: null }), ["Ozempic"]);
  assert.deepEqual(f.mentions, []);
}

// Defensive: a non-array brand_names (RPC schema drift past the unchecked cast) must NOT be spread into
// its characters — it falls back to the safe subtitle alias instead.
{
  const f = watchFieldsFromEntity(
    mk({ name: "Semaglutide", subtitle: "Ozempic" }),
    "Wegovy" as unknown as string[],
  );
  assert.deepEqual(f.mentions, ["Semaglutide", "Ozempic"]);
}

// isCatalogDrug gates which picks fetch a brand list.
assert.equal(isCatalogDrug(mk({ source: "catalog", kind: "drug" })), true);
assert.equal(isCatalogDrug(mk({ source: "mesh", kind: "drug" })), false, "a MeSH drug is not a catalog drug");
assert.equal(isCatalogDrug(mk({ source: "catalog", kind: "topic" })), false);
assert.equal(isCatalogDrug(mk({ source: "mesh", kind: "condition" })), false);

console.log("entity.test.ts OK");
