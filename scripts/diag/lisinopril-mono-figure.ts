import { gatherLiveCandidates, liveToChunk } from "../../supabase/functions/ask/live-sources.ts";
// Does the ">5.7 mEq/L … ~1.4% hyperkalemia" figure exist on the lisinopril MONOTHERAPY label?
const cands = await gatherLiveCandidates({ query: "lisinopril", mentions: ["lisinopril"] });
const fda = cands.filter((c:any)=>c.origin==="openfda");
console.log(`lisinopril openFDA candidates: ${fda.length}`);
for (const c of fda.slice(0,6)) {
  const txt = liveToChunk(c,"1").chunk_text ?? "";
  const isCombo = /hydrochlorothiazide/i.test((c.title??"")+txt.slice(0,200));
  const i57 = txt.search(/5\.7\s*mEq/i);
  const ctx = i57>=0 ? txt.slice(Math.max(0,i57-90), i57+70).replace(/\s+/g," ") : null;
  console.log(`  • "${(c.title??"").slice(0,60)}" combo=${isCombo} len=${txt.length}  >5.7mEq=${i57>=0?"FOUND":"no"}`);
  if (ctx) console.log(`     → …${ctx}…`);
}
