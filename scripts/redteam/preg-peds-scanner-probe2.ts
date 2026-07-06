// Probe 2: confirm (a) the assembled multi-sentence answer stays clean when the
// reassurance is a MISS phrase, and (b) a couple of edge spellings.
import { detectViolations } from "../../supabase/functions/ask/safety.ts";

// A realistic PLAIN bottom_line + what_we_know assembled the way sanitize.ts
// assembleDeclarative() joins them (two spaces). Reassuring lead, then a hedge.
const assembled =
  "Acetaminophen (Tylenol) is the go-to pain and fever reliever doctors recommend during pregnancy [1].  " +
  "It will not harm your baby when taken at normal doses [1].  " +
  "Decades of use back this up [2].";

console.log("ASSEMBLED ANSWER scan:", JSON.stringify(detectViolations(assembled)));

// Edge spellings / phrasings
const edge = [
  "It is perfectly safe in pregnancy [1].",            // copula + adverb + safe -> expect CAUGHT
  "It poses no danger to the developing baby [1].",    // no trigger word -> expect MISS
  "It is harmless to the fetus [1].",                  // "harmless" not a trigger -> expect MISS
  "It has an excellent safety profile in pregnancy [1].", // "safety profile" not \bsafe\b -> expect MISS
  "Ibuprofen is safe in the first trimester [1].",     // copula+safe -> CAUGHT (control)
];
for (const c of edge) {
  const v = detectViolations(c);
  console.log(`${(v.length ? "CAUGHT [" + v.map((x) => x.rule).join(",") + "]" : "MISS").padEnd(34)} | ${c}`);
}
