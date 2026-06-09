// SAFETY GATE (manual / pre-enable): prove the fabrication guard refuses class-plausible fake drugs
// through the FULL live path the wiring uses — gather live → rerank → keep top-N → name-presence —
// and that a real-but-new drug (retatrutide) CLEARS. Exits nonzero on any leak.
//
// This hits live external APIs + Voyage rerank, so it is NOT in the blocking CI (which stays
// dense-only with LIVE_SOURCES off). Run it before flipping LIVE_SOURCES=on:
//   deno run --allow-net --allow-env --allow-read --env-file=.env eval/live-pipeline-safety.ts
//
// The deterministic guard LOGIC is covered by supabase/functions/ask/fabrication.test.ts (in CI).
// This eval validates the guard against REAL live-source behavior, the thing unit tests can't mock honestly.
import { gatherLiveCandidates } from "../supabase/functions/ask/live-sources.ts";
import { rerankChunks } from "../supabase/functions/ask/rerank.ts";
import { isFabricatedDrugQuery, liveToChunk } from "../supabase/functions/ask/fabrication.ts";
import type { RetrievedChunk } from "../supabase/functions/ask/citation.ts";

const MATCH_COUNT = 8; // mirror index.ts

/** Mirror augmentWithLive (live-only — library would add MORE class-siblings, never the fake). */
async function retainedChunks(question: string, mentions: string[]): Promise<RetrievedChunk[]> {
  const term = mentions.length ? mentions.join(" ") : question;
  const live = await gatherLiveCandidates({ query: term, perSourceMax: 8 });
  if (live.length === 0) return [];
  const combined = live.map((c, i) => liveToChunk(c, String(i + 1)));
  let ordered: RetrievedChunk[];
  try {
    ordered = await rerankChunks(question, combined);
  } catch {
    ordered = combined;
  }
  return ordered.slice(0, MATCH_COUNT).map((c, i) => ({ ...c, tag: String(i + 1) }));
}

interface Case {
  label: string;
  question: string;
  mentions: string[];
  expectRefuse: boolean;
}

const probes = JSON.parse(await Deno.readTextFile("eval/golden/adversarial-probes.json")).probes as Array<{
  id: string;
  question: string;
  fabricated_token: string;
}>;

const cases: Case[] = [
  // Fabricated drugs (from the adversarial probe set) — the guard MUST refuse.
  ...probes.map((p) => ({ label: `FAKE ${p.id}`, question: p.question, mentions: [p.fabricated_token], expectRefuse: true })),
  // Real-but-new control — sparse in the entity table, but live records literally name it → MUST CLEAR.
  {
    label: "REAL retatrutide (new drug control)",
    question: "What weight loss has retatrutide shown in obesity trials?",
    mentions: ["retatrutide"],
    expectRefuse: false,
  },
  // Real established drug control — MUST CLEAR.
  {
    label: "REAL dapagliflozin (established control)",
    question: "Is dapagliflozin approved for heart failure?",
    mentions: ["dapagliflozin"],
    expectRefuse: false,
  },
];

let failures = 0;
for (const c of cases) {
  const chunks = await retainedChunks(c.question, c.mentions);
  const refused = isFabricatedDrugQuery(c.mentions, chunks);
  const pass = refused === c.expectRefuse;
  if (!pass) failures++;
  console.log(
    `${pass ? "✓" : "✗"} ${c.label.padEnd(36)} retained=${String(chunks.length).padStart(2)} ` +
      `refused=${refused} expected=${c.expectRefuse}` +
      (pass ? "" : "   ← LEAK"),
  );
}

console.log(`\n${failures === 0 ? "✓ PASS" : `✗ FAIL — ${failures} case(s) leaked`}`);
if (failures > 0) Deno.exit(1);
