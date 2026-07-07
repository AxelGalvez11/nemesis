// DIAGNOSTIC (not committed): does MedlinePlus actually get CITED (not merely surface) on benign,
// general-health questions — and does it shift the answer's register toward practical guidance?
//
// Mirrors the prod retrieval path index.ts::augmentWithLive EXACTLY: gather(term) → liveToChunk →
// rerank(question) → slice MATCH_COUNT → retag 1..N → generate → enforceCitations. The ONE difference
// is no library chunks (no DB offline). For a benign consumer-health question that is close to prod —
// the library is research/label text, so live dominates the 12 slots anyway — but it does remove the
// library's competition for those slots, so this is a SLIGHTLY easier bar than prod. Therefore:
//   • MedlinePlus CITED here  → necessary, not sufficient (still must clear lib competition in prod)
//   • MedlinePlus NEVER cited  → decisive: it's dead weight, reconsider before committing.
//
// Run:
//   set -a; . supabase/functions/.env; . .env; set +a
//   deno run -A --no-check scripts/diag/medlineplus-value-check.ts ["q1" "q2" ...]

import { gatherLiveCandidates, liveToChunk } from "../../supabase/functions/ask/live-sources.ts";
import { rerankChunks } from "../../supabase/functions/ask/rerank.ts";
import { generate } from "../../supabase/functions/ask/generate.ts";
import { enforceCitations } from "../../supabase/functions/ask/citation.ts";
import { CLASSIFY_SYSTEM, CLASSIFY_TOOL } from "../../supabase/functions/ask/prompts.ts";
import { callTool } from "../../supabase/functions/ask/llm.ts";
import type { RetrievedChunk } from "../../supabase/functions/ask/citation.ts";
import type { Intent } from "../../packages/shared/src/answer.ts";

const MATCH_COUNT = 12; // index.ts:76
const LIVE_PER_SOURCE_MAX = 8; // index.ts:82

const apiKey = Deno.env.get("LLM_API_KEY");
if (!apiKey) { console.error("LLM_API_KEY not set — source supabase/functions/.env first"); Deno.exit(1); }

// A small panel of the benign "general guidance" questions MedlinePlus is meant to serve — NOT one
// self-invented case (an earlier n=1 conclusion was rightly flagged). Override via CLI args.
const PANEL = [
  "what helps with heartburn?",
  "what helps with mild acne?",
  "how do i treat a sore throat?",
  "what helps with poison ivy?",
];
const questions = Deno.args.length ? Deno.args : PANEL;

let citedCount = 0;
const surfacedCount = { n: 0 };

for (const question of questions) {
  console.log(`\n${"=".repeat(72)}\nQ: ${question}\n${"=".repeat(72)}`);

  // 1) real classify → intent + mentions (prod builds the gather term from these)
  const cls = await callTool<{ intent: Intent; entity_mentions: string[]; safety_flags: string[] }>(
    {
      model: Deno.env.get("LLM_CLASSIFY_MODEL") ?? "gpt-4o-mini",
      max_tokens: 512, temperature: 0,
      system: CLASSIFY_SYSTEM, tools: [CLASSIFY_TOOL],
      messages: [{ role: "user", content: question }],
    },
    "classify", apiKey,
  );
  const mentions = cls.input.entity_mentions ?? [];
  console.log(`classify → intent=${cls.input.intent}  mentions=[${mentions.join(", ")}]`);

  // 2) gather by TERM (mentions joined, else the question) — augmentWithLive line 368-369
  const term = mentions.length ? mentions.join(" ") : question;
  const live = await gatherLiveCandidates({ query: term, mentions, perSourceMax: LIVE_PER_SOURCE_MAX });
  const origins = [...new Set(live.map((c) => c.origin))];
  console.log(`live candidates: ${live.length}  origins surfaced=[${origins.join(", ")}]`);
  if (origins.includes("medlineplus")) surfacedCount.n++;
  if (live.length === 0) { console.log("→ NO live candidates (retrieval gap, not a citation question)."); continue; }

  // 3) liveToChunk (temp tags) → rerank by the QUESTION → slice MATCH_COUNT → retag 1..N (line 372-381)
  const combined: RetrievedChunk[] = live.map((c, i) => liveToChunk(c, String(i + 1)));
  let ordered: RetrievedChunk[];
  try {
    ordered = await rerankChunks(question, combined);
  } catch (e) {
    console.log(`rerank failed (${(e as Error).message}) — skipping`); continue;
  }
  const top = ordered.slice(0, MATCH_COUNT).map((c, i) => ({ ...c, tag: String(i + 1) }));
  const mpInTop = top.some((c) => c.provider === "medlineplus");
  console.log(`reranked top-${MATCH_COUNT} providers=[${top.map((c) => c.provider).join(", ")}]`);
  console.log(`MedlinePlus survived rerank into top-${MATCH_COUNT}? ${mpInTop ? "YES" : "no"}`);

  // 4) real generate on the reranked top slice
  const gen = await generate({ question, intent: cls.input.intent, chunks: top, healthContext: null, apiKey });

  // 5) real citation enforcement → which providers actually got CITED
  const enf = enforceCitations({ ...gen.raw, chunks: top });
  const citedProviders = enf.citations.map((c) => c.source_type);
  const mpCited = citedProviders.includes("medlineplus");
  if (mpCited) citedCount++;

  console.log(`\n--- bottom_line ---\n${gen.raw.bottom_line.text}`);
  if (gen.raw.what_we_know.length) {
    console.log(`--- what_we_know ---\n${gen.raw.what_we_know.map((p) => "• " + p.text).join("\n")}`);
  }
  // Show which MedlinePlus topic(s) were cited, if any.
  const mpCites = enf.citations.filter((c) => c.source_type === "medlineplus");
  if (mpCites.length) console.log(`MedlinePlus cited as: ${mpCites.map((c) => `[${c.chunk_tag}] ${c.title}`).join("; ")}`);
  console.log(`\ncited providers=[${citedProviders.join(", ")}]  refusedUnsupported=${enf.refusedUnsupported}`);
  console.log(`>>> MedlinePlus CITED? ${mpCited ? "YES ✓" : "NO"}`);
}

console.log(`\n${"#".repeat(72)}\nSUMMARY: MedlinePlus surfaced in ${surfacedCount.n}/${questions.length} · CITED in ${citedCount}/${questions.length}\n${"#".repeat(72)}`);
