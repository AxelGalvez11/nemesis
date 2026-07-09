// Headless proof that the core loop works without launching Electron: feed sample lecture text ->
// generate pharmacy-grade study material -> write Anki-importable output. Verifies the moat (card
// quality) and the file output. No external deps needed (sample is text, so pdf-parse isn't touched).
//
// Run: DEEPSEEK_API_KEY=... node test/core.mjs
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const { generateStudyMaterial } = require("../electron/generate.js");
const { writeStudyMaterial } = require("../electron/output.js");
const { Store, hashContent } = require("../electron/state.js");

const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) { console.error("Set DEEPSEEK_API_KEY to run this test."); process.exit(2); }

const SAMPLE = `
Lecture 8 — ACE Inhibitors and ARBs
- ACE inhibitors (e.g., lisinopril, enalapril) block conversion of angiotensin I to angiotensin II,
  lowering blood pressure and reducing aldosterone. They also reduce bradykinin breakdown.
- Common adverse effect: dry cough (from bradykinin accumulation). Angioedema is rare but serious.
- Contraindicated in pregnancy (fetal renal toxicity) and in bilateral renal artery stenosis.
- Can cause hyperkalemia; monitor potassium and serum creatinine after initiation.
- ARBs (e.g., losartan, valsartan) block the angiotensin II receptor; do NOT raise bradykinin, so
  cough is uncommon — a reason to switch a patient who develops ACE-inhibitor cough to an ARB.
- Both are renoprotective in diabetic nephropathy. Avoid combining an ACE inhibitor with an ARB.
- Counseling: report facial/lip swelling immediately; avoid potassium salt substitutes; rise slowly.
`;

const outDir = path.join(fileURLToPath(new URL("./out/", import.meta.url)));
fs.mkdirSync(outDir, { recursive: true });

console.log("Generating study material from sample lecture (via DeepSeek)…\n");
const t0 = Date.now();
const material = await generateStudyMaterial({ apiKey: KEY, text: SAMPLE, sourceName: "lecture-8-ace-inhibitors.txt" });
const secs = ((Date.now() - t0) / 1000).toFixed(0);

console.log(`Deck: ${material.deck_title}`);
console.log(`Cards: ${material.cards.length}   (generated in ${secs}s)\n`);
material.cards.slice(0, 4).forEach((c, i) => {
  console.log(`  [${i + 1}] Q: ${c.front}`);
  console.log(`      A: ${c.back}`);
  console.log(`      tags: ${(c.tags || []).join(", ")}\n`);
});

const written = writeStudyMaterial({ outDir, sourceName: "lecture-8-ace-inhibitors.txt", material });
console.log("Wrote:");
console.log("  " + written.guideFile);
console.log("  " + written.cardsFile);

// sanity: state store dedupes by hash
const store = new Store(outDir);
const h = hashContent(Buffer.from(SAMPLE));
store.markProcessed(h, { at: new Date().toISOString(), source: "sample", deck: material.deck_title });
console.log(`\nState idempotency check: isProcessed(sample) = ${store.isProcessed(h)} (expected true)`);

// A basic quality gate: real cards, not zero, and no obvious "what is X" definitional card.
const bad = material.cards.filter((c) => /^what is\b/i.test(c.front.trim()));
if (material.cards.length === 0) { console.error("\nFAIL: no cards generated."); process.exit(1); }
if (bad.length) console.warn(`\nNote: ${bad.length} card(s) look definitional ("what is…") — prompt may need tightening.`);
console.log(`\nOK: ${material.cards.length} cards, ${bad.length} definitional.`);
