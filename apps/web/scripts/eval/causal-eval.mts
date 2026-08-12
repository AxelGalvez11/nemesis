/**
 * Evaluate the causal extractor against the labelled benchmarks, through the REAL path.
 *
 * 🔴 IT CALLS `nemesis-llm`, THE SAME VALVE THE APP USES. A provider-specific evaluation would
 * measure a model we do not ship. The valve owns the model name and silently fails over between
 * providers, so the model that ANSWERED is recorded per call rather than the one requested.
 *
 * Usage: NEMESIS_EVAL_KEY=nmk_... tsx scripts/eval/causal-eval.mts <set> [limit]
 *   set: dev | holdout | challenge
 */
import { readFileSync } from "node:fs";

import {
  CAUSAL_EXTRACTION_PROMPT,
  CAUSAL_EXTRACTION_VERSION,
  CAUSAL_SCHEMA_VERSION,
  validateCausalEdges,
  type RawCausalEdge,
} from "../../lib/learn/causal-extraction-contract";
import { CAUSAL_BENCHMARK, EXPECTED_EDGES, isHeldOut } from "../../lib/learn/__fixtures__/causal-benchmark";
import { CAUSAL_CHALLENGE } from "../../lib/learn/__fixtures__/causal-challenge";
import { normalizeForIdentity } from "../../lib/learn/knowledge-identity";

const KEY = process.env.NEMESIS_EVAL_KEY ?? "";
if (!KEY.startsWith("nmk_")) { console.error("NEMESIS_EVAL_KEY missing"); process.exit(1); }
const env = readFileSync(`${process.env.HOME}/Desktop/AIcodingProjects/nemesis/.env`, "utf8");
const SUPABASE_URL = env.split("\n").find((l) => l.startsWith("SUPABASE_URL="))!.slice("SUPABASE_URL=".length).trim();
const LLM = `${SUPABASE_URL}/functions/v1/nemesis-llm/v1/chat/completions`;

/** The production configuration. The valve resolves the final model name itself. */
const MODEL = "deepseek-chat";

interface Call { text: string | null; served: string | null; error: string | null }

async function extract(passage: string): Promise<Call> {
  const res = await fetch(LLM, {
    body: JSON.stringify({
      messages: [
        { content: CAUSAL_EXTRACTION_PROMPT, role: "system" },
        { content: `Passage:\n${passage}`, role: "user" },
      ],
      model: MODEL,
    }),
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 160)}`, served: null, text: null };
  const body = await res.json().catch(() => null) as { choices?: { message?: { content?: string } }[]; model?: string } | null;
  return { error: null, served: body?.model ?? null, text: body?.choices?.[0]?.message?.content ?? null };
}

function parseEdges(text: string | null): RawCausalEdge[] {
  if (!text) return [];
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(json) as { relations?: RawCausalEdge[] };
    return Array.isArray(parsed.relations) ? parsed.relations : [];
  } catch { return []; }
}

const items = (() => {
  const which = process.argv[2] ?? "dev";
  if (which === "challenge") return CAUSAL_CHALLENGE.map((i) => ({ id: i.id, label: i.label, text: i.text, domain: i.domain }));
  const rows = CAUSAL_BENCHMARK.filter((i) => (which === "holdout" ? isHeldOut(i) : !isHeldOut(i)));
  return rows.map((i) => ({ id: i.id, label: i.label, text: i.text, domain: i.source }));
})();
const limit = Number(process.argv[3] ?? items.length);
const run = items.slice(0, limit);

const contains = (h: string, n: string) => normalizeForIdentity(h).includes(normalizeForIdentity(n));
const results: Record<string, unknown>[] = [];
const servedModels = new Set<string>();
let calls = 0;
let errors = 0;

for (const item of run) {
  const call = await extract(item.text);
  calls += 1;
  if (call.served) servedModels.add(call.served);
  if (call.error) { errors += 1; results.push({ error: call.error, id: item.id, label: item.label }); continue; }

  const { rejected, relations } = validateCausalEdges({ passage: item.text, raw: parseEdges(call.text) });
  const expected = EXPECTED_EDGES.find((e) => e.id === item.id)
    ?? (CAUSAL_CHALLENGE.find((c) => c.id === item.id)?.expect
      ? { id: item.id, ...CAUSAL_CHALLENGE.find((c) => c.id === item.id)!.expect! }
      : undefined);

  const row: Record<string, unknown> = {
    domain: item.domain, edges: relations.length, id: item.id, label: item.label,
    rejected: rejected.map((r) => r.reason),
  };
  if (expected && relations.length > 0) {
    const match = relations.find((r) => contains(r.cause.text, expected.cause) && contains(r.effect.text, expected.effect));
    const reversed = relations.find((r) => contains(r.cause.text, expected.effect) && contains(r.effect.text, expected.cause));
    row.endpointsOk = Boolean(match);
    row.reversed = Boolean(reversed) && !match;
    const scored = match ?? reversed ?? relations[0]!;
    row.relationOk = scored.relation === expected.relation;
    row.gotRelation = scored.relation;
    row.negationOk = scored.negated === expected.negated;
    row.gotNegated = scored.negated;
    row.modalityLost = Boolean(expected.qualifier) && !scored.qualifier;
    row.gotQualifier = scored.qualifier ?? null;
  }
  results.push(row);
  process.stderr.write(`${item.id}:${relations.length} `);
}

console.log(JSON.stringify({
  calls, errors, extractionVersion: CAUSAL_EXTRACTION_VERSION,
  requestedModel: MODEL, results, schemaVersion: CAUSAL_SCHEMA_VERSION,
  servedModels: [...servedModels], set: process.argv[2] ?? "dev",
}, null, 1));
