// DIAGNOSTIC (not committed): reproduce the "benign health question gets refused" failure path
// locally, using the REAL ask modules — same retrieval, same generate prompt/model, same safety
// filter as prod. Confirms WHICH gate discards the answer (safety_fallback vs no_source) without
// needing an app login.
//
// Run:
//   set -a; . supabase/functions/.env; . .env; set +a
//   deno run -A --no-check scripts/diag/benign-health-repro.ts "what helps with mild acne?"

import { gatherLiveCandidates, liveToChunk } from "../../supabase/functions/ask/live-sources.ts";
import { generate } from "../../supabase/functions/ask/generate.ts";
import { detectViolations } from "../../supabase/functions/ask/safety.ts";
import { enforceCitations } from "../../supabase/functions/ask/citation.ts";
import { isBenignSalvageable, resolveSafety } from "../../supabase/functions/ask/sanitize.ts";
import { CLASSIFY_SYSTEM, CLASSIFY_TOOL } from "../../supabase/functions/ask/prompts.ts";
import { callTool } from "../../supabase/functions/ask/llm.ts";
import type { RetrievedChunk } from "../../supabase/functions/ask/citation.ts";
import type { Intent, SafetyFlag } from "../../packages/shared/src/answer.ts";

const apiKey = Deno.env.get("LLM_API_KEY");
if (!apiKey) { console.error("LLM_API_KEY not set — source supabase/functions/.env first"); Deno.exit(1); }

const question = Deno.args[0] ?? "what helps with mild acne?";
console.log(`\nQ: ${question}\n${"=".repeat(60)}`);

// 1) real classify → the true intent prod would use
const cls = await callTool<{ intent: Intent; entity_mentions: string[]; safety_flags: string[] }>(
  {
    model: Deno.env.get("LLM_CLASSIFY_MODEL") ?? "gpt-4o-mini",
    max_tokens: 512, temperature: 0,
    system: CLASSIFY_SYSTEM, tools: [CLASSIFY_TOOL],
    messages: [{ role: "user", content: question }],
  },
  "classify", apiKey,
);
console.log(`classify → intent=${cls.input.intent}  mentions=[${cls.input.entity_mentions.join(", ")}]  flags=[${cls.input.safety_flags.join(", ")}]`);

// 2) real live retrieval (PubMed / Europe PMC / ClinicalTrials / FAERS / OpenAlex)
const cands = await gatherLiveCandidates({ query: question, mentions: cls.input.entity_mentions });
console.log(`live candidates: ${cands.length}  origins=[${[...new Set(cands.map((c) => c.origin))].join(", ")}]`);
const chunks: RetrievedChunk[] = cands.slice(0, 12).map((c, i) => liveToChunk(c, String(i + 1)));
if (chunks.length === 0) {
  console.log("\nNO SOURCES retrieved → prod returns NO_SOURCE_COPY (this would be a RETRIEVAL problem, not the filter).");
  Deno.exit(0);
}

// 3) real generate (gpt-4.1-mini, real prompt)
const gen = await generate({ question, intent: cls.input.intent, chunks, healthContext: null, apiKey });
console.log(`\n--- GENERATED bottom_line ---\n${gen.raw.bottom_line.text}`);
if (gen.raw.what_we_know.length) console.log(`\n--- what_we_know ---\n${gen.raw.what_we_know.map((p) => "• " + p.text).join("\n")}`);
if (gen.raw.safety_notes.length) console.log(`\n--- safety_notes ---\n${gen.raw.safety_notes.map((p) => "• " + p.text).join("\n")}`);

// 4) real safety filter on the assembled declarative text (exactly index.ts L252-257)
const assembled = [
  gen.raw.bottom_line.text,
  ...gen.raw.what_we_know.map((p) => p.text),
  ...gen.raw.safety_notes.map((p) => p.text),
  ...gen.raw.what_we_do_not_know.map((p) => p.text),
].join("  ");
const v = detectViolations(assembled);
console.log(`\n${"=".repeat(60)}\n[gate 1] detectViolations: ${v.length === 0 ? "CLEAR" : "TRIPPED (" + v.length + ")"}`);
for (const x of v) console.log(`   [${x.rule}]  "${x.snippet}"`);

// show the tags the model emitted, then run the real citation enforcement
console.log(`\n[tags] bottom_line.citations = [${gen.raw.bottom_line.citations.join(", ")}]`);
gen.raw.what_we_know.forEach((p, i) => console.log(`       what_we_know[${i}].citations = [${p.citations.join(", ")}]`));
const enf = enforceCitations({ ...gen.raw, chunks });
console.log(`\n[gate 2] enforceCitations.refusedUnsupported = ${enf.refusedUnsupported}  (final citations kept: ${enf.citations.length})`);

// Call the REAL prod decision (same gate, same re-scan) instead of a hand-mirrored copy, so this
// diagnostic cannot drift from index.ts. NOTE: this uses only the classifier's safety_flags; prod
// also unions preScreen flags, which are empty for a benign health question.
const salvageable = isBenignSalvageable(cls.input.intent, cls.input.safety_flags as SafetyFlag[]);
const resolution = resolveSafety(gen.raw, { salvageable });
console.log(`\n${"=".repeat(60)}\n=== VERDICT (real resolveSafety; salvageable=${salvageable}) ===`);
if (resolution.kind === "clean") {
  console.log(`→ DELIVERED clean (intent=${cls.input.intent}, ${enf.citations.length} citations). Filter not tripped.`);
} else if (resolution.kind === "salvaged") {
  console.log(`→ SALVAGED: dropped ${resolution.droppedCount} offending point(s) [${resolution.violations.map((x) => x.rule).join(", ")}], delivered the rest. (Before this fix: whole answer discarded.)`);
} else {
  console.log(`→ safety_fallback (${resolution.reason}) → CONSERVATIVE_FALLBACK_COPY. tripped: ${resolution.violations.map((x) => x.rule).join(", ")}`);
}
