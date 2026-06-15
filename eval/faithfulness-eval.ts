// eval/faithfulness-eval.ts
//
// The SEMANTIC faithfulness scorecard runner — the gated live pass of the answer-quality benchmark.
// Reuses the PURE, unit-tested harness in eval/lib/faithfulness.ts and injects a live judge model;
// like answer-eval.ts this is run ON DEMAND (LLM + API spend), never a CI gate.
//
// It judges every load-bearing cited claim in a saved /ask transcript set with a strong model
// (gpt-4.1, temp 0 — stronger than & distinct from the gpt-4.1-mini generator, to avoid self-
// preference bias) and reports the LLM-judged semantic faithfulness: of the claims whose cited
// source(s) we judged, what fraction does the judge confirm the source genuinely supports? Plus the
// list of not_supported / unclear claims to investigate. PER-TAG (supported-if-any), so a claim's
// cited sources are judged separately and never unioned into one giant call (openFDA labels are huge).
//
// HONESTY: this is MEASUREMENT — it never touches the live /ask path and never gates a user's answer.
// The verdict is an LLM's opinion (LLM-judged, not ground truth); `unclear` counts AGAINST faithfulness.
//
// Run (judge the saved v34 scorecard):
//   set -a; . supabase/functions/.env; set +a
//   deno run --allow-read --allow-env --allow-net eval/faithfulness-eval.ts [transcripts.json]

import {
  aggregateVerdict,
  buildJudgePrompt,
  claimSourcePairs,
  parseVerdict,
  scoreFaithfulness,
  type FaithAnswerPoint,
  type FaithSourceText,
  type Verdict,
} from "./lib/faithfulness.ts";

const KEY = Deno.env.get("LLM_API_KEY");
const BASE = Deno.env.get("LLM_BASE_URL") ?? "https://api.openai.com/v1";
const JUDGE_MODEL = Deno.env.get("FAITH_JUDGE_MODEL") ?? "gpt-4.1"; // pinned; distinct from the generator
const CONCURRENCY = Number(Deno.env.get("FAITH_CONCURRENCY") ?? "2"); // account is a 30k-TPM tier; stay well under
const FETCH_TIMEOUT_MS = 45000; // a single judge call can't hang a worker forever (the v2 stall bug)
const JUDGE_SOURCE_CHARS = Number(Deno.env.get("FAITH_SOURCE_CHARS") ?? "12000"); // ~3k tokens; full labels (50-66k) drove the TPM limit
const BUDGET_MS = Number(Deno.env.get("FAITH_BUDGET_MS") ?? "480000"); // wall-clock cap (8 min): the run ALWAYS terminates; coverage reported
const SAMPLE = Number(Deno.env.get("FAITH_SAMPLE") ?? "0"); // >0 = judge a stratified sample of N claims (spend-safe)
const MAX_CALLS = Number(Deno.env.get("FAITH_MAX_CALLS") ?? "150"); // spend guard: refuse to fire more calls than this without an explicit opt-in
const TRANSCRIPTS = Deno.args[0] ?? "/tmp/pharmaorb-scorecard-v34.json";
if (!KEY) { console.error("LLM_API_KEY required (source supabase/functions/.env)"); Deno.exit(2); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const oneLine = (s: string, n = 150) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** A judged source, or an explicit ERROR. An errored call must NEVER masquerade as a verdict — a failed
 *  request counted as `unclear` would silently crater the faithfulness number (the v1 bug). Errored jobs
 *  are excluded from the score and reported separately. `skipped` = ran out of wall-clock budget. */
type JobResult = { ok: true; verdict: Verdict } | { ok: false; error: string; skipped?: boolean };

/** Live judge for one (claim, single-source) pair: pinned model, temp 0, JSON out. Per-call AbortController
 *  timeout (no hung socket can stall a worker), honors Retry-After on 429, backs off on 5xx; only a hard
 *  failure or exhausted retries returns an error. */
async function liveJudge(claim: string, sourceText: string): Promise<JobResult> {
  const MAX = 5;
  for (let attempt = 0; attempt < MAX; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: JUDGE_MODEL,
          temperature: 0,
          seed: 7,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: buildJudgePrompt(claim, sourceText) }],
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        await res.body?.cancel();
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 + 250 : Math.min(15000, 1200 * 2 ** attempt));
        continue;
      }
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const j = await res.json();
      return { ok: true, verdict: parseVerdict(j.choices?.[0]?.message?.content ?? "") };
    } catch (e) {
      await sleep(Math.min(12000, 800 * 2 ** attempt));
      if (attempt === MAX - 1) return { ok: false, error: `error: ${e instanceof Error ? e.message : e}` };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: "retries exhausted (rate limit?)" };
}

/** Bounded-concurrency map (a worker pool); preserves input order. */
async function mapPool<T, R>(items: readonly T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

interface Pt { text: string; citation_ids?: string[] }
interface Resp { __error?: string; answer_sections?: { what_we_know?: Pt[]; safety_notes?: Pt[] }; source_texts?: FaithSourceText[] }
const data = JSON.parse(await Deno.readTextFile(TRANSCRIPTS)) as { transcripts: Array<{ id: string; response: Resp }> };

// Reduce transcripts to {id, points, sourceTexts}; drop errored / no-source-text answers.
const answers = data.transcripts
  .filter((t) => t.response && !t.response.__error && (t.response.source_texts?.length ?? 0) > 0)
  .map((t) => ({
    id: t.id,
    points: [...(t.response.answer_sections?.what_we_know ?? []), ...(t.response.answer_sections?.safety_notes ?? [])] as FaithAnswerPoint[],
    sourceTexts: t.response.source_texts ?? [],
  }));

// Flatten to per-source judge jobs, tagged with their claim index (so we can aggregate per claim after).
// The source fed to the judge is capped at JUDGE_SOURCE_CHARS: a 50-66k-char openFDA label sent whole is
// a ~16k-token prompt, and a fleet of those blows the tokens-per-minute cap (the rate-limit stall). 16k
// chars keeps abstracts/trial records whole and a meaningful slice of a label (truncation disclosed).
interface ClaimRow { aid: string; claim: string; tags: string[]; droppedTags: number }
const claims: ClaimRow[] = [];
const jobs: Array<{ ci: number; claim: string; text: string }> = [];
for (const a of answers) {
  for (const unit of claimSourcePairs(a.points, a.sourceTexts)) {
    const ci = claims.length;
    claims.push({ aid: a.id, claim: unit.claim, tags: unit.tags, droppedTags: unit.droppedTags });
    for (const s of unit.sources) jobs.push({ ci, claim: unit.claim, text: s.text.slice(0, JUDGE_SOURCE_CHARS) });
  }
}
// Stratified sample (spend-safe): pick N evenly-spaced claims across the transcript-ordered list, so the
// sample spans many questions, not one drug. FAITH_SAMPLE=0 considers all claims (still guarded below).
const consideredCi = new Set<number>();
if (SAMPLE > 0 && SAMPLE < claims.length) {
  const step = claims.length / SAMPLE;
  for (let k = 0; k < SAMPLE; k++) consideredCi.add(Math.floor(k * step));
} else {
  for (let ci = 0; ci < claims.length; ci++) consideredCi.add(ci);
}
let activeJobs = jobs.filter((j) => consideredCi.has(j.ci));
// SPEND GUARD (the incident lesson): never fire a huge blast by accident. The 30k-TPM account can't take
// hundreds of label-sized calls — sample, or opt in explicitly via FAITH_MAX_CALLS.
if (activeJobs.length > MAX_CALLS) {
  console.error(`ABORT (spend guard): ${activeJobs.length} judge calls > FAITH_MAX_CALLS=${MAX_CALLS}. Set FAITH_SAMPLE=<N> to sample, or raise FAITH_MAX_CALLS to run all.`);
  Deno.exit(3);
}
// Small sources first so the fast majority complete inside the budget; skips concentrate on the big labels.
activeJobs = activeJobs.sort((a, b) => a.text.length - b.text.length);

const deadline = Date.now() + BUDGET_MS;
console.error(`Judging ${consideredCi.size} cited claims${SAMPLE ? ` (stratified sample of ${claims.length})` : ""} via ${activeJobs.length} per-source calls (model ${JUDGE_MODEL}, concurrency ${CONCURRENCY}, ${Math.round(BUDGET_MS / 1000)}s budget)…`);
const jobResults = await mapPool(activeJobs, CONCURRENCY, (j): Promise<JobResult> =>
  Date.now() > deadline ? Promise.resolve({ ok: false, error: "skipped (time budget)", skipped: true }) : liveJudge(j.claim, j.text));

// Group the OK verdicts per claim; an errored source-job is DROPPED (not counted as unclear). A claim
// whose every source-job errored is itself an ERROR (excluded from the score), so rate-limit failures
// can never deflate faithfulness — they show up as `errored`, an explicit data-quality signal.
const okByClaim = new Map<number, Verdict[]>();
let jobErrors = 0;
let jobSkipped = 0;
activeJobs.forEach((j, i) => {
  const r = jobResults[i];
  if (!r.ok) { if (r.skipped) jobSkipped++; else jobErrors++; return; }
  const arr = okByClaim.get(j.ci) ?? [];
  arr.push(r.verdict);
  okByClaim.set(j.ci, arr);
});
const considered = [...consideredCi].map((ci) => ({ ...claims[ci], verdicts: okByClaim.get(ci) ?? [] }));
const scored = considered.filter((c) => c.verdicts.length > 0).map((c) => ({ ...c, verdict: aggregateVerdict(c.verdicts) }));
const unjudgedClaims = considered.length - scored.length; // no successful source-call (error or time budget)
const score = scoreFaithfulness(scored.map((c) => c.verdict));

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
console.error(
  `\nSemantic faithfulness scorecard (LLM-judged, ${JUDGE_MODEL} @ temp 0) — ${TRANSCRIPTS}\n` +
    `  faithfulness   ${pct(score.faithfulness)}  (${score.supported}/${score.judged} judged claims the judge confirms the cited source supports)\n` +
    `  not_supported  ${score.not_supported}\n` +
    `  unclear        ${score.unclear}\n` +
    `  ── coverage / data quality ──\n` +
    `  claims judged  ${scored.length}/${considered.length}${SAMPLE ? ` sampled (of ${claims.length} total)` : ""}  (${pct(scored.length / Math.max(1, considered.length))} of considered claims got a real verdict)\n` +
    `  unjudged       ${unjudgedClaims}  (no successful source-call: rate-limit error or time budget)\n` +
    `  per-call: ${jobErrors} errored, ${jobSkipped} skipped (budget), of ${activeJobs.length}\n`,
);

const flagged = scored.filter((c) => c.verdict.label !== "supported");
console.error(`Flagged (not_supported / unclear) — ${flagged.length} judged claims to investigate:`);
for (const c of flagged) {
  console.error(`  [${c.verdict.label}] (${c.aid}) tags=[${c.tags.join(",")}]${c.droppedTags ? ` +${c.droppedTags} uncapped` : ""}: ${oneLine(c.claim, 150)}`);
}

const outPath = TRANSCRIPTS.replace(/\.json$/, "") + ".faithfulness.json";
await Deno.writeTextFile(outPath, JSON.stringify({ model: JUDGE_MODEL, transcripts: TRANSCRIPTS, sample: SAMPLE || null, score, claimsConsidered: considered.length, claimsTotal: claims.length, claimsJudged: scored.length, jobErrors, jobSkipped, scored }, null, 2));
console.error(`\nDetail written to ${outPath}`);
console.log(JSON.stringify({ ...score, claimsJudged: scored.length, claimsConsidered: considered.length, claimsTotal: claims.length, jobErrors, jobSkipped }));
