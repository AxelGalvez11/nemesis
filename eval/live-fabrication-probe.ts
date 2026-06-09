// DIAGNOSTIC (not a gate): run the fabricated-drug probes through the REAL live-source gather +
// rerank, and answer one question — do the high-scoring live candidates actually contain the
// fabricated drug token, or are they class-siblings (real drugs that share the class/indication)?
//
// This drives the fabrication-refusal guard design. If the top candidates are class-siblings that
// NEVER name the fake token, then a rerank SCORE floor cannot refuse them (they score high on
// genuine class relevance) — and a categorical NAME-PRESENCE check is the right guard.
//
// Run: deno run --allow-net --allow-env --allow-read --env-file=.env eval/live-fabrication-probe.ts
import { gatherLiveCandidates, type LiveCandidate } from "../supabase/functions/ask/live-sources.ts";

const RR_MODEL = Deno.env.get("RR_MODEL") ?? "rerank-2.5";

/** Rerank and KEEP the relevance score (the gate's rerankRows discards it). Most-relevant first. */
async function rerankWithScores(query: string, cands: LiveCandidate[]): Promise<Array<LiveCandidate & { score: number }>> {
  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  if (!apiKey) throw new Error("VOYAGE_API_KEY required");
  const res = await fetch("https://api.voyageai.com/v1/rerank", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: RR_MODEL, query, documents: cands.map((c) => c.text), truncation: true }),
  });
  if (!res.ok) throw new Error(`voyage rerank failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.json();
  const data = body.data as Array<{ index: number; relevance_score: number }>;
  return data.map((d) => ({ ...cands[d.index], score: d.relevance_score }));
}

const probes = JSON.parse(await Deno.readTextFile("eval/golden/adversarial-probes.json")).probes as Array<{
  id: string;
  question: string;
  fabricated_token: string;
  real_neighbor: string;
}>;

function names(token: string, ...texts: (string | null | undefined)[]): boolean {
  const t = token.toLowerCase();
  return texts.some((s) => (s ?? "").toLowerCase().includes(t));
}

for (const probe of probes) {
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`PROBE ${probe.id}`);
  console.log(`  Q: ${probe.question}`);
  console.log(`  fake token: "${probe.fabricated_token}"   real neighbor: ${probe.real_neighbor}`);

  const live = await gatherLiveCandidates({ query: probe.question });
  console.log(`  live candidates returned: ${live.length}`);
  if (live.length === 0) {
    console.log(`  → 0 live candidates (this fake refuses by emptiness).`);
    continue;
  }

  // Rerank on the cross-encoder's single scale, keeping the relevance score.
  const ranked = await rerankWithScores(probe.question, live);

  let topNamesFake = false;
  console.log(`  ── ranked candidates (most-relevant first) ──`);
  ranked.slice(0, 8).forEach((c, i) => {
    const hit = names(probe.fabricated_token, c.title, c.text);
    if (i === 0 && hit) topNamesFake = true;
    console.log(
      `   ${String(i + 1).padStart(2)}. [${c.origin.padEnd(14)}] score=${c.score.toFixed(4)} ` +
        `names_fake=${hit ? "YES" : "no "}  ${(c.title ?? "").slice(0, 72)}`,
    );
  });

  const anyNamesFake = ranked.some((c) => names(probe.fabricated_token, c.title, c.text));
  console.log(`  ── verdict ──`);
  console.log(`   ANY candidate names the fake token: ${anyNamesFake ? "YES" : "NO"}`);
  console.log(`   TOP candidate names the fake token: ${topNamesFake ? "YES" : "NO"}`);
  console.log(
    `   → ${
      anyNamesFake
        ? "name-presence would NOT refuse (a record literally names the fake) — inspect that record."
        : "name-presence WOULD refuse (no record names the fake; all are class-siblings) — the correct outcome."
    }`,
  );
}
