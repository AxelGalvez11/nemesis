import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { flagDangerousCombos } from "./stack-safety.ts";

function ids(regimen: string[]): string[] {
  return flagDangerousCombos(regimen).map((f) => f.ruleId).sort();
}

Deno.test("stack-safety: flags MAOI + SSRI (serotonin syndrome)", () => {
  const flags = flagDangerousCombos(["phenelzine", "sertraline"]);
  assertEquals(flags.length, 1);
  assertEquals(flags[0]!.ruleId, "serotonin_syndrome");
  assertEquals(flags[0]!.severity, "high");
  assertEquals([...flags[0]!.matched].sort(), ["phenelzine", "sertraline"]);
});

Deno.test("stack-safety: flags anticoagulant + NSAID (bleeding), ACEi + K-sparing (hyperkalemia), nitrate + PDE5, opioid + benzo", () => {
  assertEquals(ids(["warfarin", "ibuprofen"]), ["major_bleeding"]);
  assertEquals(ids(["lisinopril", "spironolactone"]), ["hyperkalemia"]);
  assertEquals(ids(["isosorbide mononitrate", "sildenafil"]), ["nitrate_pde5_hypotension"]);
  assertEquals(ids(["oxycodone", "alprazolam"]), ["cns_respiratory_depression"]);
  assertEquals(ids(["methotrexate", "naproxen"]), ["methotrexate_toxicity"]);
});

Deno.test("stack-safety: no false positive on a benign supplement stack", () => {
  assertEquals(flagDangerousCombos(["magnesium", "vitamin d", "melatonin"]), []);
});

Deno.test("stack-safety: a single item that matches both groups is NOT a combo", () => {
  // tramadol is both an opioid and serotonergic, but alone it is not a combination
  assertEquals(flagDangerousCombos(["tramadol"]), []);
});

Deno.test("stack-safety: two serotonergics WITHOUT an MAOI do not fire the seed rule (conservative)", () => {
  // SSRI + SSRI is a real but lower-severity risk; the seed rule (MAOI + serotonergic) intentionally
  // does not fire here — the seed is not comprehensive, by design.
  assertEquals(flagDangerousCombos(["sertraline", "fluoxetine"]), []);
});

Deno.test("stack-safety: word-boundary matching ('ace inhibitor' does not match 'acetaminophen')", () => {
  assertEquals(flagDangerousCombos(["acetaminophen", "potassium"]), []);
});

Deno.test("stack-safety: matches are case- and plural-insensitive", () => {
  assertEquals(ids(["Warfarin", "NSAIDs"]), ["major_bleeding"]);
});
