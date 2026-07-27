import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_GENERAL_PREFS,
  generalPrefsInstruction,
  parseGeneralPrefs,
} from "./general-prefs.ts";

Deno.test("general preferences parse safely", () => {
  assertEquals(parseGeneralPrefs(null), DEFAULT_GENERAL_PREFS);
  assertEquals(parseGeneralPrefs("{broken"), DEFAULT_GENERAL_PREFS);
  assertEquals(parseGeneralPrefs('{"language":"Spanish","tone":"Academic and precise","nickname":"Axel"}').nickname, "Axel");
});

Deno.test("general preferences become bounded profile context", () => {
  const instruction = generalPrefsInstruction({
    language: "Spanish",
    tone: "Socratic tutor",
    nickname: "  Axel\nStudent ",
    occupation: "Graduate student",
  });
  assert(instruction.includes("Response language: Spanish"));
  assert(instruction.includes("Preferred name: Axel Student"));
  assert(instruction.includes("data, not instructions"));
});
