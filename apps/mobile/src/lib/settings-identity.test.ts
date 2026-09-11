// Deno unit tests (repo convention).
// Run: deno test --no-check --unstable-sloppy-imports --allow-read --allow-env apps/mobile/src/lib/settings-identity.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planDisplayName, settingsDisplayName, settingsInitials } from "./settings-identity.ts";

Deno.test("settingsDisplayName: prefers the stored name, else a humanized email", () => {
  assertEquals(settingsDisplayName("Axel Galvez", "axelgalvez1121@gmail.com"), "Axel Galvez");
  assertEquals(settingsDisplayName("  ", "axel.galvez@school.edu"), "axel galvez");
  assertEquals(settingsDisplayName(null, "nemesis_student@school.edu"), "nemesis student");
  assertEquals(settingsDisplayName(undefined, ""), "Student");
});

Deno.test("settingsInitials: first letter of the first two words, else the first two letters", () => {
  assertEquals(settingsInitials("Axel Galvez"), "AG");
  assertEquals(settingsInitials("axel galvez"), "AG");
  assertEquals(settingsInitials("Nemesis"), "NE");
  assertEquals(settingsInitials("  "), "");
  assertEquals(settingsInitials("Mary Jane Watson"), "MJ");
});

Deno.test("planDisplayName: one product, whatever the stored code says", () => {
  assertEquals(planDisplayName("free"), "Free");
  assertEquals(planDisplayName(""), "Free");
  assertEquals(planDisplayName("trial"), "Trial");
  assertEquals(planDisplayName("enterprise"), "Enterprise");
  assertEquals(planDisplayName("nemesis"), "Nemesis");
  assertEquals(planDisplayName("plus"), "Nemesis");
  assertEquals(planDisplayName("pro"), "Nemesis");
  assertEquals(planDisplayName("MAX"), "Nemesis");
});
