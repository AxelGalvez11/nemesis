// Unit tests for openFdaSearch — the field-scoped openFDA query builder. A bare full-text openFDA
// search matched FRAUDULENT name-drop products (e.g. "slimming patches" for investigational
// retatrutide); field-scoping to generic/brand NAME excludes them. These lock that behavior.
// Run: deno test supabase/functions/ask/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { openFdaSearch } from "./live-sources.ts";

Deno.test("single drug → generic OR brand, quoted", () => {
  assertEquals(
    openFdaSearch("lisinopril", ["lisinopril"]),
    `openfda.generic_name:"lisinopril" OR openfda.brand_name:"lisinopril"`,
  );
});

Deno.test("two drugs (interaction) → both OR'd across generic+brand", () => {
  const q = openFdaSearch("lisinopril spironolactone", ["lisinopril", "spironolactone"]);
  assertEquals(
    q,
    `openfda.generic_name:"lisinopril" OR openfda.brand_name:"lisinopril" OR openfda.generic_name:"spironolactone" OR openfda.brand_name:"spironolactone"`,
  );
});

Deno.test("never falls back to bare full-text when a drug was named", () => {
  // The fraudulent-product bug was a BARE term hitting the full-text index. As long as a drug name
  // is present, the query MUST be field-scoped (contain a field selector), never the raw term alone.
  const q = openFdaSearch("retatrutide", ["retatrutide"]);
  assert(q !== null, "a named drug must produce a field-scoped query, never null");
  assert(q.includes("openfda.generic_name:") && q.includes("openfda.brand_name:"));
  assert(!/^retatrutide$/.test(q));
});

Deno.test("multi-word drug name is phrase-quoted (no loose-token match)", () => {
  const q = openFdaSearch("insulin glargine", ["insulin glargine"]);
  assert(q !== null);
  assert(q.includes(`"insulin glargine"`), "multi-word name must stay a quoted phrase");
});

Deno.test("a name containing a quote is escaped (no query injection)", () => {
  const q = openFdaSearch(`a"b`, [`a"b`]);
  assert(q !== null);
  assert(q.includes(`"a\\"b"`), "embedded quote must be escaped via JSON.stringify");
});

Deno.test("no mentions → null (caller SKIPS openFDA; no bare free-text fallback)", () => {
  // A general, non-drug question names no drug. Returning null tells the caller to skip openFDA
  // entirely rather than run a bare free-text search — that free-text path is exactly what admitted
  // the fraudulent name-drop products. The other live sources still handle the free-text query.
  assertEquals(openFdaSearch("how do GLP-1 drugs work", []), null);
});

Deno.test("blank/whitespace mentions are ignored → null (skip openFDA)", () => {
  assertEquals(openFdaSearch("raw q", ["", "   "]), null);
});
