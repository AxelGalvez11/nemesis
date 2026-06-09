// Demo: assemble a drug monograph (label backbone + live "recent evidence" + dose-adjustment
// pointers), all cited. Read-only. Run:
//   deno run --allow-net --allow-env --allow-read --env-file=.env eval/monograph-demo.ts "metformin"
import { readEnv } from "./lib/corpus.ts";
import { buildMonograph } from "../supabase/functions/ask/monograph.ts";

const env = readEnv();
const drug = Deno.args[0] ?? "metformin";

const m = await buildMonograph({ drug, sbUrl: env.SB_URL, serviceKey: env.SERVICE_KEY });

console.log(`\n══════ MONOGRAPH: ${m.drug} ══════`);
if (m.label) {
  console.log(`Backbone: ${m.label.title}`);
  console.log(`Source: ${m.label.provider} ${m.label.provider_id}  ·  FDA label revised: ${m.label.revised ?? "n/a"}`);
} else {
  console.log("No label found in corpus for this drug.");
}

console.log(`\n── LABEL SECTIONS (${m.sections.length}) ──`);
for (const s of m.sections) {
  console.log(`  • ${s.heading}  (${s.text.length} chars)  "${s.text.slice(0, 64).replace(/\n/g, " ")}…"`);
}

console.log(`\n── DOSE ADJUSTMENT ──`);
console.log(`  renal dosing text in label: ${m.doseAdjustment.renalText} · hepatic: ${m.doseAdjustment.hepaticText}`);
console.log(`  suggested calculators: ${m.doseAdjustment.suggestedCalculators.join(", ") || "(none)"}`);
console.log(`  interactions section present: ${m.interactions ? "yes (" + m.interactions.length + " chars)" : "no"}`);

console.log(`\n── RECENT EVIDENCE (live, since the label) ──`);
for (const e of m.recentEvidence) {
  console.log(`  • [${e.origin}] ${e.provider_id}  ${e.title.slice(0, 70)}`);
}
console.log(`\n(disclaimer: ${m.disclaimer.slice(0, 90)}…)`);
