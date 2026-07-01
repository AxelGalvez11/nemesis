import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractSearchTerms } from "./search-query.ts";

// The confirmed live failure: "how do i get rid of heartburn fast?" retrieved 0 sources, while
// "what helps with heartburn?" (15) and "heartburn remedies" (27) both retrieved well. The
// conversational scaffolding is what PubMed's term-mapping chokes on.
Deno.test("extractSearchTerms: strips a leading conversational prefix + trailing filler (the heartburn case)", () => {
  assertEquals(extractSearchTerms("how do i get rid of heartburn fast?"), "heartburn");
});

Deno.test("extractSearchTerms: strips 'what can i take for' and a leading article", () => {
  assertEquals(extractSearchTerms("what can i take for a headache?"), "headache");
});

Deno.test("extractSearchTerms: strips the interrogative 'how to' but keeps the verb phrase + drops trailing 'naturally'", () => {
  assertEquals(extractSearchTerms("how to lower blood pressure naturally"), "lower blood pressure");
});

Deno.test("extractSearchTerms: 'what helps with X' yields the bare topic", () => {
  assertEquals(extractSearchTerms("what helps with mild acne?"), "mild acne");
});

// Cause/definition interrogatives (the consumer-claim retrieval fix): recover the topic so the primary
// research query hits a MedlinePlus/PubMed topic instead of sending the whole conversational sentence.
Deno.test("extractSearchTerms: 'what causes X' recovers the topic (the white-flakes case)", () => {
  assertEquals(extractSearchTerms("what causes white flakes in hair?"), "white flakes in hair");
});

Deno.test("extractSearchTerms: 'why do i have X' / 'what is X' / 'what are X' recover the topic", () => {
  assertEquals(extractSearchTerms("why do i have dandruff"), "dandruff");
  assertEquals(extractSearchTerms("what is berberine?"), "berberine");
  assertEquals(extractSearchTerms("what are seed oils"), "seed oils");
});

Deno.test("extractSearchTerms: longest-match-first keeps 'what is the best way to ...' intact (not just 'what is')", () => {
  assertEquals(extractSearchTerms("what is the best way to lower cholesterol"), "lower cholesterol");
});

Deno.test("extractSearchTerms: 'what causes it?' -> '' (pronoun residue, nothing to search)", () => {
  assertEquals(extractSearchTerms("what causes it?"), "");
});

Deno.test("extractSearchTerms: returns '' when nothing is simplified (retrying the same string is pointless)", () => {
  assertEquals(extractSearchTerms("heartburn remedies"), "");
  assertEquals(extractSearchTerms("lisinopril dosage"), "");
});

Deno.test("extractSearchTerms: returns '' for empty input and pronoun-only / too-thin residue", () => {
  assertEquals(extractSearchTerms(""), "");
  assertEquals(extractSearchTerms("how do i get rid of it?"), ""); // residue "it" — nothing to search
  assertEquals(extractSearchTerms("how do i get rid of this"), ""); // residue "this" — pronoun stopword
});

Deno.test("extractSearchTerms: case- and punctuation-insensitive, collapses whitespace", () => {
  assertEquals(extractSearchTerms("How do I get rid of   ACID REFLUX??"), "acid reflux");
});
