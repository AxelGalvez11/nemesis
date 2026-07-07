import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { expandSymptomQuery } from "./symptom-expansion.ts";

// The confirmed live failure from the diagnosis: "why is my skin itchy" retrieves 0 hits on both
// PubMed esearch and MedlinePlus wsearch (verified live), while the bare stripped phrase retrieves
// well on both. This is the flagship case the fix targets.
//
// NOTE on expandedQuery = symptomPhrase (never a phrase+synonym join): verified live against BOTH
// PubMed esearch and MedlinePlus wsearch that concatenating the phrase with its synonym
// underperforms either alone on every case checked (MedlinePlus "itchy skin"->29 / "pruritus"->40 /
// joined->10; "hair loss"->23 / "alopecia"->9 / joined->9; PubMed "hair loss"->47226 /
// "alopecia"->32243 / joined->32207). See the doc comment on SymptomExpansion.expandedQuery in
// symptom-expansion.ts for the full data. `synonyms` is still returned (unused by the live-source
// call today) for a future caller that wants to try it as a separate, non-joined fan-out query.
Deno.test("expandSymptomQuery: 'why is my skin itchy' strips the why-frame; expandedQuery is the bare phrase, not a synonym join", () => {
  const result = expandSymptomQuery("why is my skin itchy");
  assertEquals(result !== null, true);
  assertEquals(result!.symptomPhrase, "skin itchy");
  assertEquals(result!.synonyms.includes("pruritus"), true);
  assertEquals(result!.expandedQuery, "skin itchy");
});

Deno.test("expandSymptomQuery: 'why are my ankles swollen' finds no exact synonym key match but still strips the frame", () => {
  // "ankles swollen" (word order flipped from the "swollen ankles" map key) — direct lookup misses,
  // and the whole-word regex checks for "swollen ankles" as a substring, which also isn't present in
  // this word order. Documents current (conservative) behavior: still returns the stripped phrase
  // with no synonyms added, never worse than doing nothing.
  const result = expandSymptomQuery("why are my ankles swollen");
  assertEquals(result !== null, true);
  assertEquals(result!.symptomPhrase, "ankles swollen");
  assertEquals(result!.synonyms.length, 0);
  assertEquals(result!.expandedQuery, "ankles swollen");
});

Deno.test("expandSymptomQuery: 'why do i have hair loss' matches the alopecia synonym but expandedQuery stays the bare phrase", () => {
  const result = expandSymptomQuery("why do i have hair loss");
  assertEquals(result !== null, true);
  assertEquals(result!.symptomPhrase, "hair loss");
  assertEquals(result!.synonyms.includes("alopecia"), true);
  assertEquals(result!.expandedQuery, "hair loss");
});

Deno.test("expandSymptomQuery: strips a trailing filler after the why-frame", () => {
  const result = expandSymptomQuery("why is my stomach bloating all the time");
  assertEquals(result !== null, true);
  assertEquals(result!.symptomPhrase, "stomach bloating");
  assertEquals(result!.expandedQuery, "stomach bloating");
});

Deno.test("expandSymptomQuery: returns null when no why-frame matches (non-symptom / drug question)", () => {
  assertEquals(expandSymptomQuery("what is lisinopril used for"), null);
  assertEquals(expandSymptomQuery("how do i get rid of heartburn fast"), null);
});

Deno.test("expandSymptomQuery: returns null for empty input", () => {
  assertEquals(expandSymptomQuery(""), null);
  assertEquals(expandSymptomQuery("   "), null);
});

Deno.test("expandSymptomQuery: returns null when the why-frame strips to nothing useful", () => {
  assertEquals(expandSymptomQuery("why is my it"), null);
});

Deno.test("expandSymptomQuery: case- and punctuation-insensitive", () => {
  const result = expandSymptomQuery("Why Is My SKIN Itchy??");
  assertEquals(result !== null, true);
  assertEquals(result!.symptomPhrase, "skin itchy");
  assertEquals(result!.expandedQuery, "skin itchy");
});

Deno.test("expandSymptomQuery: 'why does my mouth feel so dry' style feels ungrammatical but still strips (no synonym forced)", () => {
  const result = expandSymptomQuery("why does my mouth feel so dry");
  // "why does my" strips to "mouth feel so dry" — no direct map key match (word order differs from
  // "dry mouth"); documents the conservative fallback (phrase kept, no synonym forced).
  assertEquals(result !== null, true);
  assertEquals(result!.symptomPhrase, "mouth feel so dry");
  assertEquals(result!.expandedQuery, "mouth feel so dry");
});
