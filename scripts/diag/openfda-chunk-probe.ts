import { gatherLiveCandidates, liveToChunk } from "../../supabase/functions/ask/live-sources.ts";
for (const drug of ["semaglutide","lisinopril"]) {
  const cands = await gatherLiveCandidates({ query: drug, mentions: [drug] });
  const fda = cands.filter((c:any)=>c.origin==="openfda");
  console.log(`\n=== ${drug}: ${fda.length} openFDA candidate(s) ===`);
  fda.slice(0,2).forEach((c:any,i:number)=>{
    const ch = liveToChunk(c, String(i+1));
    const txt = ch.chunk_text ?? "";
    const has = (w:string)=> new RegExp(w,"i").test(txt) ? "YES":"no";
    console.log(`  cand[${i}] title="${(c.title??"").slice(0,70)}"  chunk_text len=${txt.length}`);
    console.log(`    contains: thyroid=${has("thyroid")} pancreatitis=${has("pancreatitis")} retinopathy=${has("retinopath")} hyperkalemia=${has("hyperkalemia")} potassium=${has("potassium")}`);
    console.log(`    first 240: ${txt.slice(0,240).replace(/\s+/g," ")}`);
  });
}
