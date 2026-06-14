// DIAGNOSTIC (not committed): does the LLM classifier independently flag the two benchmark
// research questions as an emergency? index.ts routes on the UNION of preScreen + classify flags,
// so a preScreen-only fix is moot if classify also tags emergency_possible. Run:
//   set -a; . supabase/functions/.env; set +a
//   deno run -A --no-check scripts/diag/classify-check.ts
import { CLASSIFY_SYSTEM, CLASSIFY_TOOL } from "../../supabase/functions/ask/prompts.ts";
import { callTool } from "../../supabase/functions/ask/llm.ts";
import type { Intent } from "../../packages/shared/src/answer.ts";

const key = Deno.env.get("LLM_API_KEY");
if (!key) { console.error("LLM_API_KEY not set"); Deno.exit(1); }

const QS = [
  "Is there a study of sertraline for the treatment of noncardiac chest pain?",
  "Is there a trial of lisinopril to reduce shortness of breath caused by radiation therapy?",
  "I have chest pain and can't breathe after my pill", // control: MUST flag emergency
];

for (const q of QS) {
  const r = await callTool<{ intent: Intent; entity_mentions: string[]; safety_flags: string[] }>(
    {
      model: Deno.env.get("LLM_CLASSIFY_MODEL") ?? "gpt-4o-mini",
      max_tokens: 512, temperature: 0,
      system: CLASSIFY_SYSTEM, tools: [CLASSIFY_TOOL],
      messages: [{ role: "user", content: q }],
    },
    "classify", key,
  );
  const emerg = r.input.safety_flags.some((f) => ["emergency_possible", "overdose_possible", "self_harm"].includes(f));
  console.log(`${emerg ? "⚠️ EMERGENCY" : "✓ clean    "}  intent=${r.input.intent}  flags=[${r.input.safety_flags.join(", ")}]\n   Q: ${q}`);
}
