// Verify the field-scoped openFDA query survives the provider's URLSearchParams encoding and
// returns CLEAN, on-drug labels (no fraudulent name-drop products). Hits the live openFDA API.
//   deno run --allow-net --allow-env --env-file=supabase/functions/.env eval/openfda-fieldscope-check.ts
import { openFdaSearch } from "../supabase/functions/ask/live-sources.ts";
import { fetchOpenFdaLabels } from "../supabase/functions/core-source-sync/providers/openfda.ts";

interface Probe { label: string; mentions: string[]; expectEmpty: boolean; mustMention?: string }
const probes: Probe[] = [
  { label: "retatrutide (investigational — no real label)", mentions: ["retatrutide"], expectEmpty: true },
  { label: "tirzepatide (approved — Mounjaro/Zepbound)", mentions: ["tirzepatide"], expectEmpty: false, mustMention: "tirzepatide" },
  { label: "lisinopril (generic)", mentions: ["lisinopril"], expectEmpty: false, mustMention: "lisinopril" },
  { label: "Ozempic (brand; generic=semaglutide)", mentions: ["Ozempic"], expectEmpty: false, mustMention: "semaglutide" },
  { label: "interaction: lisinopril + spironolactone", mentions: ["lisinopril", "spironolactone"], expectEmpty: false },
  { label: "BPC-157 (research peptide — no label)", mentions: ["BPC-157"], expectEmpty: true },
];

let issues = 0;
for (const p of probes) {
  const q = openFdaSearch(p.mentions.join(" "), p.mentions);
  if (q === null) { console.log(`(skipped — no drug mention) ${p.label}`); continue; }
  const sources = await fetchOpenFdaLabels({ query: q, limit: 8 });
  const names = sources.map((s) => `${s.title}`.toLowerCase());
  const empty = sources.length === 0;

  let verdict = "✓";
  if (p.expectEmpty && !empty) { issues++; verdict = "✗ EXPECTED EMPTY (junk leaked?)"; }
  if (!p.expectEmpty && empty) { issues++; verdict = "✗ EXPECTED RESULTS, got none"; }
  if (!p.expectEmpty && p.mustMention && !empty) {
    const onDrug = names.some((n) => n.includes(p.mustMention!.toLowerCase()));
    if (!onDrug) { issues++; verdict = `✗ results NOT about ${p.mustMention}`; }
  }

  console.log(`${verdict}  ${p.label}`);
  console.log(`    query: ${q}`);
  console.log(`    -> ${sources.length} labels${sources.length ? ": " + sources.slice(0, 3).map((s) => s.title).join(" | ") : ""}`);
  await new Promise((r) => setTimeout(r, 350)); // be kind to openFDA
}

console.log(`\n${issues === 0 ? "✅ openFDA field-scope CLEAN" : `✗ ${issues} issue(s)`}`);
if (issues > 0) Deno.exit(1);
