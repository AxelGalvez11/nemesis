import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyField, fieldProfile } from "./field-router.ts";

Deno.test("router: pure CS routes to cs_ml with NO safety and code execution", () => {
  const c = classifyField("a transformer neural network benchmark on an imagenet dataset");
  assertEquals(c.field, "cs_ml");
  assertEquals(c.safety, []);
  assertEquals(c.profile.executability, "code");
  assert(c.profile.sources.includes("arxiv"));
  assertEquals(c.confidence, "high");
});

Deno.test("router: clinical query routes to medical with the medical floor", () => {
  const c = classifyField("a randomized clinical trial of a drug dose in patients");
  assertEquals(c.field, "medical");
  assert(c.safety.includes("medical_floor"));
  assert(c.profile.sources.includes("pubmed"));
});

Deno.test("router: psychology query routes to mental_health with crisis support", () => {
  const c = classifyField("cognitive behavioral therapy for depression and anxiety");
  assertEquals(c.field, "mental_health");
  assert(c.safety.includes("crisis_support"));
  assert(c.profile.sources.includes("psycinfo"));
});

Deno.test("router: self-harm + drug engages BOTH crisis support and the medical floor", () => {
  const c = classifyField("self-harm risk and antidepressant drug dose");
  assertEquals(c.field, "mental_health");
  assert(c.safety.includes("crisis_support"), "crisis support must fire on self-harm");
  assert(c.safety.includes("medical_floor"), "medical floor must fire on the drug/dose signal");
});

Deno.test("router (SAFETY-CRITICAL): a health signal inside an ML question still fires medical safety", () => {
  const c = classifyField("a neural network that predicts drug toxicity");
  // health-first precedence: it is NOT routed as pure CS...
  assert(c.field !== "cs_ml", "a drug/toxicity question must not be treated as plain CS");
  // ...and the medical floor engages despite the ML framing.
  assert(c.safety.includes("medical_floor"));
});

Deno.test("router: non-research / off-topic falls back to other with no safety, low confidence", () => {
  const c = classifyField("the history of jazz music in the 1950s");
  assertEquals(c.field, "other");
  assertEquals(c.safety, []);
  assertEquals(c.confidence, "low");
});

Deno.test("router: fieldProfile is the durable contract an LLM classifier can feed", () => {
  assertEquals(fieldProfile("cs_ml").executability, "code");
  assert(fieldProfile("medical").sources.includes("clinicaltrials"));
  assertEquals(fieldProfile("other").sources, ["openalex"]);
});
