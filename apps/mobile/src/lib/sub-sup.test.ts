// Deno unit tests (repo convention) for the Unicode sub/superscript table.
// Run: deno test --no-check apps/mobile/src/lib/sub-sup.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { toUnicodeScript } from "./sub-sup.ts";

Deno.test("chemistry and exponents map, which is the whole reported case", () => {
  assertEquals(toUnicodeScript("2", "sub"), "₂");
  assertEquals(toUnicodeScript("4", "sub"), "₄");
  assertEquals(toUnicodeScript("2", "sup"), "²");
  assertEquals(toUnicodeScript("10", "sup"), "¹⁰");
  // Ion charges and negative exponents, in both the ASCII and the real minus.
  assertEquals(toUnicodeScript("-9", "sup"), "⁻⁹");
  assertEquals(toUnicodeScript("−9", "sup"), "⁻⁹");
  assertEquals(toUnicodeScript("2+", "sup"), "²⁺");
});

Deno.test("all or nothing: one unmappable character rejects the whole run", () => {
  // No subscript "y" exists in Unicode, so "xy" must not come back half-lowered.
  assertEquals(toUnicodeScript("xy", "sub"), null);
  // No superscript "q".
  assertEquals(toUnicodeScript("q", "sup"), null);
  // A space is not in either table, so a multi-word run falls back rather than closing up.
  assertEquals(toUnicodeScript("a b", "sub"), null);
  assertEquals(toUnicodeScript("", "sub"), null);
});

Deno.test("letters that do exist map, case-folded", () => {
  assertEquals(toUnicodeScript("n", "sub"), "ₙ");
  assertEquals(toUnicodeScript("N", "sup"), "ⁿ");
  assertEquals(toUnicodeScript("th", "sup"), "ᵗʰ");
});

Deno.test("code points are not split, so an emoji misses the table whole", () => {
  assertEquals(toUnicodeScript("🙂", "sub"), null);
  assertEquals(toUnicodeScript("é", "sup"), null);
});
