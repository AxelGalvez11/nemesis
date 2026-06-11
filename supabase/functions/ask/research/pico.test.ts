import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizePico } from "./pico.ts";

Deno.test("normalizePico trims a complete PICO", () => {
  assertEquals(
    normalizePico({ intervention: "  semaglutide ", comparator: " placebo ", outcome: " MACE " }),
    { intervention: "semaglutide", comparator: "placebo", outcome: "MACE" },
  );
});

Deno.test("normalizePico defaults an empty comparator to placebo or standard care", () => {
  assertEquals(
    normalizePico({ intervention: "semaglutide", comparator: "", outcome: "MACE" }),
    { intervention: "semaglutide", comparator: "placebo or standard care", outcome: "MACE" },
  );
});

Deno.test("normalizePico returns null without an intervention", () => {
  assertEquals(normalizePico({ intervention: "  ", comparator: "placebo", outcome: "MACE" }), null);
});

Deno.test("normalizePico returns null without an outcome", () => {
  assertEquals(normalizePico({ intervention: "semaglutide", comparator: "placebo", outcome: "" }), null);
});

Deno.test("normalizePico tolerates non-object / non-string input", () => {
  assertEquals(normalizePico(null), null);
  assertEquals(normalizePico({ intervention: 5, comparator: [], outcome: "x" }), null);
});
