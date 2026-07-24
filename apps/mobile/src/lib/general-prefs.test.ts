// Deno unit tests (repo convention) for the phone's General settings
// (de)serialization. The important case is the NEW boolean field riding in a
// record that was all-strings before it existed — a legacy record must read as
// OFF, never accidentally ON.
// Run from the REPO ROOT: deno test --no-check --allow-env apps/mobile/src/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_GENERAL_PREFS,
  generalPrefsStoreKey,
  parseGeneralPrefs,
  serializeGeneralPrefs,
} from "./general-prefs.ts";

Deno.test("nothing stored yet reads as the defaults, transcript OFF", () => {
  assertEquals(parseGeneralPrefs(null), DEFAULT_GENERAL_PREFS);
  assertEquals(parseGeneralPrefs(null).saveTranscript, false);
});

Deno.test("a full record round-trips unchanged", () => {
  const prefs = {
    language: "Spanish",
    nickname: "Sam",
    occupation: "Student",
    saveTranscript: true,
    tone: "Socratic tutor",
  };
  assertEquals(parseGeneralPrefs(serializeGeneralPrefs(prefs)), prefs);
});

Deno.test("a LEGACY record (all strings, no saveTranscript key) reads as OFF", () => {
  // Exactly the shape stored before the boolean field existed.
  const legacy = JSON.stringify({ language: "French", tone: "Clear and direct", nickname: "", occupation: "" });
  const parsed = parseGeneralPrefs(legacy);
  assertEquals(parsed.saveTranscript, false);
  // The strings it DID carry survive.
  assertEquals(parsed.language, "French");
});

Deno.test("a non-boolean saveTranscript is ignored, not coerced", () => {
  // A truthy-but-wrong value (e.g. the string "true") must not turn the setting
  // on — only a real boolean counts.
  assertEquals(parseGeneralPrefs(JSON.stringify({ saveTranscript: "true" })).saveTranscript, false);
  assertEquals(parseGeneralPrefs(JSON.stringify({ saveTranscript: 1 })).saveTranscript, false);
  assertEquals(parseGeneralPrefs(JSON.stringify({ saveTranscript: false })).saveTranscript, false);
  assertEquals(parseGeneralPrefs(JSON.stringify({ saveTranscript: true })).saveTranscript, true);
});

Deno.test("garbage / partial JSON falls back to the defaults", () => {
  assertEquals(parseGeneralPrefs("not json {"), DEFAULT_GENERAL_PREFS);
  // A partial object keeps the keys it has and defaults the rest.
  const partial = parseGeneralPrefs(JSON.stringify({ nickname: "Kai" }));
  assertEquals(partial.nickname, "Kai");
  assertEquals(partial.tone, DEFAULT_GENERAL_PREFS.tone);
  assertEquals(partial.saveTranscript, false);
});

Deno.test("the store key is namespaced per account", () => {
  assertEquals(generalPrefsStoreKey("uid-123"), "nemesis_general_prefs_v1_uid-123");
});
