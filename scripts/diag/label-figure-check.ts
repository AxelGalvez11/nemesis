import { gatherLiveCandidates, liveToChunk } from "../../supabase/functions/ask/live-sources.ts";
// claim: "hyperkalemia (serum potassium >5.7 mEq/L) occurred in ~1.4% of hypertensive patients
//         treated with lisinopril plus hydrochlorothiazide" — verify the exact figures are on-label.
const cands = await gatherLiveCandidates({ query: "lisinopril hydrochlorothiazide", mentions: ["lisinopril","hydrochlorothiazide"] });
for (const c of cands.filter((x:any)=>x.origin==="openfda").slice(0,3)) {
  const txt = liveToChunk(c, "1").chunk_text ?? "";
  for (const fig of ["1.4%","5.7 mEq","hyperkalemia"]) {
    const i = txt.toLowerCase().indexOf(fig.toLowerCase());
    console.log(`  "${fig}": ${i>=0 ? "FOUND → …"+txt.slice(Math.max(0,i-60),i+40).replace(/\s+/g," ")+"…" : "not in this chunk"}`);
  }
  console.log("  ---");
}
