import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSubQueries, extractSearchTerms } from "./search-query.ts";

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

// buildSubQueries: deterministic sub-query expansion (Phase 1 of retrieval-depth). Pure string
// assembly only — no LLM call, no randomness — so saved-chat replays and the guardrail suite stay
// stable.
//
// Element 0 contract (reconciled with what the primary dense search actually embeds — see
// retrieve.ts / index.ts, which pass the trimmed raw question, NOT extractSearchTerms(question)):
// extractSearchTerms(question) wins when it produces something (it still runs first and is
// consulted), otherwise element 0 falls back to the trimmed raw question. That guarantees a real
// question NEVER produces an empty element 0 just because extractSearchTerms declined to simplify
// it — which is the common case for ordinary questions like the ones in the baseline table
// (extractSearchTerms only strips known conversational lead-ins and is normally used on the
// 0-result RETRY path, not the primary search). This is what makes "worst case = today's
// behavior" literally true: a caller that ignores every entry after index 0 reproduces exactly
// today's single dense search on today's exact query string.

Deno.test("buildSubQueries: determinism — same inputs produce the identical ordered array", () => {
  const a = buildSubQueries("How effective is tirzepatide for weight loss?", ["tirzepatide"], "evidence_for_claim");
  const b = buildSubQueries("How effective is tirzepatide for weight loss?", ["tirzepatide"], "evidence_for_claim");
  assertEquals(a, b);
});

Deno.test("buildSubQueries: baseline-table efficacy question — element 0 is the raw question (extractSearchTerms declines), plus a trial variant", () => {
  const question = "How effective is tirzepatide for weight loss?";
  assertEquals(extractSearchTerms(question), ""); // sanity: this ordinary question does NOT simplify
  const result = buildSubQueries(question, ["tirzepatide"], "evidence_for_claim");
  assertEquals(result[0], question); // worst case = today's exact query string, not ""
  assertEquals(result.includes("tirzepatide randomized trial efficacy"), true);
  assertEquals(result.length <= 4, true);
});

Deno.test("buildSubQueries: extractSearchTerms wins for element 0 when it DOES simplify (retry-path style question)", () => {
  const question = "what helps with tirzepatide induced nausea";
  const base = extractSearchTerms(question);
  assertEquals(base !== "", true); // sanity: this phrasing DOES simplify
  const result = buildSubQueries(question, ["tirzepatide"], "evidence_for_claim");
  assertEquals(result[0], base); // extractSearchTerms output preferred over the raw question
});

Deno.test("buildSubQueries: comparison intent also uses the randomized-trial-efficacy keyword", () => {
  const result = buildSubQueries("Is ozempic better than wegovy?", ["ozempic"], "comparison");
  assertEquals(result.includes("ozempic randomized trial efficacy"), true);
});

Deno.test("buildSubQueries: side_effects intent adds an adverse-effects-safety variant", () => {
  const result = buildSubQueries("What are the side effects of metformin?", ["metformin"], "side_effects");
  assertEquals(result.includes("metformin adverse effects safety"), true);
});

Deno.test("buildSubQueries: emergency_overdose intent also uses the adverse-effects-safety keyword", () => {
  const result = buildSubQueries("Can you overdose on ibuprofen?", ["ibuprofen"], "emergency_overdose");
  assertEquals(result.includes("ibuprofen adverse effects safety"), true);
});

Deno.test("buildSubQueries: mechanism intent adds a mechanism-of-action variant (baseline-table question)", () => {
  const question = "How does metformin lower blood sugar?";
  const result = buildSubQueries(question, ["metformin"], "mechanism");
  assertEquals(result[0], question); // extractSearchTerms declines on this phrasing too
  assertEquals(result.includes("metformin mechanism of action"), true);
});

Deno.test("buildSubQueries: dosing intent adds a dosing variant", () => {
  const result = buildSubQueries("What is the dose of lisinopril?", ["lisinopril"], "dosing");
  assertEquals(result.includes("lisinopril dosing"), true);
});

Deno.test("buildSubQueries: drug_interaction intent adds a drug-interaction variant (baseline-table question)", () => {
  const question = "Can I take ibuprofen with lisinopril?";
  const result = buildSubQueries(question, ["ibuprofen", "lisinopril"], "drug_interaction");
  assertEquals(result[0], question);
  assertEquals(result.includes("ibuprofen drug interaction"), true);
});

Deno.test("buildSubQueries: question with no entity mentions yields just the base query (baseline-table question)", () => {
  const question = "Is sucralose bad for me?";
  assertEquals(extractSearchTerms(question), ""); // sanity: does not simplify
  const result = buildSubQueries(question, [], "general_health");
  assertEquals(result, [question]); // worst case = today's exact single query
});

Deno.test("buildSubQueries: intents with no useful keyword (smalltalk, investment) add nothing beyond base", () => {
  const smalltalkQ = "hi how are you";
  const smalltalk = buildSubQueries(smalltalkQ, ["aspirin"], "smalltalk");
  assertEquals(smalltalk, [smalltalkQ]);

  const investmentQ = "Is Pfizer a good stock to buy?";
  const investment = buildSubQueries(investmentQ, ["Pfizer"], "investment");
  assertEquals(investment, [investmentQ]);
});

Deno.test("buildSubQueries: output never exceeds 4 entries", () => {
  const result = buildSubQueries(
    "Can I take ibuprofen with lisinopril and metformin and aspirin?",
    ["ibuprofen", "lisinopril", "metformin", "aspirin"],
    "drug_interaction",
  );
  assertEquals(result.length <= 4, true);
});

Deno.test("buildSubQueries: output never contains duplicates (case-insensitive), even when base equals a variant", () => {
  // Base extractSearchTerms("dosing") on a bare drug name returns "" (nothing simplified), so
  // construct a case where a generated variant could collide with another generated variant if a
  // caller ever passed the same entity twice.
  const result = buildSubQueries("Can I take Metformin with metformin?", ["Metformin", "metformin"], "drug_interaction");
  const lower = result.map((s) => s.toLowerCase());
  assertEquals(new Set(lower).size, lower.length);
});

Deno.test("buildSubQueries: empty/whitespace-only question with no entities returns an empty array", () => {
  assertEquals(buildSubQueries("", [], "general_health"), []);
  assertEquals(buildSubQueries("   ", [], "general_health"), []);
});

Deno.test("buildSubQueries: dedupes when the base query already equals a generated variant", () => {
  const result = buildSubQueries("aspirin dosing", ["aspirin"], "dosing");
  const lower = result.map((s) => s.toLowerCase());
  assertEquals(new Set(lower).size, lower.length);
});
