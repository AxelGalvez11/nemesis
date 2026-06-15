import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aggregateVerdict,
  buildJudgePrompt,
  claimSourcePairs,
  judgeAnswers,
  MAX_SOURCE_CHARS,
  MAX_TAGS_PER_CLAIM,
  parseVerdict,
  scoreFaithfulness,
  type FaithAnswerPoint,
  type FaithSourceText,
  type Verdict,
} from "./faithfulness.ts";

// ── claimSourcePairs (per-tag, NOT unioned) ──────────────────────────────────────────────────────
Deno.test("claimSourcePairs: a single-tag cited claim pairs with that source's text", () => {
  const points: FaithAnswerPoint[] = [{ text: "Sertraline and placebo were the arms.", citation_ids: ["4"] }];
  const src: FaithSourceText[] = [{ tag: "4", text: "DRUG: sertraline; DRUG: placebo" }];
  const pairs = claimSourcePairs(points, src);
  assertEquals(pairs.length, 1);
  assertEquals(pairs[0].tags, ["4"]);
  assertEquals(pairs[0].sources.length, 1);
  assertStringIncludes(pairs[0].sources[0].text, "sertraline");
  assertEquals(pairs[0].droppedTags, 0);
});

Deno.test("claimSourcePairs: a multi-tag claim keeps its sources SEPARATE (per-tag, no union token-bomb)", () => {
  const points: FaithAnswerPoint[] = [{ text: "X lowers blood pressure.", citation_ids: ["1", "2"] }];
  const src: FaithSourceText[] = [
    { tag: "1", text: "X reduced systolic pressure." },
    { tag: "2", text: "X also reduced diastolic pressure." },
  ];
  const pairs = claimSourcePairs(points, src);
  assertEquals(pairs.length, 1);
  assertEquals(pairs[0].tags, ["1", "2"]);
  assertEquals(pairs[0].sources.length, 2);
  assertEquals(pairs[0].sources[0].text, "X reduced systolic pressure.");
  assertEquals(pairs[0].sources[1].text, "X also reduced diastolic pressure.");
});

Deno.test("claimSourcePairs: an uncited claim is skipped (nothing to judge)", () => {
  const points: FaithAnswerPoint[] = [{ text: "No citation here.", citation_ids: [] }, { text: "Bare.", citation_ids: undefined }];
  assertEquals(claimSourcePairs(points, []).length, 0);
});

Deno.test("claimSourcePairs: tags that don't resolve to source text are dropped; all-unresolved is skipped", () => {
  const points: FaithAnswerPoint[] = [
    { text: "Partly resolvable.", citation_ids: ["1", "9"] }, // 9 missing
    { text: "Unresolvable.", citation_ids: ["7"] }, // missing entirely
  ];
  const src: FaithSourceText[] = [{ tag: "1", text: "real source one" }];
  const pairs = claimSourcePairs(points, src);
  assertEquals(pairs.length, 1); // only the partly-resolvable claim survives
  assertEquals(pairs[0].tags, ["1"]); // the unresolved tag dropped
});

Deno.test("claimSourcePairs: duplicate cited tags are de-duped", () => {
  const points: FaithAnswerPoint[] = [{ text: "Dup.", citation_ids: ["3", "3"] }];
  const src: FaithSourceText[] = [{ tag: "3", text: "only once" }];
  const pairs = claimSourcePairs(points, src);
  assertEquals(pairs[0].tags, ["3"]);
  assertEquals(pairs[0].sources.length, 1);
});

Deno.test("claimSourcePairs: a many-citation claim is CAPPED (no union haystack) and the overflow recorded", () => {
  // the testosterone-style case: 5 cited labels — judge the first MAX_TAGS_PER_CLAIM, record the rest.
  const points: FaithAnswerPoint[] = [{ text: "Many warnings.", citation_ids: ["1", "2", "3", "4", "5"] }];
  const src: FaithSourceText[] = [1, 2, 3, 4, 5].map((n) => ({ tag: String(n), text: `label ${n}` }));
  const pairs = claimSourcePairs(points, src);
  assertEquals(pairs[0].sources.length, MAX_TAGS_PER_CLAIM);
  assertEquals(pairs[0].tags.length, MAX_TAGS_PER_CLAIM);
  assertEquals(pairs[0].droppedTags, 5 - MAX_TAGS_PER_CLAIM);
});

Deno.test("claimSourcePairs: a pathologically long source is truncated to MAX_SOURCE_CHARS (no context blow-up)", () => {
  const points: FaithAnswerPoint[] = [{ text: "Huge.", citation_ids: ["1"] }];
  const src: FaithSourceText[] = [{ tag: "1", text: "a".repeat(MAX_SOURCE_CHARS + 5000) }];
  const pairs = claimSourcePairs(points, src);
  assertEquals(pairs[0].sources[0].text.length, MAX_SOURCE_CHARS);
});

// ── buildJudgePrompt (PINNED — a silent edit changes every score, so assert its load-bearing parts) ──
Deno.test("buildJudgePrompt: embeds the claim + source and the strict NLI instruction set", () => {
  const p = buildJudgePrompt("Drug A reduces mortality.", "In the trial, drug A lowered deaths.");
  assertStringIncludes(p, "Drug A reduces mortality.");
  assertStringIncludes(p, "In the trial, drug A lowered deaths.");
  assertStringIncludes(p, "only"); // judge ONLY against the source, no outside knowledge
  assertStringIncludes(p, "paraphrase"); // paraphrase/synonym counts as support
  assertStringIncludes(p, "supported");
  assertStringIncludes(p, "not_supported");
  assertStringIncludes(p, "unclear");
});

// ── parseVerdict (lenient + FAIL-SAFE to unclear) ────────────────────────────────────────────────
Deno.test("parseVerdict: strict JSON label is honored", () => {
  assertEquals(parseVerdict('{"label":"supported","reason":"says so"}').label, "supported");
  assertEquals(parseVerdict('{"label":"not_supported","reason":"absent"}').label, "not_supported");
  assertEquals(parseVerdict('{"label":"unclear"}').label, "unclear");
});

Deno.test("parseVerdict: JSON reason is carried through", () => {
  assertEquals(parseVerdict('{"label":"supported","reason":"verbatim match"}').reason, "verbatim match");
});

Deno.test("parseVerdict: a bare label (loose model reply) is recognized", () => {
  assertEquals(parseVerdict("supported").label, "supported");
  assertEquals(parseVerdict("SUPPORTED").label, "supported");
  assertEquals(parseVerdict("Verdict: not_supported").label, "not_supported");
  assertEquals(parseVerdict("not supported").label, "not_supported"); // space variant
  assertEquals(parseVerdict("unsupported").label, "not_supported");
});

Deno.test("parseVerdict: 'not supported' must NOT be misread as 'supported'", () => {
  // the negation is the whole point — a substring scan that finds 'supported' first would invert the verdict
  assertEquals(parseVerdict('{"label":"not_supported"}').label, "not_supported");
  assertEquals(parseVerdict("the claim is not supported by the text").label, "not_supported");
});

Deno.test("parseVerdict: junk / empty / missing-label all FAIL SAFE to unclear (never counted as supported)", () => {
  assertEquals(parseVerdict("").label, "unclear");
  assertEquals(parseVerdict("I cannot determine").label, "unclear");
  assertEquals(parseVerdict('{"reason":"no label field"}').label, "unclear");
  assertEquals(parseVerdict("¯\\_(ツ)_/¯").label, "unclear");
});

// ── aggregateVerdict (per-claim from per-source verdicts) ─────────────────────────────────────────
const v = (label: Verdict["label"]): Verdict => ({ label });

Deno.test("aggregateVerdict: supported if ANY cited source supports the claim", () => {
  assertEquals(aggregateVerdict([v("not_supported"), v("supported"), v("unclear")]).label, "supported");
});

Deno.test("aggregateVerdict: not_supported only when EVERY source clearly fails", () => {
  assertEquals(aggregateVerdict([v("not_supported"), v("not_supported")]).label, "not_supported");
});

Deno.test("aggregateVerdict: a lone unclear blocks a not_supported verdict (conservative)", () => {
  assertEquals(aggregateVerdict([v("not_supported"), v("unclear")]).label, "unclear");
  assertEquals(aggregateVerdict([v("unclear")]).label, "unclear");
  assertEquals(aggregateVerdict([]).label, "unclear");
});

// ── scoreFaithfulness ────────────────────────────────────────────────────────────────────────────
Deno.test("scoreFaithfulness: faithfulness = supported / judged, unclear counts AGAINST (conservative)", () => {
  const s = scoreFaithfulness([v("supported"), v("supported"), v("not_supported"), v("unclear")]);
  assertEquals(s.judged, 4);
  assertEquals(s.supported, 2);
  assertEquals(s.not_supported, 1);
  assertEquals(s.unclear, 1);
  assertEquals(s.faithfulness, 2 / 4);
});

Deno.test("scoreFaithfulness: empty input is 0, never NaN", () => {
  const s = scoreFaithfulness([]);
  assertEquals(s.judged, 0);
  assertEquals(s.faithfulness, 0);
});

Deno.test("scoreFaithfulness: all-unclear is 0 faithfulness (not a free pass)", () => {
  const s = scoreFaithfulness([v("unclear"), v("unclear")]);
  assertEquals(s.faithfulness, 0);
  assertEquals(s.unclear, 2);
});

// ── judgeAnswers (DI orchestrator — the live model call is the injected fn; here a deterministic fake) ──
Deno.test("judgeAnswers: judges each cited source per-tag and aggregates supported-if-any", async () => {
  // fake judge: 'supported' iff the source text contains the claim's first word (deterministic, offline)
  const fake = (claim: string, sourceText: string): Promise<Verdict> =>
    Promise.resolve({ label: sourceText.toLowerCase().includes(claim.toLowerCase().split(" ")[0]) ? "supported" : "not_supported" });
  const answers = [
    {
      id: "ans1",
      points: [
        { text: "Sertraline arm exists.", citation_ids: ["4", "5"] }, // [5] lacks the word, [4] has it → supported-if-any
        { text: "Uncited claim.", citation_ids: [] }, // skipped — no judge call
      ] as FaithAnswerPoint[],
      sourceTexts: [
        { tag: "4", text: "sertraline and placebo" },
        { tag: "5", text: "unrelated background prose" },
      ] as FaithSourceText[],
    },
  ];
  const judged = await judgeAnswers(answers, fake);
  assertEquals(judged.length, 1);
  assertEquals(judged[0].claims.length, 1); // only the cited claim was judged
  assertEquals(judged[0].claims[0].verdict.label, "supported"); // [4] supports though [5] doesn't
  assertEquals(judged[0].claims[0].tags, ["4", "5"]);
});
