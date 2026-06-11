import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isDoajVetted, normalizeIssn } from "./doaj-registry.ts";

Deno.test("normalizeIssn canonicalizes hyphenless + mixed-case ISSNs", () => {
  assertEquals(normalizeIssn("1932-6203"), "1932-6203");
  assertEquals(normalizeIssn("19326203"), "1932-6203"); // hyphenless
  assertEquals(normalizeIssn("2049-368x"), "2049-368X"); // lowercase check digit
  assertEquals(normalizeIssn(" 1932-6203 "), "1932-6203"); // stray whitespace
  assertEquals(normalizeIssn(""), "");
  assertEquals(normalizeIssn(undefined), "");
  assertEquals(normalizeIssn("not-an-issn"), "");
  assertEquals(normalizeIssn("123-456"), ""); // too short
});

Deno.test("isDoajVetted flags DOAJ-listed open-access journals", () => {
  assert(isDoajVetted(["1932-6203"]), "PLoS ONE is DOAJ-listed");
  assert(isDoajVetted(["2044-6055"]), "BMJ Open is DOAJ-listed");
  assert(isDoajVetted(["19326203"]), "matches even hyphenless");
});

Deno.test("isDoajVetted does NOT flag paywalled (non-DOAJ) journals", () => {
  assertEquals(isDoajVetted(["0028-4793"]), false); // New England Journal of Medicine
  assertEquals(isDoajVetted(["0140-6736"]), false); // The Lancet
});

Deno.test("isDoajVetted tolerates empty / garbage ISSN lists", () => {
  assertEquals(isDoajVetted([]), false);
  assertEquals(isDoajVetted([null, undefined, ""]), false);
  assertEquals(isDoajVetted(["garbage", "1932-6203"]), true); // one good ISSN among junk
});
