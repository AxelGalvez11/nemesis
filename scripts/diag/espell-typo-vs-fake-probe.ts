// Linchpin experiment for the chat typo fix (pharmaorb-chat-tone-typo-diagnosis).
//
// The fabrication guard refuses any mention whose LITERAL token is absent from the retrieved evidence —
// so a typo of a REAL drug ("tesamorlin") is refused exactly like a FAKE ("florizagliflozin"), and falls
// back to the patronizing "ask your clinician" template. The only SAFE way to tell them apart is an
// AUTHORITATIVE medical spell-checker: it should CORRECT real typos to the real drug, but leave fakes
// alone (so a fake never gets "corrected" into a real neighbor and slips past the guard).
//
// This probe runs the known REAL typos and the known FAKES (from fabrication.test.ts) through NCBI
// espellCorrect and prints what comes back. PASS CONDITION for the approach:
//   • every real typo  → corrected to the real drug spelling
//   • every fake       → returned UNCHANGED (NOT corrected into a real drug)
//
// Run: deno run --env-file=supabase/functions/.env --allow-env --allow-net scripts/diag/espell-typo-vs-fake-probe.ts

import { espellCorrect } from "../../supabase/functions/core-source-sync/providers/pubmed.ts";

const REAL_TYPOS: Array<[string, string]> = [
  ["tesamorlin", "tesamorelin"],
  ["metfromin", "metformin"],
  ["lisinpril", "lisinopril"],
  ["ibuprfen", "ibuprofen"],
  ["semaglutid", "semaglutide"],
  ["atorvastain", "atorvastatin"],
];

// The exact fakes the fabrication guard is designed to refuse (fabrication.test.ts).
const FAKES = ["florizagliflozin", "zenelutide", "maglutide", "gliflozin", "BPC-158", "tirzepamide"];

function changed(orig: string, out: string): boolean {
  return orig.trim().toLowerCase() !== out.trim().toLowerCase();
}

console.log("=== REAL TYPOS (want: corrected to the real drug) ===");
let typoOk = 0;
for (const [typo, expected] of REAL_TYPOS) {
  const out = await espellCorrect(typo);
  const hit = out.trim().toLowerCase() === expected.toLowerCase();
  if (hit) typoOk++;
  console.log(`  ${hit ? "✓" : "✗"} "${typo}" → "${out}"  ${hit ? "" : `(wanted "${expected}")`}`);
}

console.log("\n=== KNOWN FAKES (want: UNCHANGED — NOT turned into a real drug) ===");
let fakeSafe = 0;
for (const fake of FAKES) {
  const out = await espellCorrect(fake);
  const wasChanged = changed(fake, out);
  if (!wasChanged) fakeSafe++;
  console.log(`  ${wasChanged ? "⚠ CHANGED" : "✓ unchanged"} "${fake}" → "${out}"`);
}

console.log(`\nREAL TYPOS corrected: ${typoOk}/${REAL_TYPOS.length}`);
console.log(`FAKES left unchanged: ${fakeSafe}/${FAKES.length}`);
console.log(
  fakeSafe === FAKES.length
    ? "\nVERDICT: espell is a SAFE corrector for this fix (fakes untouched). Implement: correct mentions via espell BEFORE the fabrication guard."
    : "\nVERDICT: ⚠ espell mangled a fake into a different token — must verify each CHANGED fake is NOT a real drug in the pool before trusting it. Approach needs a guard or a different corrector.",
);
