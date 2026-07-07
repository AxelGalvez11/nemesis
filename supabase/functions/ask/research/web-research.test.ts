// Tests for the PURE parts of the agentic web-research loop: the trust ranking (which orders the
// pool and gates the low tier) and the learning->chunk adapter (the trust boundary between web text
// and the grounded/scanned evidence pool). The networked loop itself is integration-tested live.
// Run: deno test --allow-env supabase/functions/ask/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { agenticResearchEnabled, webLearningsToChunks, webTrust, type WebLearning } from "./web-research.ts";

Deno.test("flag is OFF by default", () => {
  Deno.env.delete("DEEP_RESEARCH_AGENTIC");
  assertEquals(agenticResearchEnabled(), false);
  Deno.env.set("DEEP_RESEARCH_AGENTIC", "on");
  assertEquals(agenticResearchEnabled(), true);
  Deno.env.delete("DEEP_RESEARCH_AGENTIC");
});

Deno.test("webTrust ranks journals/gov/edu high, consumer-health medium, blogs low", () => {
  assertEquals(webTrust("https://www.nejm.org/doi/full/10.1056/x"), "high");
  assertEquals(webTrust("https://pubmed.ncbi.nlm.nih.gov/12345/"), "high");
  assertEquals(webTrust("https://www.fda.gov/drugs/x"), "high");
  assertEquals(webTrust("https://www.ahajournals.org/doi/x"), "high");
  assertEquals(webTrust("https://med.stanford.edu/x"), "high");
  assertEquals(webTrust("https://en.wikipedia.org/wiki/Creatine"), "medium");
  assertEquals(webTrust("https://www.healthline.com/nutrition/creatine"), "medium");
  assertEquals(webTrust("https://someguysblog.substack.com/p/creatine"), "low");
  assertEquals(webTrust("not a url"), "low");
});

const L = (learning: string, url: string, trust: WebLearning["trust"], text = "source passage text"): WebLearning => ({
  learning, url, title: `Title for ${url}`, text, trust,
});

Deno.test("webLearningsToChunks: one chunk per distinct URL, tags start at startTag", () => {
  const chunks = webLearningsToChunks([
    L("fact A1", "https://nejm.org/a", "high"),
    L("fact A2", "https://nejm.org/a", "high"),
    L("fact B", "https://healthline.com/b", "medium"),
  ], 25);
  assertEquals(chunks.length, 2); // A1+A2 collapse to the nejm.org/a chunk
  assertEquals(chunks[0].tag, "25");
  assertEquals(chunks[1].tag, "26");
  assertEquals(chunks.map((c) => c.url).sort(), ["https://healthline.com/b", "https://nejm.org/a"]);
});

Deno.test("webLearningsToChunks: high-trust sources sort before lower-trust", () => {
  const chunks = webLearningsToChunks([
    L("blog claim", "https://blog.example.com/x", "low"),
    L("journal claim", "https://thelancet.com/y", "high"),
    L("wiki claim", "https://en.wikipedia.org/z", "medium"),
  ], 1);
  assertEquals(chunks.map((c) => c.url), [
    "https://thelancet.com/y",
    "https://en.wikipedia.org/z",
    "https://blog.example.com/x",
  ]);
});

Deno.test("webLearningsToChunks: chunk_text carries the SOURCE passage (grounding target), provider=web", () => {
  const chunks = webLearningsToChunks([
    L("creatine SMD 0.80 in older adults", "https://cochrane.org/rev", "high", "The pooled SMD was 0.80 (95% CI 0.25-1.34) in adults over 60."),
  ], 1);
  assertEquals(chunks[0].provider, "web");
  assert(chunks[0].chunk_id.startsWith("web:"));
  assertEquals(chunks[0].source_id, chunks[0].chunk_id);
  // the real source passage MUST be present — it's what the faithfulness judge verifies against
  assert((chunks[0].chunk_text ?? "").includes("The pooled SMD was 0.80"));
  // the distilled learning is prepended for the reranker
  assert((chunks[0].chunk_text ?? "").includes("creatine SMD 0.80 in older adults"));
});

Deno.test("webLearningsToChunks: empty input -> empty output", () => {
  assertEquals(webLearningsToChunks([], 1).length, 0);
});

Deno.test("webLearningsToChunks: synthetic ids are stable per URL", () => {
  const a = webLearningsToChunks([L("x", "https://nejm.org/same", "high")], 1);
  const b = webLearningsToChunks([L("y", "https://nejm.org/same", "high")], 5);
  assertEquals(a[0].chunk_id, b[0].chunk_id); // same URL -> same synthetic id
});
